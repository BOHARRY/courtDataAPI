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
 * 自定義錯誤類，包含查詢步驟
 */
class CitationQueryError extends Error {
  constructor(message, querySteps = []) {
    super(message);
    this.name = 'CitationQueryError';
    this.querySteps = querySteps;
  }
}

/**
 * 使用 AI + Chrome MCP 自動查詢判決書
 */
async function queryJudgmentWithAI(citationInfo, queryId, progressCallback) {
  console.log(`[Citation Query] ${queryId} 開始 AI 自動化查詢...`);

  // 進度追蹤
  const querySteps = [];

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
  const systemPrompt = `你是一個瀏覽器自動化助手，專門用於查詢司法院判決書。你**必須**使用工具來完成任務，**不要**只是告訴用戶如何手動操作。

**當前任務**：
查詢判決書：${citationInfo.court} ${citationInfo.year}年${citationInfo.category}字第${citationInfo.number}號
案件類型：${citationInfo.case_type_chinese}（${citationInfo.case_type}）

**可用工具**：
1. navigate_to_url(url) - 訪問網頁
2. get_page_info() - 獲取當前頁面的所有表單元素和連結
3. fill_input(selector, value) - 填寫輸入框
4. select_option(selector, value) - 選擇下拉選單
5. click_element(selector) - 點擊元素（按鈕、連結等）
6. evaluate_script(script) - 執行 JavaScript 代碼

**重要規則**：
- 你**必須**實際執行查詢，而不是告訴用戶怎麼做
- **最重要**：查詢完成後，**只要**給我判決書的網址，**不要**提供摘要或分析
- **不要**重複填寫同一個欄位
- 如果某個操作失敗（例如選擇下拉選單），**跳過它**，繼續下一步
- 格式：最終回覆「判決書網址：https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=...」

**查詢判決書的完整流程**：
1. 使用 navigate_to_url 訪問 https://judgment.judicial.gov.tw/FJUD/Default_AD.aspx

2. 使用 get_page_info 查看頁面上有哪些表單元素（注意它們的 id 和 name）

3. **選擇裁判案件類別**（這一步是可選的）：
   - 案件類型是：${citationInfo.case_type_chinese}
   - 如果是民事，點擊：input[name="jud_sys"][value="V"]
   - 如果是刑事，點擊：input[name="jud_sys"][value="M"]
   - 如果是行政，點擊：input[name="jud_sys"][value="A"]
   - 使用 click_element 工具點擊對應的 checkbox
   - **重要**：如果點擊失敗或超時，**立即跳過**，不要重試，直接進行步驟 4
   - **注意**：頁面說明「未勾選預設為全選」，所以這一步失敗也不影響查詢

4. 根據案號填寫表單（**這是最重要的步驟，必須成功**）：
   - 年度 = ${citationInfo.year}
   - 字別 = ${citationInfo.category}
   - 案號 = ${citationInfo.number}
   - **重要**：使用以下精確的選擇器填寫：
     * 使用 fill_input 填寫 #jud_year，值為 ${citationInfo.year}
     * 使用 fill_input 填寫 #jud_case，值為 ${citationInfo.category}
     * 使用 fill_input 填寫 #jud_no，值為 ${citationInfo.number}
   - **不要**使用 select_option 選擇 #sel_judword（常用字別下拉選單）
   - **不要**填寫 #dy1, #dm1, #dd1（那些是裁判期間，不是裁判字號）
   - **每個欄位只填寫一次，不要重複填寫**
   - **如果填寫失敗，重試一次，如果還是失敗就報錯**

5. 使用 click_element 點擊查詢按鈕：
   - **重要**：使用選擇器 input[type='submit']
   - **不要**使用 #search-btn 或其他 ID（按鈕沒有 ID）
   - 如果點擊失敗，等待 2 秒後重試一次

6. **關鍵步驟**：查詢後，司法院網站會在 iframe 中顯示結果，你**必須**：
   - 使用 evaluate_script 執行以下代碼來獲取 iframe URL：
     "() => { const iframe = document.querySelector('iframe[name=\\"iframe-data\\"]'); if (iframe && iframe.contentWindow) { try { return iframe.contentWindow.location.href; } catch(e) { return iframe.src; } } return null; }"
   - 這會返回一個 URL（可能是 qryresultlst.aspx 或 data.aspx）

7. 使用 navigate_to_url 訪問步驟 6 獲取的 iframe URL

8. 使用 get_page_info 查看頁面內容：
   - 如果頁面上有判決書列表（連結），使用 click_element 點擊第一個判決書連結
   - 如果頁面已經是判決書內容頁面，直接進行下一步

9. 如果點擊了連結，再次使用 evaluate_script 獲取新的 iframe URL（判決書內容頁面）

10. 使用 navigate_to_url 訪問判決書內容頁面的 URL

11. **重要**：向我報告判決書的網址（data.aspx 的完整 URL）
    - **不要**提供判決書的摘要或內容分析
    - **只要**給我判決書的網址連結
    - 格式：「判決書網址：https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=...」
    - **必須**確保 URL 包含 "data.aspx"

**錯誤處理**：
- 如果點擊查詢按鈕失敗，等待 2 秒後使用 input[type='submit'] 重試一次
- 如果 evaluate_script 返回 null，表示 iframe 還沒載入，等待 3 秒後重試
- 如果重試後仍然失敗，報告錯誤：「無法提交查詢，請稍後再試」
- **不要**在沒有獲得有效 URL 的情況下就結束任務

**注意**：
- iframe 中可能先顯示查詢結果列表，需要再點擊一次才能看到判決書內容
- 最終的判決書內容頁面 URL 通常包含 "data.aspx?ty=JD&id="
- 如果某個步驟失敗，不要無限重複嘗試，最多重試 1 次

**開始執行任務！**`;

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

      // 添加最終步驟
      querySteps.push({ message: '查詢完成！', status: 'success', timestamp: Date.now() });
      if (progressCallback) {
        progressCallback(querySteps);
      }

      // 從 AI 回覆中提取 URL
      const content = message.content || '';
      const urlMatch = content.match(/https?:\/\/[^\s]+/);

      if (urlMatch) {
        console.log(`[Citation Query] ${queryId} 返回結果，querySteps 數量:`, querySteps.length);
        console.log(`[Citation Query] ${queryId} querySteps:`, JSON.stringify(querySteps, null, 2));
        return { url: urlMatch[0], querySteps };
      } else {
        throw new CitationQueryError('AI 未返回判決書 URL', querySteps);
      }
    }

    // 執行工具調用
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

      console.log(`[Citation Query] ${queryId} 調用工具: ${toolName}`, toolArgs);

      // 記錄進度步驟（使用專業抽象的描述）
      let stepMessage = '';
      if (toolName === 'navigate_to_url') {
        stepMessage = '正在連接司法院判決書系統...';
      } else if (toolName === 'get_page_info') {
        stepMessage = '正在解析查詢介面...';
      } else if (toolName === 'fill_input') {
        if (toolArgs.selector === '#jud_year') {
          stepMessage = '正在設定查詢條件（年度）...';
        } else if (toolArgs.selector === '#jud_case') {
          stepMessage = '正在設定查詢條件（案件字別）...';
        } else if (toolArgs.selector === '#jud_no') {
          stepMessage = '正在設定查詢條件（案號）...';
        } else {
          stepMessage = '正在設定查詢參數...';
        }
      } else if (toolName === 'click_element') {
        if (toolArgs.selector && toolArgs.selector.includes('submit')) {
          stepMessage = '正在執行判決書檢索...';
        } else if (toolArgs.selector && toolArgs.selector.includes('data.aspx')) {
          stepMessage = '正在載入判決書內容...';
        } else if (toolArgs.selector && toolArgs.selector.includes('jud_sys')) {
          stepMessage = '正在設定案件類別...';
        } else {
          stepMessage = '正在處理查詢請求...';
        }
      } else if (toolName === 'evaluate_script') {
        stepMessage = '正在取得判決書資訊...';
      } else if (toolName === 'select_option') {
        stepMessage = '正在調整查詢選項...';
      } else {
        stepMessage = '正在處理查詢作業...';
      }

      querySteps.push({ message: stepMessage, status: 'loading', timestamp: Date.now() });
      if (progressCallback) {
        progressCallback(querySteps);
      }

      try {
        const result = await callChromeMCPTool(toolName, toolArgs);

        // 更新步驟狀態為成功
        querySteps[querySteps.length - 1].status = 'success';
        if (progressCallback) {
          progressCallback(querySteps);
        }

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
        // 更新步驟狀態為失敗
        querySteps[querySteps.length - 1].status = 'error';
        if (progressCallback) {
          progressCallback(querySteps);
        }

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

  throw new CitationQueryError(`達到最大輪數限制 (${MAX_ITERATIONS})，查詢失敗`, querySteps);
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
    const result = await queryJudgmentWithAI(citationInfo, queryId);
    const url = typeof result === 'string' ? result : result.url;
    const querySteps = typeof result === 'object' ? result.querySteps : [];

    const duration = Date.now() - startTime;
    console.log(`[Citation Query] ${queryId} 查詢完成，耗時 ${duration}ms`);
    console.log(`[Citation Query] ${queryId} 判決書 URL:`, url);

    console.log(`[Citation Query] ${queryId} 最終返回，query_steps 數量:`, querySteps.length);

    return {
      success: true,
      url,
      citation_info: citationInfo,
      query_steps: querySteps
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Citation Query] ${queryId} 查詢失敗，耗時 ${duration}ms:`, error.message);

    // 如果是 CitationQueryError，提取查詢步驟
    const querySteps = error.querySteps || [];

    return {
      success: false,
      error: error.message,
      citation_info: null,
      query_steps: querySteps  // 即使失敗也返回查詢步驟
    };
  }
}

