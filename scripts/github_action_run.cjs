const axios = require('axios');

const SOURCE_USER = 'zarazhangrui'; 
const BASE_URL = `https://raw.githubusercontent.com/${SOURCE_USER}/follow-builders/main`;
const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
const FEISHU_WEBHOOK = (process.env.FEISHU_WEBHOOK || '').trim();

async function run() {
    try {
        console.log("1. 正在同步 Zara 的中央数据源...");
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

        const systemPrompt = `你是一个专业的 AI 行业分析师。
        【任务】：对提供的原始数据进行深度总结。
        【要求】：
        1. 必须采用中英双语对照格式。
        2. 每一条总结后，必须换行显示其原始 URL 链接。
        3. 播客和博客部分请提取核心 Key Takeaways。`;

        console.log("2. 正在请求 DeepSeek-V4-Flash 进行深度加工...");
        
        const dsResponse = await axios.post("https://api.deepseek.com/chat/completions", {
            model: "deepseek-v4-flash", // 2026 旗舰性价比模型
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `原始数据：\n${JSON.stringify(combinedData)}` }
            ],
            temperature: 0.3
        }, {
            headers: { 
                "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
                "Content-Type": "application/json"
            },
            timeout: 120000
        });

        const resultText = dsResponse.data.choices[0].message.content;

        console.log("3. 正在推送至飞书...");
        await axios.post(FEISHU_WEBHOOK, {
            msg_type: "interactive",
            card: {
                header: { title: { tag: "plain_text", content: "🚀 AI Builders Digest (DeepSeek Powered)" }, template: "blue" },
                elements: [{ tag: "markdown", content: resultText }]
            }
        });

        console.log("✅ DeepSeek 版简报推送成功！");
    } catch (error) {
        console.error("❌ 运行异常:", error.response?.data || error.message);
        process.exit(1);
    }
}
run();
