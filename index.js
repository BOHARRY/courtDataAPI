import express from 'express'
import cors from 'cors'
import {
  Client
} from '@elastic/elasticsearch'
import dotenv from 'dotenv'
import admin from 'firebase-admin'; // <--- 引入 firebase-admin

dotenv.config()

// --- Firebase Admin SDK 初始化 ---
try {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_JSON environment variable is not set.');
  }
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
  console.error("Error initializing Firebase Admin SDK:", error);
}
// --- 結束 Firebase 初始化 ---

const app = express()
app.use(cors({
  origin: '*', // 允許所有來源，生產環境建議限制特定域名
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

const client = new Client({
  node: process.env.ES_URL,
  auth: {
    apiKey: process.env.ES_API_KEY
  }
})

// --- 中間件：驗證 Firebase ID Token ---
async function verifyToken(req, res, next) {
  // 記錄完整的授權標頭 (僅記錄開頭，避免洩露敏感資訊)
  const authHeader = req.headers.authorization || '';
  console.log("Raw Authorization header (first 20 chars):", authHeader.substring(0, 20));

  // 嘗試提取 token
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!idToken) {
    console.warn("verifyToken: No token provided or invalid format. Header format incorrect.");
    return res.status(401).json({
      error: 'Unauthorized: No token provided or invalid format'
    });
  }

  // 記錄 token 特徵
  console.log("Extracted token length:", idToken.length);
  console.log("Token starts with:", idToken.substring(0, 10));

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    console.log("verifyToken: Token verified for UID:", req.user.uid);
    next();
  } catch (error) {
    console.error('Error verifying token:', error.code, error.message);

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Unauthorized: Token expired'
      });
    } else if (error.code === 'auth/argument-error') {
      return res.status(403).json({
        error: 'Unauthorized: Token format error - ' + error.message
      });
    }

    return res.status(403).json({
      error: `Unauthorized: Token validation failed - ${error.code || 'unknown error'}`
    });
  }
}
// --- 結束中間件 ---

// 搜尋判決書
// --- 修改：/search 路由現在需要驗證 Token 並處理積分 ---
app.get('/search', verifyToken, async (req, res) => { // <--- 添加 verifyToken 中間件
  const userId = req.user.uid; // 從驗證過的 token 中獲取 userId
  const searchFilters = req.query; // 獲取查詢參數
  const {
    page = 1, pageSize = 10
  } = searchFilters; // 解構分頁參數

  // console.log(`[Search Request] User: ${userId}, Filters:`, searchFilters);

  const userDocRef = admin.firestore().collection('users').doc(userId);
  const cost = 1; // 每次搜尋成本

  try {
    let searchResponseData = null; // 用於儲存 ES 搜尋結果

    // --- 使用 Firestore Transaction 處理積分 ---
    await admin.firestore().runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userDocRef);

      if (!userDoc.exists) {
        console.error(`User document not found for UID: ${userId}`);
        // 雖然 Token 有效，但 Firestore 數據缺失，視為內部錯誤
        throw new Error('User data not found.');
      }

      const userData = userDoc.data();
      const currentCredits = userData.credits || 0;
      console.log(`[Transaction] User ${userId} current credits: ${currentCredits}`);

      if (currentCredits < cost) {
        console.warn(`[Transaction] User ${userId} insufficient credits.`);
        // 直接拋出特定錯誤，讓外層 catch 處理並返回 402
        throw new Error('Insufficient credits');
      }

      // 扣除積分
      console.log(`[Transaction] Deducting ${cost} credit(s) from user ${userId}.`);
      transaction.update(userDocRef, {
        credits: admin.firestore.FieldValue.increment(-cost),
        lastSearchedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // --- 執行 Elasticsearch 搜尋 (在 Transaction 內) ---
      console.log(`[Transaction] Performing Elasticsearch search for user ${userId}...`);
      const esQueryBody = buildEsQuery(searchFilters); // 使用輔助函數構建查詢體
      const from = (parseInt(page, 10) - 1) * parseInt(pageSize, 10);

      const esResult = await client.search({
        index: 'search-boooook', // 您的 ES 索引
        from: from,
        size: parseInt(pageSize, 10),
        query: Object.keys(esQueryBody.bool).length > 0 ? esQueryBody : {
          match_all: {}
        },
        aggs: {
          win_reasons: {
            terms: {
              field: 'main_reasons_ai',
              size: 50,
              order: {
                _count: 'asc'
              }
            }
          }
        },
        highlight: {
          fields: {
            JFULL: {
              fragment_size: 60, // 調整為更合適的長度，確保可以包含前後約20個字
              number_of_fragments: 2, // 增加到3個片段，顯示更多匹配內容
              pre_tags: ["<em>"], // 高亮標籤開始
              post_tags: ["</em>"] // 高亮標籤結束
            },
            summary_ai: {
              fragment_size: 150,
              number_of_fragments: 1,
              pre_tags: ["<em>"],
              post_tags: ["</em>"]
            }
          }
        },
        sort: [{
          '_score': 'desc'
        }, {
          'JDATE': 'desc'
        }]
      });

      // --- 格式化結果並暫存 ---
      searchResponseData = formatEsResponse(esResult, pageSize); // 使用輔助函數格式化
      console.log(`[Transaction] Elasticsearch search successful for user ${userId}.`);

      // 注意：不在 transaction 內部發送 res.json()
    });
    // --- Transaction 結束 ---

    // Transaction 成功後，發送儲存的結果
    if (searchResponseData) {
      console.log(`[Search Success] Sending results to user ${userId}.`);
      res.status(200).json(searchResponseData);
    } else {
      // 如果 transaction 成功但 searchResponseData 是空的 (理論上不該發生)
      console.error(`[Search Error] Transaction succeeded but no search response for user ${userId}.`);
      res.status(500).json({
        error: 'Internal server error after search.'
      });
    }

  } catch (error) {
    console.error(`[Search Error] User: ${userId}, Error:`, error);
    // 處理積分不足的錯誤
    if (error.message === 'Insufficient credits') {
      // 嘗試讀取一次最新的積分（可能已被其他操作改變）
      try {
        const userDoc = await userDocRef.get();
        const currentCredits = userDoc.exists() ? (userDoc.data().credits || 0) : 0;
        return res.status(402).json({
          error: '您的積分不足，請購買積分或升級方案。',
          required: cost,
          current: currentCredits
        });
      } catch (readError) {
        console.error("Failed to read current credits after insufficient credits error:", readError);
        return res.status(402).json({
          error: '您的積分不足，請購買積分或升級方案。'
        });
      }
    }
    // 處理用戶數據找不到的錯誤
    if (error.message === 'User data not found.') {
      return res.status(404).json({
        error: '找不到您的用戶資料，請嘗試重新登入。'
      });
    }
    // 其他伺服器錯誤
    res.status(500).json({
      error: '搜尋時發生伺服器內部錯誤。'
    });
  }
});
// --- 結束修改 /search 路由 ---


