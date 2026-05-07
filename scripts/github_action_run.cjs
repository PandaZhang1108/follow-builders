const axios = require('axios');

// 配置信息
const SOURCE_USER = 'zarazhangrui'; 
const BASE_URL = `https://raw.githubusercontent.com/${SOURCE_USER}/follow-builders/main`;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const FEISHU_WEBHOOK = (process.env.FEISHU_WEBHOOK || '').trim();

async function run() {
    try {
        console.log("1. 正在同步 Zara 的中央数据源（含推特、播客、博客）...");
        // 同时抓取三个维度的内容，确保不漏掉任何播客和 YouTube
        const [xRes, podRes, blogRes] = await Promise.all([
            axios.get(`${BASE_URL}/feed-x.json`).catch(() => ({ data: { x: [] } })),
            axios.get(`${BASE_URL}/feed-podcasts.json`).catch(() => ({ data: { podcasts: [] } })),
            axios.get(`${BASE_URL}/feed-blogs.json`).catch(() => ({ data: { blogs: [] } }))
        ]);

        const combinedData = {
            tweets: xRes.data.x || [],
            podcasts: podRes.data.podcasts || [],
            blogs: blogRes.data.blogs || [],
            date: new Date().toLocaleDateString()
        };

        console.log(`📊 数据捕获：推特(${combinedData.tweets.length}) | 播客(${combinedData.podcasts.length}) | 博客(${combinedData.blogs.length})`);

        const prompt = `
            你是一个专业的 AI 行业分析师。请对以下原始数据进行深度总结。
            
            【核心规则】：
            1. 采用中英双语对照格式输出。
            2. 每一个总结要点后，必须换行显示对应的原始 URL 链接，严禁遗漏链接。
            3. 播客和博客部分请提取出 3 个核心金句（Key Takeaways）。
            
            原始数据如下：
            ${JSON.stringify(combinedData)}
        `;

        // 升级为 3.1 Pro 模型，彻底解决链接幻觉问题
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_API_KEY}`;
        
        console.log("2. 正在请求 Gemini 3.1 Pro 进行深度加工...");
        const response = await axios.post(geminiUrl, {
            contents: [{ parts: [{ text: prompt }] }]
        });

        const resultText = response.data.candidates[0].content.parts[0].text;

        console.log("3. 正在推送至飞书...");
        await axios.post(FEISHU_WEBHOOK, {
            msg_type: "interactive",
            card: {
                header: { title: { tag: "plain_text", content: "🌐 AI Builders Full-Spectrum Digest" }, template: "violet" },
                elements: [{ tag: "markdown", content: resultText }]
            }
        });

        console.log("✅ 满血版简报推送成功！");
    } catch (error) {
        console.error("❌ 运行失败:", error.message);
        process.exit(1);
    }
}
run();
