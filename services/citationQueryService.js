// services/citationQueryService.js
import { getJudgmentDetails } from './judgment.js';
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/environment.js';

// OpenAI 客戶端
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

// Chrome MCP Server URL
const CHROME_MCP_URL = process.env.CHROME_MCP_URL || 'https://chromemcp.onrender.com/mcp';

// 最大工具調用輪數
const MAX_ITERATIONS = 20;

// MCP Session 管理
let mcpSessionId = null;
let sessionInitTime = null;
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 分鐘過期

/**
 * 檢查 Session 是否有效
 */
function isSessionValid() {
  if (!mcpSessionId || !sessionInitTime) {
    return false;
  }

  const now = Date.now();
  const elapsed = now - sessionInitTime;

  if (elapsed > SESSION_TIMEOUT) {
    console.log('[Citation Query] Session 已過期，需要重新初始化');
    mcpSessionId = null;
    sessionInitTime = null;
    return false;
  }

  return true;
}

/**
 * 初始化 Chrome MCP Session
 */
async function initializeChromeMCPSession(forceReinit = false) {
  // 如果強制重新初始化或 Session 無效，則重新初始化
  if (!forceReinit && isSessionValid()) {
    console.log('[Citation Query] 使用現有 Session:', mcpSessionId);
    return mcpSessionId;
  }

  try {
    console.log('[Citation Query] 初始化 Chrome MCP Session...');

    // 步驟 1: 發送 initialize 請求
    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "lawsowl-citation-query",
          version: "1.0.0"
        }
      }
    };

    const initResponse = await fetch(CHROME_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify(initRequest)
    });

    if (!initResponse.ok) {
      throw new Error(`Chrome MCP 初始化失敗: ${initResponse.status}`);
    }

    // 獲取 Session ID
    mcpSessionId = initResponse.headers.get('Mcp-Session-Id');
    sessionInitTime = Date.now();
    console.log('[Citation Query] Chrome MCP Session 初始化成功:', mcpSessionId);

    // 步驟 2: 發送 initialized 通知 (必須!)
    console.log('[Citation Query] 發送 initialized 通知...');
    const notifyRequest = {
      jsonrpc: "2.0",
      method: "notifications/initialized"
    };

    await fetch(CHROME_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Mcp-Session-Id': mcpSessionId
      },
      body: JSON.stringify(notifyRequest)
    });

    console.log('[Citation Query] initialized 通知發送成功');

    return mcpSessionId;
  } catch (error) {
    console.error('[Citation Query] Chrome MCP 初始化失敗:', error);
    mcpSessionId = null;
    sessionInitTime = null;
    throw error;
  }
}

/**
 * 調用 Chrome MCP 工具
 */
async function callChromeMCPTool(toolName, args) {
  try {
    console.log(`[Citation Query] 調用 Chrome MCP 工具: ${toolName}`);
    console.log(`[Citation Query] 參數:`, JSON.stringify(args, null, 2));

    // 確保 MCP Session 已初始化
    const sessionId = await initializeChromeMCPSession();

    // 構建 MCP 請求
    const mcpRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args
      }
    };

    const response = await fetch(CHROME_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Mcp-Session-Id': sessionId
      },
      body: JSON.stringify(mcpRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Citation Query] Chrome MCP Server 錯誤響應:', errorText);
      throw new Error(`Chrome MCP Server 錯誤: ${response.status}`);
    }

    const text = await response.text();

    // 解析 SSE 格式
    const lines = text.trim().split('\n');
    let data = null;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        data = line.substring(6).trim();
        break;
      }
    }

    if (!data) {
      console.error('[Citation Query] 未找到 data 行，完整響應:', text);
      throw new Error('Chrome MCP Server 未返回數據');
    }

    const result = JSON.parse(data);

    // 提取工具返回的內容
    if (result.result && result.result.content && result.result.content[0]) {
      const content = result.result.content[0].text;
      return JSON.parse(content);
    }

    // 檢查是否有錯誤
    if (result.error) {
      console.error('[Citation Query] Chrome MCP 工具返回錯誤:', result.error);
      throw new Error(`Chrome MCP 工具錯誤: ${result.error.message || JSON.stringify(result.error)}`);
    }

    console.error('[Citation Query] 未預期的響應格式:', result);
    throw new Error('Chrome MCP 工具返回格式錯誤');
  } catch (error) {
    console.error(`[Citation Query] Chrome MCP 工具調用失敗:`, error);
    throw error;
  }
}

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
 * 使用 AI + Chrome MCP 自動查詢判決書
 */
