// services/citationQueryService.js
import { getJudgmentDetails } from './judgment.js';

/**
 * 判斷案件類型（民事/刑事/行政）
 * 🔥 關鍵功能：根據當前判決書判斷案件類型，提升查詢準確性和速度
 * 
 * @param {Object} judgementData - 當前判決書數據
 * @returns {string} 'civil' | 'criminal' | 'administrative'
 */
export function determineCaseType(judgementData) {
  if (!judgementData) {
    console.warn('[Citation Query] 判決書數據為空，使用預設值 "civil"');
    return 'civil';
  }

  // 策略 1: 優先使用 stage0_case_type（新版標準化欄位）
  const stage0Type = String(judgementData.stage0_case_type || '').trim().toLowerCase();
  if (stage0Type === 'civil' || stage0Type === '民事') {
    console.log('[Citation Query] 使用 stage0_case_type 判斷為民事');
    return 'civil';
  }
  if (stage0Type === 'criminal' || stage0Type === '刑事') {
    console.log('[Citation Query] 使用 stage0_case_type 判斷為刑事');
    return 'criminal';
  }
  if (stage0Type === 'administrative' || stage0Type === '行政') {
    console.log('[Citation Query] 使用 stage0_case_type 判斷為行政');
    return 'administrative';
  }

  // 策略 2: 使用舊版 case_type 欄位（向下兼容）
  const caseType = String(judgementData.case_type || '').trim();
  if (caseType.startsWith('民事')) {
    console.log('[Citation Query] 使用 case_type 判斷為民事');
    return 'civil';
  }
  if (caseType.startsWith('刑事')) {
    console.log('[Citation Query] 使用 case_type 判斷為刑事');
    return 'criminal';
  }
  if (caseType.startsWith('行政')) {
    console.log('[Citation Query] 使用 case_type 判斷為行政');
    return 'administrative';
  }

  // 策略 3: 從 JFULL 前 200 字判斷（最可靠）
  // 司法院判決書格式：前 200 字內一定會標註「民事」或「刑事」
  const jfullPrefix = String(judgementData.JFULL || '').substring(0, 200);
  if (jfullPrefix.includes('民事')) {
    console.log('[Citation Query] 使用 JFULL 判斷為民事');
    return 'civil';
  }
  if (jfullPrefix.includes('刑事')) {
    console.log('[Citation Query] 使用 JFULL 判斷為刑事');
    return 'criminal';
  }
  if (jfullPrefix.includes('行政')) {
    console.log('[Citation Query] 使用 JFULL 判斷為行政');
    return 'administrative';
  }

  // 策略 4: 從 JCASE（案號）判斷
  const jcase = String(judgementData.JCASE || '').toLowerCase();
  
  // 刑事案件關鍵字
  if (jcase.includes('刑') || jcase.includes('易') || jcase.includes('少') || 
      jcase.includes('訴緝') || jcase.includes('交') || jcase.includes('保安') || 
      jcase.includes('毒') || jcase.includes('懲') || jcase.includes('劾')) {
    console.log('[Citation Query] 使用 JCASE 判斷為刑事');
    return 'criminal';
  }
  
  // 行政案件關鍵字
  if (jcase.includes('訴願') || jcase.includes('公法') || jcase.includes('稅') || 
      jcase.includes('環')) {
    console.log('[Citation Query] 使用 JCASE 判斷為行政');
    return 'administrative';
  }
  
  // 民事案件關鍵字
  if (jcase.includes('訴') || jcase.includes('調') || jcase.includes('家') || 
      jcase.includes('勞') || jcase.includes('選') || jcase.includes('消')) {
    console.log('[Citation Query] 使用 JCASE 判斷為民事');
    return 'civil';
  }

  // 策略 5: 從 JTITLE（案由）判斷
  const title = String(judgementData.JTITLE || '').toLowerCase();
  const criminalKeywords = ['殺人', '傷害', '竊盜', '詐欺', '毒品', '強盜', '妨害'];
  const civilKeywords = ['損害賠償', '給付', '返還', '確認', '撤銷'];
  
  if (criminalKeywords.some(k => title.includes(k))) {
    console.log('[Citation Query] 使用 JTITLE 判斷為刑事');
    return 'criminal';
  }
  if (civilKeywords.some(k => title.includes(k))) {
    console.log('[Citation Query] 使用 JTITLE 判斷為民事');
    return 'civil';
  }

  // 無法判斷，返回預設值
  console.warn('[Citation Query] 無法判斷案件類型，使用預設值 "civil"');
  return 'civil';  // 預設為民事（最常見）
}

/**
 * 案號解析正則表達式集合
 * 支持多種格式的判決書案號
 */
