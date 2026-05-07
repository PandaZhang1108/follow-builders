const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 指向 Zara 的中央数据源
const SOURCE_USER = 'zarazhangrui'; 
const BASE_URL = `https://raw.githubusercontent.com/${SOURCE_USER}/follow-builders/main`;

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const FEISHU_WEBHOOK = (process.env.FEISHU_WEBHOOK || '').trim();

async function run() {
    try {
        console.log("1. 获取中央数据源...");
        const [xRes, podRes, blogRes] = await Promise.all([
            axios.get(`${BASE_URL}/feed-x.json`).catch(() => ({ data: { x: [] } })),
            axios.get(`${BASE_URL}/feed-podcasts.json`).catch(() => ({ data: { podcasts: [] } })),
            axios.get(`${BASE_URL}/feed-blogs.json`).catch(() => ({ data: { blogs: [] } }))
        ]);

        const combinedData = {
            x: xRes.data.x || [],
            podcasts: podRes.data.podcasts || [],
            blogs: blogRes.data.blogs || [],
            generatedAt: new Date().toLocaleString()
        };

        const getPrompt = (name) => {
            const p = path.join(__dirname, `../prompts/${name}.md`);
            return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
        };

        const systemPrompt = `
            ${getPrompt('digest-intro')}
            ${getPrompt('summarize-tweets')}
            ${getPrompt('summarize-podcast')}
            ${getPrompt('summarize-blogs')}
            ${getPrompt('translate')}
            【重要修正】：
            1. 每一条推特总结后必须换行并单独列出其 URL 链接。
            2. 必须严格执行中英双语对照。
        `;

        // 【升级点】首选最强推理模型 Pro 版本，减少 URL 幻觉
        const modelsToTry = [
            'gemini-3.1-pro-preview', 
            'gemini-3-flash-preview'
        ];

        let resultText = null;
        for (const model of modelsToTry) {
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
                const response = await axios.post(geminiUrl, {
                    contents: [{ parts: [{ text: `${systemPrompt}\n\n数据：\n${JSON.stringify(combinedData)}` }] }]
                }, { timeout: 120000 });
                
                resultText = response.data.candidates[0].content.parts[0].text;
                if (resultText) break;
            } catch (e) {
                console.log(`${model} 尝试失败，切到备选...`);
            }
        }

        console.log("2. 推送到飞书...");
        await axios.post(FEISHU_WEBHOOK, {
            msg_type: "interactive",
            card: {
                header: { title: { tag: "plain_text", content: "AI Builders Deep Digest (Pro)" }, template: "purple" },
                elements: [{ tag: "markdown", content: resultText }]
            }
        });
        console.log("✅ 完成！");
    } catch (error) {
        console.error("❌ 失败:", error.message);
        process.exit(1);
    }
}
run();
