const axios = require('axios');

const SOURCE_USER = 'zarazhangrui'; 
const BASE_URL = `https://raw.githubusercontent.com/${SOURCE_USER}/follow-builders/main`;
const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
const FEISHU_WEBHOOK = (process.env.FEISHU_WEBHOOK || '').trim();

async function run() {
    try {
        const today = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' });
        
        console.log(`1. 同步数据源 [${today}]...`);
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

        const systemPrompt = `你是一个高级 AI 行业主编。
        【任务】：根据原始数据制作一份《AI 开发者日报》。
        【结构要求】：
        1. **In Brief (头条快讯)**：在开头用 3 句极简的话总结今天最重磅的 3 件事。
        2. **角色定义**：提及人物时，必须采用 "姓名 (职位/背景)" 的格式，例如 "Sam Altman (OpenAI CEO)"。
        3. **中英双语**：严格执行中英双语对照。
        4. **内容细化**：推特动态要详尽，播客和博客提取 3 个深度 Key Takeaways。
        5. **链接闭环**：每个要点后必须换行显示原始 URL。`;

        console.log("2. DeepSeek 正在润色加工...");
        
        const dsResponse = await axios.post("https://api.deepseek.com/chat/completions", {
            model: "deepseek-v4-flash",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `日期：${today}\n原始数据：${JSON.stringify(combinedData)}` }
            ],
            temperature: 0.3
        }, {
            headers: { "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
            timeout: 120000
        });

        const resultText = dsResponse.data.choices[0].message.content;

        console.log("3. 推送飞书卡片...");
        await axios.post(FEISHU_WEBHOOK, {
            msg_type: "interactive",
            card: {
                header: { 
                    title: { tag: "plain_text", content: `📅 AI Builders Digest | ${today}` }, 
                    template: "blue" // 飞书卡片主题色：blue, wathet, turquoise, green, yellow, orange, red, carmine, violet, purple, indigo, grey
                },
                elements: [{ tag: "markdown", content: resultText }]
            }
        });

        console.log("✅ 满血版简报已送达！");
    } catch (error) {
        console.error("❌ 失败:", error.message);
        process.exit(1);
    }
}
run();
