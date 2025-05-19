// services/complaintService.js
import OpenAI from 'openai';
import admin from 'firebase-admin';
import { OPENAI_API_KEY } from '../config/environment.js';
import esClient from '../config/elasticsearch.js';

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// 使用環境變數中的模型名稱或預設為 gpt-4.1
const MODEL_NAME = process.env.OPENAI_MODEL_NAME || 'gpt-4.1-nano';

/**
 * 驗證文本是否為訴狀
 * @param {string} text - 需要驗證的文本前300字
 * @returns {Promise<Object>} 驗證結果
 */
export async function validateComplaintText(text) {
  const prompt = `
請分析以下文本是否符合台灣法律訴狀的形式特徵。訴狀通常包含以下特點：
1. 具有明確的當事人信息（原告、被告）
2. 有清晰的訴訟請求
3. 包含案件事實和法律依據
4. 使用正式的法律用語和結構
5. 結尾處通常有狀書提出日期

請只回答「是」或「否」，不需要任何其他解釋。

文本內容：
${text.substring(0, 300)}
`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 10, // 只需要簡短回答
    });

    const answer = response.choices[0].message.content.trim().toLowerCase();
    
    // 解析回答，檢查是否為「是」
    const isValid = answer.startsWith('是') || 
                   answer.includes('是的') || 
                   answer.includes('符合');
    
    return {
      isValid,
      message: isValid ? 
        '檔案符合訴狀形式' : 
        '檔案不符合訴狀規範，請確認上傳的是標準訴狀格式'
    };
  } catch (error) {
    console.error('OpenAI API 調用錯誤:', error);
    throw new Error('文本驗證服務暫時不可用，請稍後再試');
  }
}

/**
 * 分析訴狀與法官匹配度
 * @param {string} judgeName - 法官姓名
 * @param {string} complaintSummary - 訴狀摘要
 * @returns {Promise<Object>} 分析結果
 */
export async function analyzeJudgeMatch(judgeName, complaintSummary) {
  try {
    // 1. 從Firestore獲取法官資料
    const judgeDoc = await admin.firestore()
      .collection('judges')
      .doc(judgeName)
      .get();
    
    if (!judgeDoc.exists) {
      throw new Error('找不到該法官的資料');
    }
    
    const judgeData = judgeDoc.data();
    
    // 2. 判斷法官資料是否完整
    if (!judgeData.traits || judgeData.traits.length === 0) {
      throw new Error('法官特徵資料不完整，無法進行分析');
    }
    
    // 3. 向OpenAI提交分析請求
    const prompt = `
你是一位專業的法律分析專家。請分析以下訴狀摘要，並評估它與法官${judgeName}的審判風格和關注重點的匹配程度。

法官${judgeName}的特徵和傾向：
${judgeData.traits.map(t => `- ${t.text} (${t.confidence})`).join('\n')}

${judgeData.tendency ? `裁判傾向：
${judgeData.tendency.dimensions.map(d => `- ${d.name}: ${d.value} - ${d.explanation}`).join('\n')}` : ''}

訴狀摘要：
${complaintSummary.substring(0, 1000)}

請提供以下分析：
1. 該訴狀是否包含此法官特別關注的要點
2. 此訴狀的哪些部分與法官的審判風格相符，哪些部分可能需要加強
3. 根據法官的裁判傾向，找出3-5個與此訴狀相關的重點趨勢
4. 基於法官過往判決特點，推薦2-3個可加強的方向

請以JSON格式回答，包含以下字段：
- summary: 總體匹配評估的摘要說明
- judgePreferences: 法官關注重點與訴狀匹配度的陣列，每項包含text(說明文字)、found(是否在訴狀中找到，布林值)、description(詳細說明)
- recommendations: 改進建議陣列，每項為一段改進建議文字
- matchScore: 0-100的整數，表示整體匹配度評分
`;

    const response = await openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7, 
      response_format: { type: "json_object" },
    });

    // 4. 解析並處理AI回應
    let aiResult = {};
    try {
      aiResult = JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('解析AI回應失敗:', error);
      // 提供預設結構，避免中斷
      aiResult = {
        summary: `未能完整解析AI分析結果。本訴狀與${judgeName}法官的審理風格可能存在一定差距。`,
        judgePreferences: [
          { text: "無法確定匹配度", found: false, description: "AI分析過程出現錯誤，無法確定具體匹配項目" }
        ],
        recommendations: ["請確保上傳的訴狀內容完整並重新分析"],
        matchScore: 50
      };
    }
    
    // 5. 獲取相關案例
    const similarCases = await getJudgeSimilarCases(judgeName, complaintSummary);
    
    // 6. 組織完整的回應
    return {
      summary: aiResult.summary || `本訴狀與${judgeName}法官審理風格的匹配程度需要進一步分析。`,
      judgePreferences: aiResult.judgePreferences || [],
      recommendations: aiResult.recommendations || [],
      matchScore: aiResult.matchScore || 50,
      similarCases: similarCases,
      judgeStats: {
        totalCases: judgeData.caseStats?.totalCases || 0,
        winRate: Math.round(judgeData.caseTypeAnalysis?.civil?.plaintiffClaimFullySupportedRate || 0),
        avgAwardRate: Math.round(judgeData.caseTypeAnalysis?.civil?.overallGrantedToClaimRatio || 0)
      }
    };
    
  } catch (error) {
    console.error('分析訴狀與法官匹配度錯誤:', error);
    throw error;
  }
}