// --- 輔助函數：構建 ES 查詢 (需要您根據之前的邏輯實現) ---
function buildEsQuery(filters) {
  const {
    query,
    caseTypes,
    verdict,
    laws,
    courtLevels,
    minAmount,
    maxAmount,
    reasoningStrength,
    complexity,
    winReasons,
    onlyWithFullText,
    includeCitedCases,
    onlyRecent3Years
  } = filters;

  const must = [];
  const filter = [];

  if (query) {
    // 檢查是否是精確匹配查詢（被雙引號包圍）
    if (query.startsWith('"') && query.endsWith('"')) {
      // 移除引號
      const exactPhrase = query.slice(1, -1);
      console.log("精確匹配查詢:", exactPhrase);

      must.push({
        bool: {
          should: [
            // 在多個欄位中進行短語匹配
            {
              match_phrase: {
                "JFULL": {
                  query: exactPhrase,
                  boost: 5.0
                }
              }
            }, {
              match_phrase: {
                "summary_ai": {
                  query: exactPhrase,
                  boost: 4.0
                }
              }
            }, {
              match_phrase: {
                "lawyers": {
                  query: exactPhrase,
                  boost: 8.0
                }
              }
            }, {
              match_phrase: {
                "judges": {
                  query: exactPhrase,
                  boost: 8.0
                }
              }
            }, {
              match_phrase: {
                "plaintiff": {
                  query: exactPhrase,
                  boost: 3.0
                }
              }
            }, {
              match_phrase: {
                "defendant": {
                  query: exactPhrase,
                  boost: 3.0
                }
              }
            }
          ],
          minimum_should_match: 1
        }
      });
    } else {
      // 原有的普通搜索邏輯
      must.push({
        multi_match: {
          query,
          fields: [
            'JFULL^3',
            'summary_ai^2',
            'main_reasons_ai^2',
            'JTITLE',
            'tags',
            'lawyers^4', // 給律師欄位更高權重
            'lawyers.raw^8', // 給原始欄位更高權重
            'winlawyers^4',
            'judges^4',
            'judges.raw^8' // 給原始欄位更高權重
          ],
          type: 'best_fields',
          operator: 'and'
        }
      });
    }
  }
  if (caseTypes) filter.push({
    terms: {
      'case_type': caseTypes.split(',')
    }
  });
  if (verdict && verdict !== '不指定') filter.push({
    term: {
      'verdict': verdict
    }
  });
  if (laws) laws.split(',').forEach(law => must.push({
    match: {
      'legal_basis': law
    }
  }));
  if (courtLevels) {
    /* ... 法院層級邏輯 ... */
    const levels = courtLevels.split(',');
    const courtQuery = {
      bool: {
        should: []
      }
    };
    levels.forEach(level => {
      if (level === '地方法院') courtQuery.bool.should.push({
        match_phrase: {
          court: '簡易'
        }
      }, {
        match_phrase: {
          court: '地方法'
        }
      });
      else if (level === '高等法院') courtQuery.bool.should.push({
        match_phrase: {
          court: '高等'
        }
      });
      else if (level === '最高法院') courtQuery.bool.should.push({
        match_phrase: {
          court: '最高'
        }
      });
      else if (level === '智慧財產及商業法院') courtQuery.bool.should.push({
        match_phrase: {
          court: '智慧財產'
        }
      });
    });
    if (courtQuery.bool.should.length > 0) filter.push(courtQuery);
  }
  if (minAmount || maxAmount) {
    /* ... 金額範圍邏輯 ... */
    const rangeQuery = {};
    if (minAmount) rangeQuery.gte = parseInt(minAmount);
    if (maxAmount) rangeQuery.lte = parseInt(maxAmount);
    filter.push({
      range: {
        'compensation_claimed': rangeQuery
      }
    });
  }
  if (reasoningStrength) filter.push({
    term: {
      'outcome_reasoning_strength': reasoningStrength
    }
  });
  if (complexity) {
    /* ... 複雜度邏輯 ... */
    let minScore, maxScore;
    if (complexity.includes('簡單')) {
      minScore = 1;
      maxScore = 2;
    } else if (complexity.includes('普通')) {
      minScore = 3;
      maxScore = 5;
    } else if (complexity.includes('複雜')) {
      minScore = 6;
      maxScore = 9;
    }
    if (minScore && maxScore) filter.push({
      range: {
        'SCORE': {
          gte: minScore,
          lte: maxScore
        }
      }
    });
  }
  if (winReasons) must.push({
    terms: {
      'main_reasons_ai': winReasons.split(',')
    }
  });
  if (onlyWithFullText === 'true') filter.push({
    exists: {
      'field': 'JFULL'
    }
  });
  if (includeCitedCases === 'true') must.push({
    bool: {
      should: [{
        exists: {
          'field': 'citations'
        }
      }, {
        range: {
          'cited_cases_count': {
            gte: 1
          }
        }
      }]
    }
  }); // 修正 range 條件
  if (onlyRecent3Years === 'true') {
    /* ... 近三年邏輯 ... */
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const dateNum = threeYearsAgo.getFullYear() * 10000 + (threeYearsAgo.getMonth() + 1) * 100 + threeYearsAgo.getDate();
    filter.push({
      range: {
        'JDATE_num': {
          gte: dateNum
        }
      }
    }); // 假設您有 JDATE_num 欄位
  }

  const esQuery = {
    bool: {}
  };
  if (must.length > 0) esQuery.bool.must = must;
  if (filter.length > 0) esQuery.bool.filter = filter;

  return esQuery;
}
// --- 結束輔助函數 ---

// --- 輔助函數：格式化 ES 回應 ---
function formatEsResponse(esResult, pageSize) {
  // 診斷日誌，檢查 Elasticsearch 返回結果
  console.log("===== Debug: Elasticsearch 搜尋結果 =====");
  console.log("總結果數:", esResult.hits.total.value);
  console.log("返回結果數量:", esResult.hits.hits.length);

  // 檢查是否有高亮片段
  let foundHighlights = false;
  if (esResult.hits.hits.length > 0) {
    const firstHit = esResult.hits.hits[0];
    console.log("第一個結果包含高亮嗎?", !!firstHit.highlight);

    if (firstHit.highlight && firstHit.highlight.JFULL) {
      console.log("JFULL 高亮片段數量:", firstHit.highlight.JFULL.length);
      console.log("第一個高亮片段樣本:", firstHit.highlight.JFULL[0].substring(0, 100));
      foundHighlights = true;
    } else {
      console.log("沒有找到 JFULL 高亮片段");
    }
  }

  // 處理搜尋結果
  const hits = esResult.hits.hits.map((hit, index) => {
    const source = hit._source || {};
    const highlight = hit.highlight || {};
    const processedItem = {
      id: hit._id,
      ...source,
      // 確保始終有這些欄位，即使為空
      JFULL_highlights: [],
      summary_ai_highlight: null
    };

    // 收集判決全文高亮片段
    if (highlight.JFULL && highlight.JFULL.length > 0) {
      processedItem.JFULL_highlights = highlight.JFULL;
      if (index === 0) console.log(`處理結果 #${index}: 添加了 ${highlight.JFULL.length} 個 JFULL 高亮片段`);
    }

    // 收集摘要高亮
    if (highlight.summary_ai && highlight.summary_ai.length > 0) {
      processedItem.summary_ai_highlight = highlight.summary_ai[0];
      if (index === 0) console.log(`處理結果 #${index}: 添加了摘要高亮`);
    }

    return processedItem;
  });

  // 最終檢查
  const resultsWithHighlights = hits.filter(hit => hit.JFULL_highlights && hit.JFULL_highlights.length > 0).length;
  console.log(`處理完成: ${resultsWithHighlights}/${hits.length} 個結果包含高亮片段`);

  // 返回格式化的結果
  return {
    total: esResult.hits.total.value,
    hits: hits,
    totalPages: Math.ceil(esResult.hits.total.value / pageSize),
    aggregations: {
      win_reasons: esResult.aggregations?.win_reasons?.buckets || []
    }
  };
}
// --- 結束輔助函數 ---

// 獲取單一判決詳情
app.get('/judgment/:id', async (req, res) => {
  try {
    const result = await client.get({
      index: 'search-boooook',
      id: req.params.id
    })

    res.json(result._source)
  } catch (e) {
    console.error('獲取判決詳情錯誤:', e)
    res.status(500).json({
      error: e.message
    })
  }
})

// 獲取篩選選項資料（供前端動態生成篩選器使用）
app.get('/filters', async (req, res) => {
  try {
    const aggregations = await client.search({
      index: 'search-boooook',
      size: 0,
      aggs: {
        case_types: {
          terms: {
            field: 'case_type.keyword',
            size: 50
          }
        },
        court_levels: {
          terms: {
            field: 'court.keyword',
            size: 20
          }
        },
        verdicts: {
          terms: {
            field: 'verdict.keyword',
            size: 10
          }
        },
        reasoning_strengths: {
          terms: {
            field: 'outcome_reasoning_strength.keyword',
            size: 10
          }
        }
      }
    })

    const filters = {
      caseTypes: aggregations.aggregations.case_types.buckets.map(b => b.key),
      courtLevels: aggregations.aggregations.court_levels.buckets.map(b => b.key),
      verdicts: aggregations.aggregations.verdicts.buckets.map(b => b.key),
      reasoningStrengths: aggregations.aggregations.reasoning_strengths.buckets.map(b => b.key)
    }

    res.json(filters)
  } catch (e) {
    console.error('獲取篩選選項錯誤:', e)
    res.status(500).json({
      error: e.message
    })
  }
})

