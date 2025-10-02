// routes/mcp.js
import express from 'express';
import { verifyToken } from '../middleware/auth.js';
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/environment.js';

const router = express.Router();

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

/**
 * POST /api/mcp/judge-insights
 * 使用 OpenAI 生成法官分析的訴訟建議
 */
router.post('/judge-insights', verifyToken, async (req, res) => {
    try {
        const { judgeData } = req.body;

        if (!judgeData || !judgeData.content) {
            return res.status(400).json({
                error: '缺少法官數據'
            });
        }

        const stats = judgeData.content.statistics || {};
        const verdictDist = stats.verdict_distribution || [];
        const caseDist = stats.case_type_distribution || [];

        // 構建 AI 提示詞
        const prompt = `你是一位資深律師,請根據以下法官的判決統計數據,提供專業的訴訟策略建議。

法官判決統計:
- 總案件數: ${stats.total_cases || 0} 筆

判決結果分布:
${verdictDist.slice(0, 5).map(item => {
    const percentage = ((item.count / stats.total_cases) * 100).toFixed(1);
    return `- ${item.verdict_type}: ${item.count} 筆 (${percentage}%)`;
}).join('\n')}

常見案由:
${caseDist.slice(0, 5).map(item => `- ${item.case_type}: ${item.count} 筆`).join('\n')}

請提供:
1. 該法官的判決傾向分析
2. 針對原告的訴訟建議
3. 針對被告的訴訟建議
4. 需要特別注意的事項

請用繁體中文回應,語氣專業但易懂,約200字內。`;

        console.log('[MCP] 調用 OpenAI 生成法官建議');

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "你是台灣資深律師,專精訴訟策略分析。請提供專業、實用的建議。"
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        const insights = response.choices[0].message.content;

        console.log('[MCP] AI 建議生成成功');

        res.json({
            success: true,
            insights: insights
        });

    } catch (error) {
        console.error('[MCP] 生成 AI 建議失敗:', error);
        res.status(500).json({
            error: 'AI 分析失敗',
            message: error.message
        });
    }
});

export default router;