/**
 * 獲取法官相關案例
 * @param {string} judgeName - 法官姓名
 * @param {string} complaintSummary - 訴狀摘要
 * @returns {Promise<Array>} 相似案例列表
 */
async function getJudgeSimilarCases(judgeName, complaintSummary) {
  try {
    // 查詢ElasticSearch獲取該法官的相關案例
    // 這裡需與您的ES設置整合，先提供一個框架實現
    
    // 如果有ES客戶端，可以參考以下方式查詢:
    /*
    const response = await esClient.search({
      index: 'search-boooook',
      body: {
        query: {
          bool: {
            must: [
              { match: { "judges": judgeName } },
              { 
                multi_match: {
                  query: complaintSummary.substring(0, 200),
                  fields: ["JTITLE^3", "JFULL", "summary_ai^2"],
                  minimum_should_match: "30%"
                } 
              }
            ]
          }
        },
        _source: ["JID", "JTITLE", "summary_ai", "case_type", "verdict_type", "JDATE"],
        size: 3
      }
    });
    
    const hits = response.hits.hits;
    return hits.map(hit => {
      const source = hit._source;
      return {
        id: source.JID,
        title: source.JTITLE,
        summary: Array.isArray(source.summary_ai) ? source.summary_ai[0] : source.summary_ai,
        cause: source.case_type,
        result: translateVerdictType(source.verdict_type),
        date: formatDate(source.JDATE),
        similarity: Math.round(hit._score * 10) // 根據ES評分計算相似度
      };
    });
    */
    
    // 暫時返回模擬數據
    return [
      {
        id: "109-345",
        title: "台北地方法院 109年度訴字第345號",
        summary: "房屋租賃修繕糾紛，法官判定房東應進行修繕並賠償因漏水導致的損失",
        cause: "租賃糾紛",
        result: "原告勝訴",
        date: "2020-05-12",
        similarity: 87
      },
      {
        id: "111-789",
        title: "台北地方法院 111年度訴字第789號",
        summary: "房屋修繕爭議案件，因缺乏損害因果關係證明，部分訴求被駁回",
        cause: "租賃糾紛",
        result: "原告部分勝訴",
        date: "2022-08-25",
        similarity: 75
      },
      {
        id: "110-456",
        title: "台北地方法院 110年度訴字第456號",
        summary: "因房東未履行修繕義務導致承租人財產損失，法官裁定全額賠償",
        cause: "租賃糾紛",
        result: "原告勝訴",
        date: "2021-03-18",
        similarity: 68
      }
    ];
  } catch (error) {
    console.error('獲取相似案例錯誤:', error);
    // 發生錯誤時返回空數組，避免整個分析失敗
    return [];
  }
}

/**
 * 檢查法官是否存在並返回最近判決資訊
 * @param {string} judgeName - 法官姓名
 * @returns {Promise<Object>} 檢查結果
 */
export async function checkJudgeExists(judgeName) {
  try {
    // 使用Elasticsearch查詢，只取最近一筆判決
    // 這裡使用最基本的查詢，並按日期降序排序，只取一條記錄
    
    // 以下是模擬的ES查詢框架，實際實現時替換

    const response = await esClient.search({
      index: 'search-boooook',
      body: {
        query: {
          match: { "judges": judgeName }
        },
        sort: [
          { "JDATE": { "order": "desc" } }  // 按日期降序排序
        ],
        _source: ["court"],  // 只需要法院信息
        size: 1  // 只取一條記錄
      }
    });
    
    if (response.hits.total.value > 0) {
      // 有記錄，返回存在以及最近判決法院
      const lastCourt = response.hits.hits[0]._source.court || '未知法院';
      return {
        exists: true,
        lastCourt: lastCourt
      };
    } else {
      // 無記錄
      return {
        exists: false
      };
    }

    
    // 為了示範，這裡使用模擬邏輯
    // 在實際實現中，替換為真實的ES查詢
  
    
  } catch (error) {
    console.error('查詢法官存在性錯誤:', error);
    throw new Error('查詢法官資訊時發生錯誤，請稍後再試');
  }
}

/**
 * 將判決結果代碼轉換為可讀文字
 * @param {string} verdictType - 判決結果類型代碼
 * @returns {string} 可讀的判決結果文字
 */
function translateVerdictType(verdictType) {
  const verdictMap = {
    'plaintiff_win': '原告勝訴',
    'defendant_win': '被告勝訴',
    'partial_win': '原告部分勝訴',
    'settlement': '和解',
    'dismiss': '駁回',
    'withdraw': '撤回'
  };
  
  return verdictMap[verdictType] || '其他';
}

/**
 * 格式化日期字串
 * @param {string} dateStr - 日期字串，格式為YYYYMMDD
 * @returns {string} 格式化後的日期字串，格式為YYYY-MM-DD
 */
function formatDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  
  return `${year}-${month}-${day}`;
}