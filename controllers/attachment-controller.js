// controllers/attachment-controller.js
/**
 * 附表解析控制器
 * 使用 OpenAI 解析判決書附表為結構化數據
 */

import OpenAI from 'openai';
import admin from 'firebase-admin';
import { OPENAI_API_KEY } from '../config/environment.js';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * 解析附表（SSE 流式推送）
 */
export async function parseAttachmentStreamController(req, res) {
  const { judgment_id, attachment_text, attachment_title } = req.body;
  const startTime = Date.now();
  
  // 參數驗證
  if (!judgment_id || !attachment_text || !attachment_title) {
    return res.status(400).json({
      success: false,
      error: '缺少必要參數：judgment_id, attachment_text, attachment_title'
    });
  }
  
  console.log(`[Attachment Parser] 收到解析請求: ${judgment_id} - ${attachment_title}`);
  
  // 設置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 緩衝
  
  // 連接中斷檢測
  let completed = false;
  req.on('close', () => {
    if (!completed) {
      console.log(`[Attachment Parser] 客戶端斷開連接: ${judgment_id} - ${attachment_title}`);
    }
  });
  
  try {
    // 發送連接成功消息
    res.write('data: {"type":"connected"}\n\n');
    
    // 1. 檢查 Firestore 快取
    res.write('data: {"type":"progress","message":"檢查快取..."}\n\n');
    
    const cached = await getAttachmentFromFirestore(judgment_id, attachment_title);
    if (cached) {
      const duration = Date.now() - startTime;
      console.log(`[Attachment Parser] 從快取讀取: ${judgment_id} - ${attachment_title}, 耗時 ${duration}ms`);
      res.write(`data: ${JSON.stringify({ type: 'cached', result: cached })}\n\n`);
      completed = true;
      return res.end();
    }
    
    // 2. 調用 OpenAI 解析
    res.write('data: {"type":"progress","message":"AI 正在解析表格結構..."}\n\n');
    
    const parsed = await parseAttachmentWithAI(attachment_text, attachment_title);
    
    // 3. 存入 Firestore
    res.write('data: {"type":"progress","message":"保存到資料庫..."}\n\n');
    await saveAttachmentToFirestore(judgment_id, attachment_title, parsed);
    
    // 4. 返回結果
    const duration = Date.now() - startTime;
    console.log(`[Attachment Parser] 解析完成: ${judgment_id} - ${attachment_title}, 耗時 ${duration}ms`);
    
    res.write(`data: ${JSON.stringify({ type: 'complete', result: parsed })}\n\n`);
    completed = true;
    res.end();
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Attachment Parser] 解析失敗 (耗時 ${duration}ms):`, error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
}

/**
 * 從 Firestore 讀取附表數據
 */
async function getAttachmentFromFirestore(judgmentId, attachmentTitle) {
  try {
    const docRef = admin.firestore().collection('judgmentAttachments').doc(judgmentId);
    const doc = await docRef.get();
    
    if (doc.exists) {
      const data = doc.data();
      return data.attachments?.[attachmentTitle] || null;
    }
    return null;
  } catch (error) {
    console.error('[Firestore] 讀取附表失敗:', error);
    return null;
  }
}

/**
 * 保存附表數據到 Firestore
 */
async function saveAttachmentToFirestore(judgmentId, attachmentTitle, parsedData) {
  try {
    const docRef = admin.firestore().collection('judgmentAttachments').doc(judgmentId);
    
    // 使用 merge 模式，避免覆蓋其他附表
    await docRef.set({
      judgmentId,
      [`attachments.${attachmentTitle}`]: {
        ...parsedData,
        parsedAt: admin.firestore.FieldValue.serverTimestamp(),
        parsedBy: 'gpt-4o-mini',
        version: '1.0'
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log(`[Firestore] 保存附表成功: ${judgmentId} - ${attachmentTitle}`);
  } catch (error) {
    console.error('[Firestore] 保存附表失敗:', error);
    throw error;
  }
}

/**
 * 使用 OpenAI 解析附表
 */
async function parseAttachmentWithAI(attachmentText, attachmentTitle) {
  const prompt = `你是一個專業的表格解析助手。請將以下台灣法院判決書附表解析為結構化的 JSON 格式。

附表內容：
${attachmentText}

請返回以下格式的 JSON：
{
  "title": "附表標題",
  "headers": ["欄位1", "欄位2", "欄位3"],
  "rows": [
    ["資料1-1", "資料1-2", "資料1-3"],
    ["資料2-1", "資料2-2", "資料2-3"]
  ]
}

解析規則：
1. 第一行通常是附表標題（例如：附表一：）
2. 第二行通常包含表頭和所有資料，使用多個空格分隔
3. 資料行使用編號（一、二、三 或 1、2、3）標記每一筆
4. 使用多個連續空格（2個以上）作為欄位分隔符
5. 保持資料的完整性，不要遺漏任何內容
6. 如果無法解析為表格，返回 { "title": "${attachmentTitle}", "headers": [], "rows": [] }

注意：
- 表頭和資料可能在同一行，需要根據編號（一、二、三）來分割
- 每個編號前面的內容是表頭
- 每個編號後面的內容是該行的資料

只返回 JSON，不要其他文字。`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    // 添加原始文字
    result.rawText = attachmentText;
    
    console.log(`[OpenAI] 解析結果: 表頭 ${result.headers?.length || 0} 個, 資料 ${result.rows?.length || 0} 行`);
    
    return result;
  } catch (error) {
    console.error('[OpenAI] 解析失敗:', error);
    throw new Error(`AI 解析失敗: ${error.message}`);
  }
}