const CITATION_PATTERNS = [
  // 格式 1: 最高法院109年台上字第2908號判決
  {
    pattern: /^(.+?法院)(\d+)年度?(.+?)字第(\d+)號/,
    groups: ['court', 'year', 'category', 'number']
  },
  // 格式 2: 最高法院109年台上字第2908號
  {
    pattern: /^(.+?法院)(\d+)年度?(.+?)字第(\d+)號$/,
    groups: ['court', 'year', 'category', 'number']
  },
  // 格式 3: 109年台上字第2908號判決
  {
    pattern: /^(\d+)年度?(.+?)字第(\d+)號/,
    groups: ['year', 'category', 'number'],
    defaultCourt: '最高法院'
  },
  // 格式 4: 台上字第2908號（缺少年度）
  {
    pattern: /^(.+?)字第(\d+)號/,
    groups: ['category', 'number'],
    requiresManualInput: true
  }
];

/**
 * 解析引用判決文本
 * @param {string} citationText - 如「最高法院109年台上字第2908號判決」
 * @returns {Object|null} { court, year, category, number } 或 null
 */
export function parseCitationText(citationText) {
  if (!citationText || typeof citationText !== 'string') {
    console.error('[Citation Query] 引用判決文本無效:', citationText);
    return null;
  }

  // 清理文本（移除空格、全形轉半形）
  const cleanText = citationText
    .replace(/\s+/g, '')
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));

  console.log('[Citation Query] 清理後的文本:', cleanText);

  // 嘗試每個正則表達式
  for (const { pattern, groups, defaultCourt, requiresManualInput } of CITATION_PATTERNS) {
    const match = cleanText.match(pattern);
    if (match) {
      const result = {};
      groups.forEach((key, index) => {
        result[key] = match[index + 1];
      });
      
      if (defaultCourt) result.court = defaultCourt;
      if (requiresManualInput) result.needsManualInput = true;
      
      console.log('[Citation Query] 解析成功:', result);
      return result;
    }
  }

  // 無法解析
  console.error('[Citation Query] 無法解析案號:', citationText);
  return null;
}

/**
 * 獲取案件類型的中文名稱
 * @param {string} caseType - 'civil' | 'criminal' | 'administrative'
 * @returns {string} '民事' | '刑事' | '行政'
 */
export function getCaseTypeChineseName(caseType) {
  const caseTypeMap = {
    'civil': '民事',
    'criminal': '刑事',
    'administrative': '行政'
  };
  return caseTypeMap[caseType] || '民事';
}

/**
 * 查詢引用判決（主函數）
 * @param {string} citationText - 引用判決文本
 * @param {string} judgementId - 當前判決書 ID
 * @returns {Promise<Object>} { success, url, citation_info, error }
 */
export async function queryCitation(citationText, judgementId) {
  const startTime = Date.now();
  const queryId = `citation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  console.log(`[Citation Query] ${queryId} 開始查詢:`, citationText);
  console.log(`[Citation Query] ${queryId} 當前判決書 ID:`, judgementId);

  try {
    // 1. 解析案號
    const parsedCitation = parseCitationText(citationText);
    if (!parsedCitation) {
      throw new Error('無法解析引用判決案號格式');
    }

    if (parsedCitation.needsManualInput) {
      throw new Error('案號缺少年度信息，無法自動查詢');
    }

    // 2. 獲取當前判決書數據
    console.log(`[Citation Query] ${queryId} 獲取當前判決書數據...`);
    const judgementData = await getJudgmentDetails(judgementId);
    if (!judgementData) {
      throw new Error('無法獲取當前判決書數據');
    }

    // 3. 判斷案件類型
    const caseType = determineCaseType(judgementData);
    const caseTypeChinese = getCaseTypeChineseName(caseType);
    console.log(`[Citation Query] ${queryId} 案件類型: ${caseType} (${caseTypeChinese})`);

    // 4. 構建查詢信息
    const citationInfo = {
      court: parsedCitation.court || '最高法院',
      year: parsedCitation.year,
      category: parsedCitation.category,
      number: parsedCitation.number,
      case_type: caseType,
      case_type_chinese: caseTypeChinese
    };

    console.log(`[Citation Query] ${queryId} 查詢信息:`, citationInfo);

    // 5. TODO: 調用 Chrome MCP Server 查詢
    // 這部分將在下一步實現
    const url = `https://judgment.judicial.gov.tw/FJUD/Default_AD.aspx?jud_year=${citationInfo.year}&jud_case=${citationInfo.category}&jud_no=${citationInfo.number}`;

    const duration = Date.now() - startTime;
    console.log(`[Citation Query] ${queryId} 查詢完成，耗時 ${duration}ms`);

    return {
      success: true,
      url,
      citation_info: citationInfo
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Citation Query] ${queryId} 查詢失敗，耗時 ${duration}ms:`, error.message);

    return {
      success: false,
      error: error.message,
      citation_info: null
    };
  }
}

