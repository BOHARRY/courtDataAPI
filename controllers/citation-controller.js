// controllers/citation-controller.js
import { queryCitation } from '../services/citationQueryService.js';

/**
 * 處理引用判決查詢請求
 * POST /api/citation/query
 * 
 * Request Body:
 * {
 *   "citation_text": "最高法院109年台上字第2908號判決",
 *   "judgement_id": "TPSV,109,台上,2908,20201231"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "url": "https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=...",
 *   "citation_info": {
 *     "court": "最高法院",
 *     "year": "109",
 *     "category": "台上",
 *     "number": "2908",
 *     "case_type": "civil",
 *     "case_type_chinese": "民事"
 *   }
 * }
 */
export async function handleCitationQuery(req, res) {
  const startTime = Date.now();
  
  try {
    const { citation_text, judgement_id } = req.body;

    // 驗證請求參數
    if (!citation_text || typeof citation_text !== 'string') {
      return res.status(400).json({
        success: false,
        error: '缺少或無效的 citation_text 參數'
      });
    }

    if (!judgement_id || typeof judgement_id !== 'string') {
      return res.status(400).json({
        success: false,
        error: '缺少或無效的 judgement_id 參數'
      });
    }

    console.log('[Citation Controller] 收到查詢請求:', {
      citation_text,
      judgement_id,
      user: req.user?.email || 'unknown'
    });

    // 調用查詢服務
    const result = await queryCitation(citation_text, judgement_id);

    const duration = Date.now() - startTime;
    console.log(`[Citation Controller] 查詢完成，耗時 ${duration}ms，成功: ${result.success}`);

    // 返回結果
    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(400).json(result);
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Citation Controller] 查詢異常，耗時 ${duration}ms:`, error);

    return res.status(500).json({
      success: false,
      error: '伺服器內部錯誤',
      details: error.message
    });
  }
}

