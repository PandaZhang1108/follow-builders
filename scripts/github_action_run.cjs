const axios = require('axios');

const SOURCE_USER = 'zarazhangrui'; 
const BASE_URL = `https://raw.githubusercontent.com/${SOURCE_USER}/follow-builders/main`;
const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
const FEISHU_WEBHOOK = (process.env.FEISHU_WEBHOOK || '').trim();

async function run() {
    try {
        const dateObj = new Date();
        const today = dateObj.toLocaleDateString('en-US', { 
            timeZone: 'Asia/Shanghai', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
        console.log(`1. 同步 Zara 中央数据源 [${today}]...`);
        const [xRes, podRes, blogRes] = await Promise.all([
            axios.get(`${BASE_URL}/feed-x.json`).catch(() => ({ data: { x: [] } })),
            axios.get(`${BASE_URL}/feed-podcasts.json`).catch(() => ({ data: { podcasts: [] } })),
            axios.get(`${BASE_URL}/feed-blogs.json`).catch(() => ({ data: { blogs: [] } }))
        ]);

        const combinedData = {
            tweets: xRes.data.x || [],
            podcasts: podRes.data.podcasts || [],
            blogs: blogRes.data.blogs || []
        };

        // 严格复刻 Zara 的 Prompt 逻辑
        const systemPrompt = `You are a professional AI news editor. Summarize the provided data into a digest.

**CRITICAL RULES**:
1. **NO INTRO OR OUTRO**: Start immediately with the title. Do not say "Here is the summary" or "As an AI analyst".
2. **HEADER**: The very first line must be "AI Builders Digest — ${today}" followed by a full-width horizontal rule "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━".
3. **CATEGORIES**: Use "## X / TWITTER", "## PODCASTS", and "## BLOGS" as section headers.
4. **ENTRY STRUCTURE**: 
   - **Name (Role/Context)**
   - English: [One paragraph summary]
   - Chinese: [对应的中文总结]
   - URL: [Direct link]
5. **SPACING**: Use "---" between entries within a section.
6. **LANGUAGE**: Always provide bilingual content (English followed by Chinese).`;

        console.log("2. DeepSeek 正在进行原厂格式复刻...");
        
        const dsResponse = await axios.post("https://api.deepseek.com/chat/completions", {
            model: "deepseek-v4-flash",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Data: ${JSON.stringify(combinedData)}` }
            ],
            temperature: 0.1 // 极低随机性，确保格式像模子刻出来的一样
        }, {
            headers: { "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
            timeout: 120000
        });

        const resultText = dsResponse.data.choices[0].message.content;

        console.log("3. 推送至飞书卡片...");
        await axios.post(FEISHU_WEBHOOK, {
            msg_type: "interactive",
            card: {
                header: { 
                    title: { tag: "plain_text", content: `📅 AI Builders Digest | ${today}` }, 
                    template: "blue" 
                },
                elements: [{ tag: "markdown", content: resultText }]
            }
        });

        console.log("✅ 完美复刻版简报已推送！");
    } catch (error) {
        console.error("❌ 失败:", error.message);
        process.exit(1);
    }
}
run();
