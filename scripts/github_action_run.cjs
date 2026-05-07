const axios = require('axios');

const SOURCE_USER = 'zarazhangrui'; 
const BASE_URL = `https://raw.githubusercontent.com/${SOURCE_USER}/follow-builders/main`;
const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
const FEISHU_WEBHOOK = (process.env.FEISHU_WEBHOOK || '').trim();

async function run() {
    try {
        const today = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' });
        
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

        // 核心 Prompt 修改：严禁推特部分出现长段落总结
        const systemPrompt = `你是一个高级 AI 行业主编。
        【格式规范】：
        1. 第一行必须是：AI Builders Digest — ${today}
        2. 必须包含大分类标题，例如：## X / TWITTER
        3. **推特 (X) 规范**：严禁写长篇总结段落。每一条推特仅输出：**[序号]. 姓名 (身份)：单行核心动态标题**。然后在下方紧跟 URL。
        4. **播客/博客规范**：保留中英双语的深度总结（3 个 Key Takeaways）。
        5. 全文保持简洁，视觉上使用 --- 进行分割。`;

        console.log("2. DeepSeek 正在按照新格式润色...");
        
        const dsResponse = await axios.post("https://api.deepseek.com/chat/completions", {
            model: "deepseek-v4-flash",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `原始数据：${JSON.stringify(combinedData)}` }
            ],
            temperature: 0.3
        }, {
            headers: { "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
            timeout: 120000
        });

        const resultText = dsResponse.data.choices[0].message.content;

        console.log("3. 推送飞书蓝版卡片...");
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

        console.log("✅ 格式更新版简报已送达！");
    } catch (error) {
        console.error("❌ 失败:", error.message);
        process.exit(1);
    }
}
run();
