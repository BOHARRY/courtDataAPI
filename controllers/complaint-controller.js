// controllers/complaint-controller.js
import * as complaintService from '../services/complaintService.js';

/**
 * 驗證文本是否為訴狀
 * @param {Request} req - Express 請求對象
 * @param {Response} res - Express 響應對象
 */
export async function validateComplaintText(req, res) {
  try {
    const { text } = req.body;
    
    if (!text || text.length < 50) {
      return res.status(400).json({
        status: 'error',
        message: '文本內容太短或未提供'
      });
    }
    
    const result = await complaintService.validateComplaintText(text);
    
    return res.status(200).json({
      status: 'success',
      isValidComplaint: result.isValid,
      message: result.message
    });
  } catch (error) {
    console.error('驗證訴狀文本錯誤:', error);
    return res.status(500).json({
      status: 'error',
      message: '驗證訴狀文本時發生錯誤',
      error: error.message
    });
  }
}

/**
 * 分析訴狀與法官匹配度
 * @param {Request} req - Express 請求對象
 * @param {Response} res - Express 響應對象
 */
export async function analyzeJudgeMatch(req, res) {
  try {
    const { judgeName, complaintSummary } = req.body;
    
    if (!judgeName || !complaintSummary) {
      return res.status(400).json({
        status: 'error',
        message: '缺少必要參數'
      });
    }
    
    const result = await complaintService.analyzeJudgeMatch(judgeName, complaintSummary);
    
    return res.status(200).json({
      status: 'success',
      ...result
    });
  } catch (error) {
    console.error('分析訴狀與法官匹配度錯誤:', error);
    return res.status(500).json({
      status: 'error',
      message: '分析訴狀與法官匹配度時發生錯誤',
      error: error.message
    });
  }
}