// 以下是要添加到 index.js 中的內容
// 確保在index.js中分析案件類型的分佈數據
app.get('/api/lawyers/:name/cases-distribution', verifyToken, async (req, res) => {
  const lawyerName = req.params.name;
  const userId = req.user.uid;
  const analysisCost = 1; // 消耗1積分

  console.log(`[律師案件分佈] 用戶 ${userId} 請求律師: ${lawyerName} 的案件分佈`);

  try {
    // 假設我們已經在API中有這些數據
    const distribution = {
      caseTypes: {
        labels: ['民事租賃', '工程款請求', '侵權行為', '債務請求', '其他'],
        values: [25, 18, 15, 12, 30]
      }
    };

    res.status(200).json(distribution);
  } catch (error) {
    console.error(`[案件分佈錯誤]`, error);
    res.status(500).json({
      error: '獲取案件分佈失敗'
    });
  }
});

const criminalKeywordsTitle = ['違反', '妨害', '殺人', '傷害', '竊盜', '詐欺', '貪污', '瀆職', '偽造文書', '毒品', '槍砲', '公共危險', '過失致死', '背信'];
const civilKeywordsTitle = ['給付', '返還', '確認', '分割', '所有權', '抵押權', '租賃', '買賣', '承攬', '工程款', '醫療疏失', '離婚', '繼承', '監護', '票據', '債務不履行', '侵權行為損害賠償'];

function getMainType(source) {
  const caseType = (source.case_type || '').toLowerCase();
  const court = (source.court || '').toLowerCase();
  const jtitle = (source.JTITLE || '').toLowerCase();
  const jcase = (source.JCASE || '').toLowerCase();

  if (caseType.includes('行政') || court.includes('行政法院') || ((jtitle.includes('稅') || jtitle.includes('徵收') || jtitle.includes('處分')) && !jtitle.includes('民事'))) {
    return 'administrative';
  }
  if (caseType.includes('刑事') || court.includes('刑事庭') || criminalKeywordsTitle.some(kw => jtitle.includes(kw) && !civilKeywordsTitle.some(cKw => jtitle.includes(cKw)))) {
    // 確保不是附帶民事訴訟被誤判
    if (jcase.startsWith('刑附民')) return 'civil'; // 刑事附帶民事，我們可能關注其民事結果
    return 'criminal';
  }
  if (jcase.startsWith('刑') || jcase.startsWith('少刑')) return 'criminal';

  if (caseType.includes('民事') || caseType.includes('家事') || court.includes('民事庭') || court.includes('家事法庭') || court.includes('簡易庭') || civilKeywordsTitle.some(kw => jtitle.includes(kw))) {
    return 'civil';
  }
  if (jcase.startsWith('行')) return 'administrative';

  const civilJcaseChars = ['民', '家', '訴', '執', '全', '抗', '促', '裁', '督', '易', '簡'];
  if (civilJcaseChars.some(char => jcase.includes(char) && !jcase.startsWith('刑') && !jcase.startsWith('行'))) {
    return 'civil';
  }

  console.warn(`[getMainType] Unidentifiable case type for JID: ${source.JID}, JTITLE: ${jtitle}, JCASE: ${jcase}, case_type: ${caseType}, court: ${court}. Defaulting to 'unknown'.`);
  return 'unknown'; // 改為 'unknown'
}

// --- 輔助函數：獲取詳細判決結果 (基於 lawyerperformance) ---

