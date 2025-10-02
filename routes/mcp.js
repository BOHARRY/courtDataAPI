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
 * POST /api/mcp/parse-intent
 * 使用 OpenAI 識別用戶意圖
 */
router.post('/parse-intent', verifyToken, async (req, res) => {
    try {
        const { question, currentJudge } = req.body;

        if (!question) {
            return res.status(400).json({
                error: '缺少問題內容'
            });
        }

        const prompt = `你是法律 AI 助手的意圖識別器。請分析用戶問題並提取結構化參數。

當前上下文:
- 已分析法官: ${currentJudge?.name || '無'}

用戶問題: "${question}"

請以 JSON 格式返回:
{
  "intent": "search_cases" | "analyze_judge" | "compare_judges" | "unknown",
  "judge_name": "法官姓名 (如果問題中沒有提到,使用當前法官)",
  "case_type": "案由關鍵字 (如: 交通、侵權、債務)",
  "verdict_type": "判決結果類型 (如: 原告勝訴、原告敗訴、部分勝訴部分敗訴)",
  "limit": 數量 (預設20),
  "additional_filters": {}
}

案由關鍵字提取規則:
- "交通事故"、"車禍"、"交通" → "交通"
- "侵權行為"、"侵權" → "侵權"
- "債務"、"清償債務" → "債務"
- "詐欺"、"詐騙" → "詐欺"
- "損害賠償" → "損害賠償"
- 如果沒有明確案由,返回 null

判決結果類型提取規則:
- "原告勝訴"、"勝訴" → "原告勝訴"
- "原告敗訴"、"敗訴" → "原告敗訴"
- "部分勝訴"、"部分敗訴" → "部分勝訴部分敗訴"
- "上訴駁回" → "上訴駁回"
- "原判決廢棄" → "原判決廢棄改判"
- 如果沒有明確判決結果,返回 null

意圖判斷規則:
- 如果問題是要搜尋/查看/顯示判決書 → "search_cases"
- 如果問題是要分析新的法官 → "analyze_judge"
- 如果問題是要比較多位法官 → "compare_judges"
- 其他 → "unknown"

只返回 JSON,不要其他文字。`;

        console.log('[MCP] 調用 OpenAI 識別意圖:', question);

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const intent = JSON.parse(completion.choices[0].message.content);

        console.log('[MCP] 意圖識別結果:', intent);

        res.json({
            success: true,
            intent
        });
    } catch (error) {
        console.error('[MCP] 意圖識別失敗:', error);
        res.status(500).json({
            error: '意圖識別失敗',
            details: error.message
        });
    }
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

