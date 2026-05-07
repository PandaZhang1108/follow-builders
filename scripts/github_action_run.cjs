const axios = require('axios');

const SOURCE_USER = 'zarazhangrui'; 
const BASE_URL = `https://raw.githubusercontent.com/${SOURCE_USER}/follow-builders/main`;
const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
const FEISHU_WEBHOOK = (process.env.FEISHU_WEBHOOK || '').trim();

async function run() {
    try {
        // 格式化日期为：May 7, 2026
        const today = new Date().toLocaleDateString('en-US', { 
            timeZone: 'Asia/Shanghai', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
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

        // 核心 Prompt：严格控制输出顺序和禁言开场白
        const systemPrompt = `你是一个高级 AI 行业主编。请严格遵守以下排版规范：

1. **禁止开场白**：严禁输出“好的”、“作为分析师”等任何前导文字，直接从标题开始。
2. **置顶标题**：第一行必须是：AI Builders Digest — ${today}，后面紧跟一根分割线。
3. **大类标题**：使用 ## X / TWITTER, ## PODCASTS, ## BLOGS。
4. **单条条目结构**（严格顺序）：
   - **姓名 (身份)**
   - English: [英文总结内容]
   - Chinese: [中文总结内容]
   - URL: [原始链接]
5. **推特规范**：推特仅保留单行核心动态总结，不要写长篇大论。
6. **视觉隔离**：条目之间使用 --- 分割。`;

        console.log("2. DeepSeek 正在执行纯净版排版...");
        
        const dsResponse = await axios.post("https://api.deepseek.com/chat/completions", {
            model: "deepseek-v4-flash",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `数据源：${JSON.stringify(combinedData)}` }
            ],
            temperature: 0.2 // 降低随机性，确保格式稳定
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
                    template: "blue" 
                },
                elements: [{ tag: "markdown", content: resultText }]
            }
        });

        console.log("✅ 纯净版格式推送成功！");
    } catch (error) {
        console.error("❌ 失败:", error.message);
        process.exit(1);
    }
}
run();