function getDetailedResult(perfVerdictText, mainType, sourceForContext, lawyerPerfObject) {
  // 預設 outcomeCode 和 description
  let outcomeCode = `${mainType.toUpperCase()}_OTHER_UNKNOWN_COUNT`; // 例如 CIVIL_OTHER_UNKNOWN_COUNT
  let description = perfVerdictText || sourceForContext.verdict || sourceForContext.verdict_type || '結果資訊不足';

  const pv = (perfVerdictText || "").toLowerCase(); // lawyerperformance.verdict (小寫)

  const isRulingCase =
    sourceForContext.is_ruling === "是" ||
    sourceForContext.is_ruling === true ||
    (sourceForContext.JCASE || '').toLowerCase().includes("裁") ||
    (sourceForContext.JCASE || '').toLowerCase().includes("抗") ||
    (sourceForContext.JCASE || '').toLowerCase().includes("聲") ||
    (sourceForContext.JTITLE || '').toLowerCase().includes("裁定");

  const isProceduralFromPerf = lawyerPerfObject ? (lawyerPerfObject.is_procedural === true || lawyerPerfObject.is_procedural === 'true') : false;
  const sideFromPerf = lawyerPerfObject ? (lawyerPerfObject.side || 'unknown').toLowerCase() : 'unknown';

  // 1. 首先處理 lawyerperformance 中明確標記為 is_procedural 的情況，或者 verdict 文本本身就是 "程序性裁定"
  if (isProceduralFromPerf || pv.includes("程序性裁定") || pv.includes("procedural")) {
    // 特殊的程序性 "有罪" 描述 (主要針對刑事裁定)
    if (mainType === 'criminal' &&
      (pv.includes("有罪且符合預期(刑度與求刑相當，但本案為程序性羈押延長)") ||
        pv.includes("有罪且符合預期(刑度與求刑相當，但此為程序性裁定，基於犯罪嫌疑重大延長限制)") ||
        pv.includes("有罪且符合預期(刑度與求刑相當,但本案為程序性裁定,無具體刑度)"))) {
      outcomeCode = 'CRIMINAL_RULING_UNFAVORABLE_COUNT'; // 不利的程序性裁定
    } else {
      outcomeCode = 'PROCEDURAL_COUNT'; // 通用的程序性統計碼 (確保 create...Stats 裡有這個)
    }
  }
  // 2. 處理和解或撤訴 (主要針對民事，行政也可能有和解)
  else if (pv.includes("和解") || pv.includes("調解成立")) {
    outcomeCode = 'OTHER_SETTLEMENT_COUNT'; // 統一歸類到和解/其他
  } else if (mainType === 'civil' && pv.includes("撤訴")) {
    outcomeCode = 'OTHER_SETTLEMENT_COUNT'; // 民事撤訴也歸入和解/其他
  }
  // 3. --- 實體結果判斷 (基於 lawyerperformance.verdict) ---
  else if (perfVerdictText) { // 只有在 lawyerperformance.verdict 有值時才進行後續的實體判斷
    if (mainType === 'civil') {
      if (sideFromPerf === 'plaintiff') { // 律師是原告方
        if (pv.includes("原告: 完全勝訴") && !pv.includes("被告")) outcomeCode = 'WIN_FULL_COUNT';
        else if (pv.includes("原告: 大部分勝訴")) outcomeCode = 'WIN_FULL_COUNT';
        else if (pv.includes("原告: 部分勝訴") || pv.includes("原告: 小部分勝訴")) outcomeCode = 'WIN_PARTIAL_COUNT';
        else if (pv.includes("原告: 完全敗訴") && !pv.includes("被告:")) outcomeCode = 'LOSE_FULL_COUNT';
        else if (pv.includes("原告: 完全勝訴") && pv.includes("被告: 完全敗訴")) outcomeCode = 'WIN_FULL_COUNT';
        else if (pv.includes("原告: 部分勝訴") && (pv.includes("被告: 部分減免") || pv.includes("被告: 小部分減免") || pv.includes("被告: 完全敗訴"))) outcomeCode = 'WIN_PARTIAL_COUNT';
        else if (pv.includes("原告: 完全敗訴") && pv.includes("被告: 完全勝訴")) outcomeCode = 'LOSE_FULL_COUNT';
        else if (isRulingCase && (pv.includes("准許") || pv.includes("准予") || pv.includes("抗告有理由"))) outcomeCode = 'WIN_FULL_COUNT'; // 裁定有利
        else if (isRulingCase && (pv.includes("駁回聲請") || pv.includes("抗告無理由"))) outcomeCode = 'LOSE_FULL_COUNT'; // 裁定不利
        else if (pv.startsWith("完全勝訴") || pv.startsWith("大部分勝訴")) outcomeCode = 'WIN_FULL_COUNT';
        else if (pv.startsWith("部分勝訴") || pv.startsWith("小部分勝訴")) outcomeCode = 'WIN_PARTIAL_COUNT';
        else if (pv.startsWith("完全敗訴")) outcomeCode = 'LOSE_FULL_COUNT';
        else if (pv.includes("n/a") || pv.includes("未明確記載")) outcomeCode = 'OTHER_UNKNOWN_COUNT';
        else outcomeCode = 'OTHER_UNKNOWN_COUNT'; // 民事原告，未匹配
      } else if (sideFromPerf === 'defendant') { // 律師是被告方
        if (pv.includes("被告: 完全勝訴") && !pv.includes("原告:")) outcomeCode = 'WIN_FULL_COUNT';
        else if (pv.includes("被告: 大部分減免")) outcomeCode = 'WIN_FULL_COUNT';
        else if (pv.includes("被告: 部分減免") || pv.includes("被告: 小部分減免")) outcomeCode = 'WIN_PARTIAL_COUNT';
        else if (pv.includes("被告: 完全敗訴") && !pv.includes("原告:")) outcomeCode = 'LOSE_FULL_COUNT';
        else if (pv.includes("被告: 完全勝訴") && pv.includes("原告: 完全敗訴")) outcomeCode = 'WIN_FULL_COUNT';
        else if ((pv.includes("被告: 部分減免") || pv.includes("被告: 小部分減免")) && pv.includes("原告: 部分勝訴")) outcomeCode = 'WIN_PARTIAL_COUNT';
        else if (pv.includes("被告: 完全敗訴") && pv.includes("原告: 完全勝訴")) outcomeCode = 'LOSE_FULL_COUNT';
        else if (isRulingCase && (pv.includes("駁回聲請") || pv.includes("抗告無理由"))) outcomeCode = 'WIN_FULL_COUNT'; // 對方聲請被駁 = 被告有利
        else if (isRulingCase && (pv.includes("准許") || pv.includes("准予") || pv.includes("抗告有理由"))) outcomeCode = 'LOSE_FULL_COUNT'; // 對方聲請獲准 = 被告不利
        else if (pv.startsWith("完全勝訴") || pv.startsWith("大部分減免")) outcomeCode = 'WIN_FULL_COUNT';
        else if (pv.startsWith("部分減免") || pv.startsWith("小部分減免")) outcomeCode = 'WIN_PARTIAL_COUNT';
        else if (pv.startsWith("完全敗訴")) outcomeCode = 'LOSE_FULL_COUNT';
        else if (pv.includes("n/a") || pv.includes("未明確記載")) outcomeCode = 'OTHER_UNKNOWN_COUNT';
        else outcomeCode = 'OTHER_UNKNOWN_COUNT'; // 民事被告，未匹配
      } else { // side 未知或雙方代理
        outcomeCode = 'OTHER_UNKNOWN_COUNT';
      }
    } else if (mainType === 'criminal') {
      if (sideFromPerf === 'defendant' || sideFromPerf === '辯護人') { // 刑事主要關注被告
        if (isRulingCase) {
          if (pv.includes("准予交保") || pv.includes("停止羈押")) outcomeCode = 'CRIMINAL_RULING_FAVORABLE_COUNT';
          else if (pv.includes("羈押") || pv.includes("駁回交保")) outcomeCode = 'CRIMINAL_RULING_UNFAVORABLE_COUNT';
          else outcomeCode = 'OTHER_UNKNOWN_COUNT';
        } else { // 刑事判決
          if (pv.includes("無罪")) outcomeCode = 'CRIMINAL_ACQUITTED_COUNT';
          else if (pv.includes("有罪但顯著減輕")) outcomeCode = 'CRIMINAL_GUILTY_FAVORABLE_COUNT';
          else if (pv.includes("有罪但略微減輕")) outcomeCode = 'CRIMINAL_GUILTY_FAVORABLE_COUNT';
          else if (pv.includes("緩刑")) outcomeCode = 'CRIMINAL_GUILTY_PROBATION_COUNT';
          else if (pv.includes("得易科罰金")) outcomeCode = 'CRIMINAL_GUILTY_FAVORABLE_COUNT';
          else if (pv.includes("罰金") && !(pv.includes("有期徒刑") || pv.includes("拘役"))) outcomeCode = 'CRIMINAL_GUILTY_FAVORABLE_COUNT';
          else if (pv.includes("有罪且加重")) outcomeCode = 'CRIMINAL_GUILTY_UNFAVORABLE_COUNT';
          else if (pv.includes("有罪且符合預期") || pv.includes("有罪依法量刑") || (pv.includes("有罪") && !pv.includes("減輕") && !pv.includes("緩刑"))) outcomeCode = 'CRIMINAL_GUILTY_UNFAVORABLE_COUNT';
          else if ((sourceForContext.verdict_type || '').toLowerCase().includes("免訴")) outcomeCode = 'CRIMINAL_PROCEDURAL_COUNT'; // 改為通用的 PROCEDURAL_COUNT
          else if ((sourceForContext.verdict_type || '').toLowerCase().includes("不受理")) outcomeCode = 'CRIMINAL_PROCEDURAL_COUNT'; // 改為通用的 PROCEDURAL_COUNT
          else outcomeCode = 'OTHER_UNKNOWN_COUNT';
        }
      } else { // 刑事案件但律師不是被告方
        outcomeCode = 'OTHER_UNKNOWN_COUNT';
      }
      if (pv.includes("n/a") || pv.includes("未明確記載")) outcomeCode = 'OTHER_UNKNOWN_COUNT';

    } else if (mainType === 'administrative') {
      if (sideFromPerf === 'plaintiff' || role === '聲請人代理人') { // 行政通常關注原告(人民)
        if (isRulingCase) {
          if (pv.includes("准予停止執行")) outcomeCode = 'ADMIN_RULING_FAVORABLE_COUNT';
          else if (pv.includes("駁回停止執行")) outcomeCode = 'ADMIN_RULING_UNFAVORABLE_COUNT';
          else outcomeCode = 'OTHER_UNKNOWN_COUNT';
        } else { // 行政判決
          if (pv.includes("撤銷原處分") && !(pv.includes("部分") || pv.includes("一部"))) outcomeCode = 'ADMIN_WIN_FULL_COUNT';
          else if (pv.includes("部分撤銷原處分") || pv.includes("一部撤銷")) outcomeCode = 'ADMIN_WIN_PARTIAL_COUNT';
          else if (pv.includes("駁回訴訟") || pv.includes("訴願駁回")) outcomeCode = 'ADMIN_LOSE_COUNT';
          else if (pv.includes("義務訴訟勝訴")) outcomeCode = 'ADMIN_WIN_OBLIGATION_COUNT';
          else outcomeCode = 'OTHER_UNKNOWN_COUNT';
        }
      } else { // 行政案件但律師不是原告方
        outcomeCode = 'OTHER_UNKNOWN_COUNT';
      }
      if (pv.includes("n/a") || pv.includes("未明確記載")) outcomeCode = 'OTHER_UNKNOWN_COUNT';
    }
  } // end if (perfVerdictText)
  // 如果 perfVerdictText 為空，或者經過上面邏輯 outcomeCode 仍是初始的 UNKNOWN
  // 則嘗試基於案件本身的 verdict/verdict_type 做最後的粗略判斷
  else if (outcomeCode.endsWith("OTHER_UNKNOWN_COUNT")) {
    const descLower = (sourceForContext.verdict || sourceForContext.verdict_type || "").toLowerCase();
    if (descLower) { // 確保 descLower 不是空字符串
      if (mainType === 'civil') {
        if (isRulingCase) {
          if (descLower.includes("准許") || descLower.includes("准予")) outcomeCode = 'WIN_FULL_COUNT';
          else if (descLower.includes("駁回")) outcomeCode = 'LOSE_FULL_COUNT';
        } else {
          if (descLower.includes("和解") || descLower.includes("調解")) outcomeCode = 'OTHER_SETTLEMENT_COUNT';
          else if (descLower.includes("全部勝訴")) outcomeCode = 'WIN_FULL_COUNT';
          else if (descLower.includes("部分勝訴") || descLower.includes("一部勝訴")) outcomeCode = 'WIN_PARTIAL_COUNT';
          else if (descLower.includes("敗訴") || descLower.includes("駁回")) outcomeCode = 'LOSE_FULL_COUNT';
          else if (descLower.includes("程序") || descLower.includes("裁定")) outcomeCode = 'PROCEDURAL_COUNT';
        }
      } else if (mainType === 'criminal') {
        if (pv.includes("無罪")) outcomeCode = 'CRIMINAL_ACQUITTED';
        else if (pv.includes("有罪但顯著減輕")) outcomeCode = 'CRIMINAL_GUILTY_SIG_REDUCED';
        else if (pv.includes("有罪但略微減輕")) outcomeCode = 'CRIMINAL_GUILTY_SLIGHT_REDUCED';
        else if (pv.includes("緩刑")) outcomeCode = 'CRIMINAL_GUILTY_PROBATION';
        else if (pv.includes("得易科罰金")) outcomeCode = 'CRIMINAL_GUILTY_FINE_CONVERTIBLE';
        else if (pv.includes("罰金") && !(pv.includes("有期徒刑") || pv.includes("拘役"))) outcomeCode = 'CRIMINAL_GUILTY_FINE_ONLY';
        else if (pv.includes("有罪且加重")) outcomeCode = 'CRIMINAL_GUILTY_AGGRAVATED';
        else if (pv.includes("有罪且符合預期") || pv.includes("有罪依法量刑") || (pv.includes("有罪") && !pv.includes("減輕") && !pv.includes("緩刑"))) outcomeCode = 'CRIMINAL_GUILTY_AS_EXPECTED_OR_SENTENCED';
        else if (isRulingCase && (pv.includes("准予交保") || pv.includes("停止羈押"))) outcomeCode = 'CRIMINAL_RULING_BAIL_GRANTED';
        else if (isRulingCase && (pv.includes("羈押") || pv.includes("駁回交保"))) outcomeCode = 'CRIMINAL_RULING_DETENTION_ORDERED';
        // 參考 source.verdict_type
        else if ((sourceForContext.verdict_type || '').toLowerCase().includes("免訴")) outcomeCode = 'CRIMINAL_CHARGE_DISMISSED_NO_PROSECUTION';
        else if ((sourceForContext.verdict_type || '').toLowerCase().includes("不受理")) outcomeCode = 'CRIMINAL_CHARGE_DISMISSED_NOT_ACCEPTED';
        else if (pv.includes("n/a") || pv.includes("未明確記載")) outcomeCode = 'NOT_APPLICABLE_OR_UNKNOWN';
        else outcomeCode = 'CRIMINAL_UNCATEGORIZED';

      } else if (mainType === 'administrative') {
        if (pv.includes("撤銷原處分") && !(pv.includes("部分") || pv.includes("一部"))) outcomeCode = 'ADMIN_WIN_REVOKE_FULL';
        else if (pv.includes("部分撤銷原處分") || pv.includes("一部撤銷")) outcomeCode = 'ADMIN_WIN_REVOKE_PARTIAL';
        else if (pv.includes("駁回訴訟") || pv.includes("訴願駁回")) outcomeCode = 'ADMIN_LOSE_DISMISSED';
        else if (pv.includes("義務訴訟勝訴")) outcomeCode = 'ADMIN_WIN_OBLIGATION';
        else if (isRulingCase && pv.includes("准予停止執行")) outcomeCode = 'ADMIN_RULING_STAY_GRANTED';
        else if (isRulingCase && pv.includes("駁回停止執行")) outcomeCode = 'ADMIN_RULING_STAY_DENIED';
        else if (pv.includes("n/a") || pv.includes("未明確記載")) outcomeCode = 'NOT_APPLICABLE_OR_UNKNOWN';
        else outcomeCode = 'ADMIN_UNCATEGORIZED';
      }
    }

    if (!description || description.trim() === '' || description === '結果未明' || description === '結果資訊不足') {
      description = sourceForContext.verdict || sourceForContext.verdict_type || '結果資訊不足';
      if (!description || description.trim() === '') description = '結果資訊不足';
    }

    // 最後的 outcomeCode 兜底
    if (outcomeCode === `${mainType.toUpperCase()}_OTHER_UNKNOWN_COUNT` && description !== '結果資訊不足') {
      console.warn(`[getDetailedResult ${mainType.toUpperCase()}] 최종 Unmapped description: ${description}. Defaulting to OTHER_UNKNOWN_COUNT.`);
      outcomeCode = 'OTHER_UNKNOWN_COUNT';
    }


    return {
      outcomeCode,
      description
    };
  }

  function createOutcomeStats() {
    return {
      total: 0, // 該角色在該主類型下的案件總數 (參與實體統計的)
      FAVORABLE_FULL_COUNT: 0, // 例如 完全勝訴, 無罪, 撤銷原處分
      FAVORABLE_PARTIAL_COUNT: 0, // 例如 部分勝訴, 罪名減輕, 部分撤銷
      UNFAVORABLE_FULL_COUNT: 0, // 例如 完全敗訴, 有罪判刑
      NEUTRAL_SETTLEMENT_COUNT: 0, // 和解/調解/撤訴
      PROCEDURAL_COUNT: 0, // 純程序性結果 (不計入勝敗)
      RULING_FAVORABLE_COUNT: 0, // 有利的裁定 (如果單獨統計)
      RULING_UNFAVORABLE_COUNT: 0, // 不利的裁定 (如果單獨統計)
      OTHER_UNKNOWN_COUNT: 0 // 其他無法歸類的實體結果
    };
  }

  // --- 輔助函數：計算詳細勝訴率 ---
  function calculateDetailedWinRates(processedCases, detailedWinRatesStats) {
    processedCases.forEach(caseInfo => {
      const {
        mainType,
        sideFromPerf,
        neutralOutcomeCode
      } = caseInfo;
      if (!neutralOutcomeCode || !mainType || mainType === 'unknown' || !sideFromPerf || sideFromPerf === 'unknown') {
        // 如果主類型未知，或 outcomeCode 未知，或 side 未知，則跳過此案件的精確統計，但其 total 可能已在外部計算
        console.warn(`[calculateDetailedWinRates] Skipping case due to unknown mainType, outcomeCode, or side: ${caseInfo.id}`);
        return;
      }

      const statsBucketRoot = detailedWinRatesStats[mainType];
      if (!statsBucketRoot) {
        console.warn(`[calculateDetailedWinRates] No stats bucket for mainType: ${mainType}`);
        return;
      }

      let targetRoleBucket;
      // 根據 sideFromPerf 決定目標統計桶
      if (sideFromPerf === 'plaintiff') { // 假設 perf.side 返回的是小寫的 'plaintiff' 或 'defendant'
        targetRoleBucket = statsBucketRoot.plaintiff;
      } else if (sideFromPerf === 'defendant') {
        targetRoleBucket = statsBucketRoot.defendant;
      } else {
        console.warn(`[calculateDetailedWinRates] Unknown sideFromPerf: ${sideFromPerf} for case ${caseInfo.id}`);
        return;
      }

      if (!targetRoleBucket) {
        console.warn(`[calculateDetailedWinRates] Target role bucket is undefined for mainType: ${mainType}, side: ${sideFromPerf}`);
        return;
      }

      //targetRoleBucket.total = (targetRoleBucket.total || 0) + 1; // 先加總案件數



      // 根據 neutralOutcomeCode 和 sideFromPerf 映射到有利/不利的統計槽
      // ***** 這是最需要細化和擴充的映射邏輯 *****
      let finalStatCode = 'OTHER_UNKNOWN_COUNT'; // 預設

      if (neutralOutcomeCode === 'PROCEDURAL') finalStatCode = 'PROCEDURAL_COUNT';
      else if (neutralOutcomeCode === 'SETTLEMENT' || neutralOutcomeCode === 'WITHDRAWAL') finalStatCode = 'NEUTRAL_SETTLEMENT_COUNT';
      else if (neutralOutcomeCode === 'NOT_APPLICABLE_OR_UNKNOWN') finalStatCode = 'OTHER_UNKNOWN_COUNT';
      else {
        if (mainType === 'civil') {
          if (sideFromPerf === 'plaintiff') {
            if (['CIVIL_PLAINTIFF_WIN_FULL', 'CIVIL_PLAINTIFF_WIN_MAJOR', 'RULING_GRANTED', 'GENERIC_WIN_FULL'].includes(neutralOutcomeCode)) finalStatCode = 'FAVORABLE_FULL_COUNT';
            else if (['CIVIL_PLAINTIFF_WIN_PARTIAL', 'CIVIL_PLAINTIFF_WIN_MINOR', 'GENERIC_WIN_PARTIAL'].includes(neutralOutcomeCode)) finalStatCode = 'FAVORABLE_PARTIAL_COUNT';
            else if (['CIVIL_PLAINTIFF_LOSE_FULL', 'CIVIL_DEFENDANT_WIN_FULL', 'RULING_DISMISSED', 'GENERIC_LOSE_FULL'].includes(neutralOutcomeCode)) finalStatCode = 'UNFAVORABLE_FULL_COUNT';
          } else if (sideFromPerf === 'defendant') {
            if (['CIVIL_DEFENDANT_WIN_FULL', 'CIVIL_DEFENDANT_MITIGATE_MAJOR', 'RULING_DISMISSED', 'GENERIC_WIN_FULL'].includes(neutralOutcomeCode)) finalStatCode = 'FAVORABLE_FULL_COUNT';
            else if (['CIVIL_DEFENDANT_MITIGATE_PARTIAL', 'CIVIL_DEFENDANT_MITIGATE_MINOR', 'GENERIC_WIN_PARTIAL'].includes(neutralOutcomeCode)) finalStatCode = 'FAVORABLE_PARTIAL_COUNT';
            else if (['CIVIL_DEFENDANT_LOSE_FULL', 'CIVIL_PLAINTIFF_WIN_FULL', 'RULING_GRANTED', 'GENERIC_LOSE_FULL'].includes(neutralOutcomeCode)) finalStatCode = 'UNFAVORABLE_FULL_COUNT';
          }
        } else if (mainType === 'criminal') { // 主要看被告
          if (sideFromPerf === 'defendant') {
            if (neutralOutcomeCode === 'CRIMINAL_ACQUITTED') finalStatCode = 'FAVORABLE_FULL_COUNT';
            else if (['CRIMINAL_GUILTY_FAVORABLE_COUNT', 'CRIMINAL_GUILTY_MITIGATE_HIGH', 'CRIMINAL_GUILTY_MITIGATE_MEDIUM', 'CRIMINAL_GUILTY_PROBATION', 'CRIMINAL_GUILTY_FINE_CONVERTIBLE', 'CRIMINAL_GUILTY_FINE_ONLY', 'CRIMINAL_RULING_FAVORABLE_COUNT'].includes(neutralOutcomeCode)) finalStatCode = 'FAVORABLE_PARTIAL_COUNT'; // 或 FAVORABLE_FULL
            else if (['CRIMINAL_GUILTY_UNFAVORABLE_COUNT', 'CRIMINAL_GUILTY_AGGRAVATED', 'CRIMINAL_GUILTY_EXPECTED_OR_SENTENCED', 'CRIMINAL_RULING_UNFAVORABLE_COUNT'].includes(neutralOutcomeCode)) finalStatCode = 'UNFAVORABLE_FULL_COUNT';
            else if (['CRIMINAL_CHARGE_DISMISSED_NO_PROSECUTION', 'CRIMINAL_CHARGE_DISMISSED_NOT_ACCEPTED'].includes(neutralOutcomeCode)) finalStatCode = 'PROCEDURAL_COUNT';
          }
        } else if (mainType === 'administrative') { // 主要看原告
          if (sideFromPerf === 'plaintiff') {
            if (['ADMIN_WIN_FULL_REVOKE', 'ADMIN_WIN_OBLIGATION', 'ADMIN_RULING_FAVORABLE_COUNT'].includes(neutralOutcomeCode)) finalStatCode = 'FAVORABLE_FULL_COUNT';
            else if (neutralOutcomeCode === 'ADMIN_WIN_PARTIAL_REVOKE') finalStatCode = 'FAVORABLE_PARTIAL_COUNT';
            else if (['ADMIN_LOSE_DISMISSED', 'ADMIN_RULING_UNFAVORABLE_COUNT'].includes(neutralOutcomeCode)) finalStatCode = 'UNFAVORABLE_FULL_COUNT';
          }
        }
      }

      if (targetRoleBucket[neutralOutcomeCode] !== undefined) {
        targetRoleBucket[neutralOutcomeCode]++;
      } else {
        console.warn(`[calculateDetailedWinRates] Unknown neutralOutcomeCode '${neutralOutcomeCode}' for mainType '${mainType}', side '${sideFromPerf}'. Counting as OTHER_UNKNOWN_COUNT.`);
        targetRoleBucket.OTHER_UNKNOWN_COUNT = (targetRoleBucket.OTHER_UNKNOWN_COUNT || 0) + 1;
      }
    });

    // 計算 overall (有利結果率)
    ['civil', 'criminal', 'administrative'].forEach(mainType => {
      const stats = detailedWinRatesStats[mainType];
      if (!stats) return; // 如果某個 mainType 沒有數據，跳過

      let favorableSum = 0;
      let consideredSum = 0;

      const plaintiffStats = stats.plaintiff || createOutcomeStats();
      const defendantStats = stats.defendant || createOutcomeStats();

      if (mainType === 'civil') {
        favorableSum += (plaintiffStats.FAVORABLE_FULL_COUNT || 0) + (plaintiffStats.FAVORABLE_PARTIAL_COUNT || 0);
        consideredSum += Math.max(0, (plaintiffStats.total || 0) - ((plaintiffStats.PROCEDURAL_COUNT || 0) + (plaintiffStats.NEUTRAL_SETTLEMENT_COUNT || 0) + (plaintiffStats.OTHER_UNKNOWN_COUNT || 0)));

        favorableSum += (defendantStats.FAVORABLE_FULL_COUNT || 0) + (defendantStats.FAVORABLE_PARTIAL_COUNT || 0);
        consideredSum += Math.max(0, (defendantStats.total || 0) - ((defendantStats.PROCEDURAL_COUNT || 0) + (defendantStats.NEUTRAL_SETTLEMENT_COUNT || 0) + (defendantStats.OTHER_UNKNOWN_COUNT || 0)));
      } else if (mainType === 'criminal') {
        favorableSum += (defendantStats.FAVORABLE_FULL_COUNT || 0) + (defendantStats.FAVORABLE_PARTIAL_COUNT || 0) + (defendantStats.RULING_FAVORABLE_COUNT || 0);
        consideredSum += Math.max(0, (defendantStats.total || 0) - ((defendantStats.PROCEDURAL_COUNT || 0) + (defendantStats.OTHER_UNKNOWN_COUNT || 0) + (defendantStats.RULING_UNFAVORABLE_COUNT || 0)));
      } else if (mainType === 'administrative') {
        favorableSum += (plaintiffStats.FAVORABLE_FULL_COUNT || 0) + (plaintiffStats.FAVORABLE_PARTIAL_COUNT || 0) + (plaintiffStats.RULING_FAVORABLE_COUNT || 0);
        consideredSum += Math.max(0, (plaintiffStats.total || 0) - ((plaintiffStats.PROCEDURAL_COUNT || 0) + (plaintiffStats.NEUTRAL_SETTLEMENT_COUNT || 0) + (plaintiffStats.OTHER_UNKNOWN_COUNT || 0) + (plaintiffStats.RULING_UNFAVORABLE_COUNT || 0)));
      }
      stats.overall = consideredSum > 0 ? Math.round((favorableSum / consideredSum) * 100) : 0;
      console.log(`[calculateOverall - ${mainType}] Favorable=${favorableSum}, Considered=${consideredSum}, Final Overall: ${stats.overall}`);
      if (mainType === 'criminal' && defendantStats) console.log(`[calculateOverallCriminal] Defendant Stats for Overall: ${JSON.stringify(defendantStats)}`);
      if (mainType === 'civil' && plaintiffStats) console.log(`[calculateOverallCivil] Plaintiff Stats for Overall: ${JSON.stringify(plaintiffStats)}`);
      if (mainType === 'administrative' && plaintiffStats) console.log(`[calculateOverallAdmin] Plaintiff Stats for Overall: ${JSON.stringify(plaintiffStats)}`);
    });
  }

  // --- 輔助函數：填充動態篩選選項 ---
  function populateDynamicFilterOptions(optionsTarget, esAggregations, allProcessedCases, lawyerName) {
    ['civil', 'criminal', 'administrative'].forEach(mainType => {
      const typeCases = allProcessedCases.filter(c => c.mainType === mainType);
      const uniqueCauses = new Set();
      const uniqueLawyerPerformanceVerdicts = new Set(); // 改為收集 lawyerperformance.verdict

      typeCases.forEach(c => {
        if (c.cause && c.cause !== '未指定') {
          uniqueCauses.add(c.cause);
        }
        // 從 c.result (即處理過的 detailedResult.description，源自 lawyerperformance.verdict) 提取
        if (c.result && c.result !== '結果資訊不足' && c.result !== '結果未分類') {
          uniqueLawyerPerformanceVerdicts.add(c.result);
        }
      });
      optionsTarget[mainType].causes = Array.from(uniqueCauses).sort();
      optionsTarget[mainType].verdicts = Array.from(uniqueLawyerPerformanceVerdicts).sort();
    });
  }



  // --- 律師搜尋 API 端點 ---
  app.get('/api/lawyers/:name', verifyToken, async (req, res) => {
    const lawyerName = req.params.name;
    const userId = req.user.uid;
    const searchCost = 1;

    console.log(`[Lawyer Search] User: ${userId} searching for lawyer: ${lawyerName}`);
    const userDocRef = admin.firestore().collection('users').doc(userId);

    try {
      let lawyerApiData = null;

      await admin.firestore().runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userDocRef);
        if (!userDoc.exists) throw new Error('用戶數據不存在。');

        const userData = userDoc.data();
        const currentCredits = userData.credits || 0;
        if (currentCredits < searchCost) throw new Error('積分不足');

        transaction.update(userDocRef, {
          credits: admin.firestore.FieldValue.increment(-searchCost),
          lastLawyerSearchAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[Transaction] Performing ES search for lawyer: ${lawyerName}`);
        const esResult = await client.search({
          index: 'search-boooook',
          size: 300, // 獲取足夠案件進行分析
          query: {
            bool: { // 確保查詢只針對包含該律師的案件
              must: [{
                bool: {
                  should: [{
                      match_phrase: {
                        "lawyers": lawyerName
                      }
                    }, {
                      match_phrase: {
                        "lawyers.raw": lawyerName
                      }
                    }, {
                      match_phrase: {
                        "lawyersdef": lawyerName
                      }
                    }, {
                      match_phrase: {
                        "lawyersdef.raw": lawyerName
                      }
                    },
                    // "winlawyers" 和 "loselawyers" 可能不準確，主要依賴 lawyers 和 lawyersdef
                  ],
                  minimum_should_match: 1
                }
              }]
            }
          },
          _source: [ // 確保獲取所有需要的欄位
            "court", "JTITLE", "JDATE", "case_type", "verdict", "verdict_type",
            "cause", "lawyers", "lawyersdef", "JCASE", "lawyerperformance"
          ],
          // aggs: {} // 如果不在 ES 層面做聚合，這裡可以是空的
        });

        // 即使 esResult.hits.total.value === 0，也調用 analyzeLawyerData 
        // analyzeLawyerData 內部會處理空 hits 的情況
        lawyerApiData = analyzeLawyerData(esResult.hits.hits, lawyerName, esResult.aggregations);
        // 如果沒有 aggs，esResult.aggregations 會是 undefined
      });

      if (lawyerApiData) {
        try {
          await admin.firestore().collection('users').doc(userId)
            .collection('lawyerSearchHistory').add({
              lawyerName: lawyerName,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              foundResults: lawyerApiData.cases.length > 0
            });
        } catch (historyError) {
          console.error('記錄律師搜尋歷史失敗:', historyError);
        }

        // 即使案件列表為空，只要成功執行到這裡，就返回 200 和數據結構
        res.status(200).json(lawyerApiData);

      } else {
        console.error(`[Lawyer Search Error] lawyerApiData is unexpectedly null for ${lawyerName} after transaction.`);
        res.status(500).json({
          error: '搜尋律師時發生未預期的伺服器內部錯誤（資料分析後為空）。'
        });
      }

    } catch (error) {
      console.error(`[Lawyer Search API Error] User: ${userId}, Lawyer: ${lawyerName}, Error Details:`, error);
      if (error.message === '積分不足') {
        try {
          const userDoc = await userDocRef.get();
          const currentCredits = userDoc.exists() ? (userDoc.data().credits || 0) : 0;
          return res.status(402).json({
            error: '您的積分不足，請購買積分或升級方案。',
            required: searchCost,
            current: currentCredits
          });
        } catch (readError) {
          return res.status(402).json({
            error: '您的積分不足，請購買積分或升級方案。'
          });
        }
      } else if (error.message === '用戶數據不存在。') {
        return res.status(404).json({
          error: '找不到您的用戶資料，請嘗試重新登入。'
        });
      } else {
        res.status(500).json({
          error: error.message || '搜尋律師時發生伺服器內部錯誤。'
        });
      }
    }
  });

  // --- 律師優劣勢分析 API 端點 ---
  app.get('/api/lawyers/:name/analysis', verifyToken, async (req, res) => {
    const lawyerName = req.params.name;
    const userId = req.user.uid;
    const analysisCost = 2; // 分析功能消耗 2 積分

    console.log(`[律師分析] 用戶 ${userId} 請求分析律師: ${lawyerName}`);
    const userDocRef = admin.firestore().collection('users').doc(userId);

    try {
      let analysisData = null;

      // --- 使用 Firestore Transaction 處理積分 ---
      await admin.firestore().runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userDocRef);

        if (!userDoc.exists) {
          throw new Error('用戶數據不存在');
        }

        const userData = userDoc.data();
        const currentCredits = userData.credits || 0;

        if (currentCredits < analysisCost) {
          throw new Error('積分不足');
        }

        // 扣除積分
        transaction.update(userDocRef, {
          credits: admin.firestore.FieldValue.increment(-analysisCost),
          lastAnalysisAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 這裡使用預設的分析模板
        // 實際應用中，這部分可能需要更深入的數據分析或 AI 生成
        analysisData = generateLawyerAnalysis(lawyerName);
      });

      if (analysisData) {
        res.status(200).json(analysisData);
      } else {
        res.status(404).json({
          error: `無法產生律師 "${lawyerName}" 的分析`
        });
      }
    } catch (error) {
      console.error(`[律師分析錯誤] 用戶: ${userId}, 錯誤:`, error);

      if (error.message === '積分不足') {
        return res.status(402).json({
          error: '生成分析需要額外積分，請購買積分或升級方案'
        });
      }

      if (error.message === '用戶數據不存在') {
        return res.status(404).json({
          error: '找不到您的用戶資料，請嘗試重新登入。'
        });
      }

      res.status(500).json({
        error: '分析生成失敗'
      });
    }
  });

  // --- 律師搜尋歷史 API 端點 ---
  app.get('/api/user/lawyer-search-history', verifyToken, async (req, res) => {
    const userId = req.user.uid;

    try {
      const historyRef = admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('lawyerSearchHistory')
        .orderBy('timestamp', 'desc')
        .limit(10);

      const snapshot = await historyRef.get();
      const history = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        // 確保 timestamp 數據可以序列化
        const timestamp = data.timestamp ? data.timestamp.toDate().toISOString() : null;

        history.push({
          id: doc.id,
          lawyerName: data.lawyerName,
          timestamp: timestamp
        });
      });

      res.json(history);
    } catch (error) {
      console.error('獲取搜尋歷史錯誤:', error);
      res.status(500).json({
        error: '獲取搜尋歷史失敗'
      });
    }
  });

  // --- 輔助函數：分析律師數據 ---
  function analyzeLawyerData(esHits, lawyerName, esAggregations) {
    const initialStats = {
      totalCasesLast3Years: 0,
      commonCaseTypes: [],
      caseTypeValues: [],
      detailedWinRates: {
        civil: {
          overall: 0,
          plaintiff: createOutcomeStats(),
          defendant: createOutcomeStats()
        },
        criminal: {
          overall: 0,
          plaintiff: createOutcomeStats(),
          defendant: createOutcomeStats()
        },
        administrative: {
          overall: 0,
          plaintiff: createOutcomeStats(),
          defendant: createOutcomeStats()
        }
      },
      dynamicFilterOptions: {
        civil: {
          causes: [],
          verdicts: []
        },
        criminal: {
          causes: [],
          verdicts: []
        },
        administrative: {
          causes: [],
          verdicts: []
        }
      }
    };
    const resultData = {
      name: lawyerName,
      lawRating: 0,
      source: '法院公開判決書',
      stats: JSON.parse(JSON.stringify(initialStats)),
      cases: [],
      analysis: null
    };
    if (!esHits || esHits.length === 0) return resultData;

    const now = new Date();
    const threeYearsAgoNum = parseInt(`${now.getFullYear() - 3}${("0" + (now.getMonth() + 1)).slice(-2)}${("0" + now.getDate()).slice(-2)}`, 10);
    const allCaseTypesCounter = {};

    resultData.cases = esHits.map(hit => {
      const source = hit._source;
      const mainType = getMainType(source);

      let sideFromPerf = 'unknown';
      let perfVerdictText = null; // 這是傳給 getDetailedResult 的
      let lawyerPerfObject = null; // 用於獲取 is_procedural

      const performances = source.lawyerperformance;
      if (performances && Array.isArray(performances)) {
        const perf = performances.find(p => p.lawyer === lawyerName);
        if (perf) {
          lawyerPerfObject = perf; // 保存整個 perf 對象
          sideFromPerf = (perf.side || 'unknown').toLowerCase();
          perfVerdictText = perf.verdict;
        }
      }

      // 將 sourceForContext 傳遞給 getDetailedResult，它包含了 is_ruling 等案件級別信息
      // 以及 lawyerPerfObject 以便 getDetailedResult 內部可以訪問 is_procedural
      const {
        outcomeCode,
        description
      } = getDetailedResult(perfVerdictText, mainType, source, lawyerPerfObject);

      if (caseDateStr && parseInt(caseDateStr, 10) >= threeYearsAgoNum) {
        resultData.stats.totalCasesLast3Years++;
      }
      if (source.case_type) {
        allCaseTypesCounter[source.case_type] = (allCaseTypesCounter[source.case_type] || 0) + 1;
      }
      const caseDateStr = (source.JDATE || "").replace(/\//g, '');


      return {
        id: hit._id,
        mainType,
        title: source.JTITLE || `${source.court || ''} 判決`,
        cause: source.cause || '未指定',
        result: description,
        originalVerdict: source.verdict,
        originalVerdictType: source.verdict_type,
        date: caseDateStr,
        // role: getLawyerRole(source, lawyerName), // <--- 移除或用 sideFromPerf 替代
        sideFromPerf: sideFromPerf,
        neutralOutcomeCode: outcomeCode,
        originalSource: source
      };
    });

    console.log(`--- Cases Breakdown for ${lawyerName} (${resultData.cases.length} total processed from ES) ---`);
    resultData.cases.forEach(c => {
      // 注意：caseInfo 中沒有 _outcomeCodeForStat 了，而是 neutralOutcomeCode
      console.log(`  ID: ${c.id}, mainType: ${c.mainType}, sideFromPerf: ${c.sideFromPerf}, neutralOutcomeCode: ${c.neutralOutcomeCode}, description: ${c.result}`);
    });

    calculateDetailedWinRates(resultData.cases, resultData.stats.detailedWinRates);

    const sortedCommonCaseTypes = Object.entries(allCaseTypesCounter).sort(([, a], [, b]) => b - a).slice(0, 3);
    resultData.stats.commonCaseTypes = sortedCommonCaseTypes.map(e => e[0]);
    resultData.stats.caseTypeValues = sortedCommonCaseTypes.map(e => e[1]);

    populateDynamicFilterOptions(resultData.stats.dynamicFilterOptions, esAggregations, resultData.cases, lawyerName);

    const overallFavorableRate = resultData.stats.detailedWinRates.civil.overall || resultData.stats.detailedWinRates.criminal.overall || resultData.stats.detailedWinRates.administrative.overall || 0;

    if (resultData.stats.totalCasesLast3Years >= 3) { // 降低案件數門檻
      resultData.lawRating = Math.min(4, Math.floor(resultData.stats.totalCasesLast3Years / 5)); // 調整基礎分
      if (overallFavorableRate > 70) resultData.lawRating += 3;
      else if (overallFavorableRate > 55) resultData.lawRating += 2;
      else if (overallFavorableRate > 40) resultData.lawRating += 1;
    } else {
      resultData.lawRating = Math.min(2, resultData.stats.totalCasesLast3Years);
    }
    resultData.lawRating = Math.max(0, Math.min(8, Math.round(resultData.lawRating)));

    resultData.cases.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    // 不在此處 slice，讓前端根據需要決定顯示多少
    // resultData.cases = resultData.cases.slice(0, 50); 
    console.log(`[analyzeLawyerData] Processed ${resultData.cases.length} cases for ${lawyerName}.`);
    console.log(`[analyzeLawyerData] Detailed Win Rates for ${lawyerName}: `, JSON.stringify(resultData.stats.detailedWinRates, null, 2));
    return resultData;
  }

  // --- 輔助函數：生成律師分析 ---
  function generateLawyerAnalysis(lawyerName) {
    // 這裡提供預設模板
    // 實際情況下，應該根據律師的真實案件數據來生成分析

    // 對於「林大明」律師，提供固定的分析模板
    if (lawyerName === '林大明') {
      return {
        advantages: "林律師於近年積極承辦租賃契約、工程款請求及不當得利案件，對於租賃契約條款的適用與解釋、以及工程施工瑕疵舉證程序，展現出高度的法律專業與應對經驗。\n在案件策略安排上，林律師擅長透過舉證資料的精細準備，強化契約明確性的主張，並有效利用證據規則進行抗辯，於租賃及工程類型訴訟中，呈現較高的勝訴比例。\n此外，在訴訟程序中具備良好的時程掌控能力，能妥善安排證人出庭與書狀提出，對於加速訴訟進行亦有所助益。",
        cautions: "根據統計資料觀察，在侵權行為、不當得利類型案件中，林律師在舉證責任配置及因果關係主張方面，部分案件表現較為薄弱，致使部分主張未獲法院支持。\n尤其於需要高度釐清事實細節（如侵權責任、損害範圍認定）的案件中，舉證力道及證明程度可能影響最終判決結果。\n建議於此類型訴訟中，強化因果關係及損害證明之資料準備，以提升整體案件掌控度與成功率。",
        disclaimer: "本資料係依法院公開判決書自動彙整分析，僅供參考，並非對個別案件結果作出判斷。"
      };
    }

    // 通用分析模板
    return {
      advantages: `${lawyerName}律師具有豐富的訴訟經驗，熟悉司法實務運作。從判決書的分析來看，具有良好的案件準備能力和法律論證技巧。\n在庭審過程中能夠清晰地表達法律觀點，有條理地呈現證據，使法官更容易理解當事人的主張。\n善於掌握案件的關鍵爭點，能夠有效地針對核心問題提出法律依據和事實證明。`,
      cautions: `建議在訴訟前充分評估案件的法律風險，選擇更有利的訴訟策略。\n部分複雜案件中，可考慮加強對於專業領域知識的補充說明，以便法官更全面理解案情。\n在某些判決中，證據的提出時機和證據力評估方面可以有更精準的規劃，以提高整體案件的成功率。`,
      disclaimer: "本資料係依法院公開判決書自動彙整分析，僅供參考，並非對個別案件結果作出判斷。"
    };
  }

  const port = process.env.PORT || 3000
  app.listen(port, () => console.log(`🚀 Listening on ${port}`))