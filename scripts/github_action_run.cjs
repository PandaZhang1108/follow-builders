const axios = require('axios');

const SOURCE_USER = 'zarazhangrui'; 
const BASE_URL = `https://raw.githubusercontent.com/${SOURCE_USER}/follow-builders/main`;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const FEISHU_WEBHOOK = (process.env.FEISHU_WEBHOOK || '').trim();

async function run() {
    try {
        console.log("1. 正在同步中央数据源...");
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

        const prompt = `你是一个专业的 AI 分析师。请对以下数据进行深度总结。
        【要求】：
        1. 中英双语对照。
        2. 每条推特总结后必须换行显示对应的 URL。
        3. 播客和博客提取 3 个核心 Key Takeaways。
        数据内容：${JSON.stringify(combinedData)}`;

        // 【核心修改】定义模型梯队，解决 429 报错
        const modelsToTry = [
            'gemini-3.1-pro-preview',     // 优先求助最强大脑
            'gemini-3-flash-preview',      // 备选，速度快，限流松
            'gemini-3.1-flash-lite-preview' // 最后保底
        ];

        let resultText = null;
        let usedModel = '';

        for (const model of modelsToTry) {
            try {
                console.log(`尝试使用模型: ${model}...`);
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
                
                const response = await axios.post(geminiUrl, {
                    contents: [{ parts: [{ text: prompt }] }]
                }, { timeout: 90000 });

                if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    resultText = response.data.candidates[0].content.parts[0].text;
                    usedModel = model;
                    break; 
                }
            } catch (e) {
                if (e.response?.status === 429) {
                    console.log(`⚠️ 模型 ${model} 暂时忙碌 (429)，2 秒后尝试下一个...`);
                } else {
                    console.log(`❌ ${model} 报错: ${e.message}`);
                }
                await new Promise(res => setTimeout(res, 2000));
            }
        }

        if (!resultText) throw new Error("今日 Gemini API 额度已全部耗尽。");

        console.log(`2. 正在推送至飞书 (由 ${usedModel} 生成)...`);
        await axios.post(FEISHU_WEBHOOK, {
            msg_type: "interactive",
            card: {
                header: { title: { tag: "plain_text", content: `🌐 AI Builders Full Digest (${usedModel})` }, template: "green" },
                elements: [{ tag: "markdown", content: resultText }]
            }
        });
        console.log("✅ 简报发送成功！");
    } catch (error) {
        console.error("❌ 流程异常:", error.message);
        process.exit(1);
    }
}
run();