async function queryJudgmentWithAI(citationInfo, queryId) {
  console.log(`[Citation Query] ${queryId} 開始 AI 自動化查詢...`);

  // 定義 Chrome MCP 工具
  const tools = [
    {
      type: 'function',
      function: {
        name: 'navigate_to_url',
        description: '訪問指定的網頁 URL',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: '要訪問的網頁 URL' }
          },
          required: ['url']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_page_info',
        description: '獲取當前頁面的所有表單元素、連結和文本內容',
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fill_input',
        description: '填寫輸入框',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS 選擇器或元素 ID' },
            value: { type: 'string', description: '要填入的值' }
          },
          required: ['selector', 'value']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'select_option',
        description: '選擇下拉選單選項',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS 選擇器或元素 ID' },
            value: { type: 'string', description: '要選擇的選項值' }
          },
          required: ['selector', 'value']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'click_element',
        description: '點擊元素（按鈕、連結、checkbox、radio button 等）',
        parameters: {
          type: 'object',
          properties: {
            selector: { type: 'string', description: 'CSS 選擇器或元素 ID' }
          },
          required: ['selector']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'evaluate_script',
        description: '執行 JavaScript 代碼（用於獲取 iframe URL 等特殊情況）',
        parameters: {
          type: 'object',
          properties: {
            script: { type: 'string', description: '要執行的 JavaScript 代碼' }
          },
          required: ['script']
        }
      }
    }
  ];

  // 構建 System Prompt
  const systemPrompt = `你是一個瀏覽器自動化助手，專門用於查詢司法院判決書。

**當前任務**：
查詢判決書：${citationInfo.court} ${citationInfo.year}年${citationInfo.category}字第${citationInfo.number}號
案件類型：${citationInfo.case_type_chinese}（${citationInfo.case_type}）

**重要規則**：
1. 你**必須**使用工具來完成任務，**不要**只是告訴用戶如何手動操作
2. **最重要**：查詢完成後，**只要**給我判決書的網址，**不要**提供摘要或分析
3. 如果查詢失敗，返回錯誤信息

**查詢流程**：
1. 訪問 https://judgment.judicial.gov.tw/FJUD/Default_AD.aspx
2. 使用 get_page_info 查看頁面表單元素
3. 選擇裁判案件類別（${citationInfo.case_type_chinese}）
4. 填寫表單：年度=${citationInfo.year}, 字別=${citationInfo.category}, 案號=${citationInfo.number}
5. 點擊查詢按鈕
6. 使用 evaluate_script 獲取 iframe URL：
   "() => { const iframe = document.querySelector('iframe[name=\\"iframe-data\\"]'); if (iframe && iframe.contentWindow) { try { return iframe.contentWindow.location.href; } catch(e) { return iframe.src; } } return null; }"
7. 訪問 iframe URL
8. 如果是列表頁面，點擊第一個判決書連結
9. 再次使用 evaluate_script 獲取判決書內容頁面的 URL
10. 返回最終的判決書 URL（data.aspx 的完整 URL）

**開始執行！**`;

  // 初始化對話
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `請查詢判決書：${citationInfo.court} ${citationInfo.year}年${citationInfo.category}字第${citationInfo.number}號` }
  ];

  let turnCount = 0;

  // 多輪工具調用循環
  while (turnCount < MAX_ITERATIONS) {
    turnCount++;
    console.log(`[Citation Query] ${queryId} 第 ${turnCount} 輪 AI 調用`);

    // 調用 OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      tools: tools,
      tool_choice: turnCount === 1 ? 'required' : 'auto'
    });

    const message = response.choices[0].message;
    messages.push(message);

    // 檢查是否有工具調用
    if (!message.tool_calls || message.tool_calls.length === 0) {
      // 沒有工具調用，AI 給出最終回覆
      console.log(`[Citation Query] ${queryId} AI 完成任務`);

      // 從 AI 回覆中提取 URL
      const content = message.content || '';
      const urlMatch = content.match(/https?:\/\/[^\s]+/);

      if (urlMatch) {
        return urlMatch[0];
      } else {
        throw new Error('AI 未返回判決書 URL');
      }
    }

    // 執行工具調用
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

      console.log(`[Citation Query] ${queryId} 調用工具: ${toolName}`, toolArgs);

      try {
        const result = await callChromeMCPTool(toolName, toolArgs);

        // 移除 screenshot 以節省 tokens
        const resultForAI = { ...result };
        if (resultForAI.screenshot) {
          resultForAI.screenshot = '[截圖已移除]';
        }

        messages.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolName,
          content: JSON.stringify(resultForAI)
        });

        console.log(`[Citation Query] ${queryId} 工具執行成功`);
      } catch (error) {
        messages.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolName,
          content: `Error: ${error.message}`
        });

        console.error(`[Citation Query] ${queryId} 工具執行失敗:`, error.message);
      }
    }
  }

  throw new Error(`達到最大輪數限制 (${MAX_ITERATIONS})，查詢失敗`);
}

/**
 * 查詢引用判決（主函數）
 * @param {string} citationText - 引用判決文本
 * @param {string} judgementId - 當前判決書 ID
 * @returns {Promise<Object>} { success, url, citation_info, error }
 */
export async function queryCitation(citationText, judgementId) {
  const startTime = Date.now();
  const queryId = `citation-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

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

    // 5. 使用 AI + Chrome MCP 自動查詢
    const url = await queryJudgmentWithAI(citationInfo, queryId);

    const duration = Date.now() - startTime;
    console.log(`[Citation Query] ${queryId} 查詢完成，耗時 ${duration}ms`);
    console.log(`[Citation Query] ${queryId} 判決書 URL:`, url);

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

