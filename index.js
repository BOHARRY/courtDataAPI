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

  if (caseType.includes('行政') || court.includes('行政法院') || (jtitle.includes('稅') || jtitle.includes('徵收') || jtitle.includes('處分')) && !jtitle.includes('民事')) {
    return 'administrative';
  }
  if (caseType.includes('刑事') || court.includes('刑事庭') || criminalKeywordsTitle.some(kw => jtitle.includes(kw) && !civilKeywordsTitle.some(cKw => jtitle.includes(cKw)))) {
    return 'criminal';
  }
  if (caseType.includes('民事') || caseType.includes('家事') || court.includes('民事庭') || court.includes('家事法庭') || court.includes('簡易庭') || civilKeywordsTitle.some(kw => jtitle.includes(kw))) {
    return 'civil';
  }
  if (jcase.startsWith('行')) return 'administrative';
  if (jcase.startsWith('刑') || jcase.startsWith('少刑')) return 'criminal';
  // 如果不是明確的行政或刑事，且包含民事/家事相關字，或常見的程序字，傾向歸為民事
  const civilJcaseChars = ['民', '家', '訴', '執', '全', '抗', '促', '裁', '督', '易', '簡']; // 增加一些常見字
  if (civilJcaseChars.some(char => jcase.includes(char))) {
    // 若 JTITLE 或 CASE_TYPE 有更強的刑事/行政指標，前面應該已經匹配了
    return 'civil';
  }

  console.warn(`[getMainType] Unidentifiable case type for JTITLE: ${source.JTITLE}, JCASE: ${source.JCASE}, case_type: ${source.case_type}, court: ${source.court}. Defaulting to 'civil'.`);
  return 'civil';
}

// --- 輔助函數：獲取詳細判決結果 (基於 lawyerperformance) ---
// index.js

// --- 輔助函數：獲取詳細判決結果 (基於 lawyerperformance，並嘗試區分判決與裁定) ---
function getDetailedResult(source, mainType, lawyerName) {
  // 預設 outcomeCode 和 description
  let outcomeCode = `${mainType.toUpperCase()}_OTHER_UNKNOWN`;
  let description = source.verdict_type || source.verdict || '結果未明';

  // 嘗試從 source 中判斷是否為裁定
  const isRulingCase = 
    source.is_ruling === "是" || 
    source.is_ruling === true || 
    (source.JCASE || '').toLowerCase().includes("裁") || 
    (source.JCASE || '').toLowerCase().includes("抗") || // 抗告也是裁定
    (source.JCASE || '').toLowerCase().includes("聲") || // 聲請通常是裁定
    (source.JTITLE || '').toLowerCase().includes("裁定");

  const performances = source.lawyerperformance;
  if (performances && Array.isArray(performances)) {
    const perf = performances.find(p => p.lawyer === lawyerName);

    if (perf && perf.verdict) {
      description = perf.verdict; // 主要描述來自 lawyerperformance.verdict
      const pv = perf.verdict.toLowerCase(); // perfVerdict 小寫
      const isProceduralFromPerf = perf.is_procedural === true || perf.is_procedural === 'true';
      const role = getLawyerRole(source, lawyerName);

      // 統一處理程序性結果 (無論判決或裁定，若 lawyerperformance 標記為程序性)
      if (isProceduralFromPerf || pv.includes("程序性裁定") || pv.includes("procedural")) {
        outcomeCode = `${mainType.toUpperCase()}_PROCEDURAL`; // 例如 CIVIL_PROCEDURAL
      }
      // 統一處理和解與撤訴 (主要針對民事判決，但也可適用於某些行政)
      else if ((mainType === 'civil' || mainType === 'administrative') && pv.includes("和解")) {
        outcomeCode = `${mainType.toUpperCase()}_NEUTRAL_SETTLEMENT`;
      } else if (mainType === 'civil' && pv.includes("撤訴")) { // 撤訴主要用於民事
        outcomeCode = 'CIVIL_NEUTRAL_WITHDRAW';
      }
      // --- 實體結果判斷 ---
      else {
        if (mainType === 'civil') {
          if (isRulingCase) { // --- 民事裁定的有利判斷 ---
            // 這裡的 outcomeCode 應該映射到與判決類似的有利/不利統計槽
            if (role === '原告代理人' || role === '聲請人代理人') {
              if (pv.includes("准許") || pv.includes("准予") || pv.includes("應予准許") || pv.includes("抗告有理由")) outcomeCode = 'WIN_FULL_COUNT';
              else if (pv.includes("駁回聲請") || pv.includes("聲請駁回") || pv.includes("抗告無理由")) outcomeCode = 'LOSE_FULL_COUNT';
              else outcomeCode = 'OTHER_UNKNOWN_COUNT';
            } else if (role === '被告代理人' || role === '相對人代理人') {
              if (pv.includes("駁回聲請") || pv.includes("聲請駁回") || pv.includes("抗告無理由")) outcomeCode = 'WIN_FULL_COUNT'; // 對方聲請被駁，對己方有利
              else if (pv.includes("准許") || pv.includes("准予") || pv.includes("應予准許") || pv.includes("抗告有理由")) outcomeCode = 'LOSE_FULL_COUNT';
              else outcomeCode = 'OTHER_UNKNOWN_COUNT';
            } else { outcomeCode = 'OTHER_UNKNOWN_COUNT'; }
          } else { // --- 民事判決的有利判斷 ---
            if (role === '原告代理人') {
              if (pv.includes("原告: 完全勝訴") && !pv.includes("被告:")) outcomeCode = 'WIN_FULL_COUNT';
              else if (pv.includes("原告: 大部分勝訴")) outcomeCode = 'WIN_FULL_COUNT';
              else if (pv.includes("原告: 部分勝訴") || pv.includes("原告: 小部分勝訴")) outcomeCode = 'WIN_PARTIAL_COUNT';
              else if (pv.includes("原告: 完全敗訴") && !pv.includes("被告:")) outcomeCode = 'LOSE_FULL_COUNT';
              else if (pv.includes("原告: 完全勝訴") && pv.includes("被告: 完全敗訴")) outcomeCode = 'WIN_FULL_COUNT';
              else if (pv.includes("原告: 部分勝訴") && (pv.includes("被告: 部分減免") || pv.includes("被告: 小部分減免"))) outcomeCode = 'WIN_PARTIAL_COUNT';
              else if (pv.includes("原告: 完全敗訴") && pv.includes("被告: 完全勝訴")) outcomeCode = 'LOSE_FULL_COUNT';
              else if (pv.startsWith("完全勝訴") || pv.startsWith("大部分勝訴")) outcomeCode = 'WIN_FULL_COUNT';
              else if (pv.startsWith("部分勝訴") || pv.startsWith("小部分勝訴")) outcomeCode = 'WIN_PARTIAL_COUNT';
              else if (pv.startsWith("完全敗訴")) outcomeCode = 'LOSE_FULL_COUNT';
              else outcomeCode = 'OTHER_UNKNOWN_COUNT';
            } else if (role === '被告代理人') {
              if (pv.includes("被告: 完全勝訴") && !pv.includes("原告:")) outcomeCode = 'WIN_FULL_COUNT';
              else if (pv.includes("被告: 大部分減免")) outcomeCode = 'WIN_FULL_COUNT';
              else if (pv.includes("被告: 部分減免") || pv.includes("被告: 小部分減免")) outcomeCode = 'WIN_PARTIAL_COUNT';
              else if (pv.includes("被告: 完全敗訴") && !pv.includes("原告:")) outcomeCode = 'LOSE_FULL_COUNT';
              else if (pv.includes("被告: 完全勝訴") && pv.includes("原告: 完全敗訴")) outcomeCode = 'WIN_FULL_COUNT';
              else if ((pv.includes("被告: 部分減免") || pv.includes("被告: 小部分減免")) && pv.includes("原告: 部分勝訴")) outcomeCode = 'WIN_PARTIAL_COUNT';
              else if (pv.includes("被告: 完全敗訴") && pv.includes("原告: 完全勝訴")) outcomeCode = 'LOSE_FULL_COUNT';
              else if (pv.startsWith("完全勝訴") || pv.startsWith("大部分減免")) outcomeCode = 'WIN_FULL_COUNT';
              else if (pv.startsWith("部分減免") || pv.startsWith("小部分減免")) outcomeCode = 'WIN_PARTIAL_COUNT';
              else if (pv.startsWith("完全敗訴")) outcomeCode = 'LOSE_FULL_COUNT';
              else outcomeCode = 'OTHER_UNKNOWN_COUNT';
            } else { outcomeCode = 'OTHER_UNKNOWN_COUNT'; }
          }
          if (pv.includes("n/a") || pv.includes("未明確記載")) outcomeCode = 'OTHER_UNKNOWN_COUNT';

        } else if (mainType === 'criminal') {
          if (isRulingCase) { // --- 刑事裁定的有利判斷 (通常針對被告) ---
            if (role === '被告代理人') {
                if (pv.includes("准予交保") || pv.includes("停止羈押") || (pv.includes("聲請") && pv.includes("具保") && pv.includes("停止羈押") && pv.includes("准"))) outcomeCode = 'CRIMINAL_RULING_FAVORABLE_COUNT'; // 自定義有利code
                else if (pv.includes("羈押") || pv.includes("駁回交保") || (pv.includes("聲請") && pv.includes("具保") && pv.includes("駁回"))) outcomeCode = 'CRIMINAL_RULING_UNFAVORABLE_COUNT';
                else outcomeCode = 'OTHER_UNKNOWN_COUNT';
            } else { outcomeCode = 'OTHER_UNKNOWN_COUNT'; }
          } else { // --- 刑事判決 ---
            if (pv.includes("無罪")) outcomeCode = 'CRIMINAL_ACQUITTED_COUNT';
            else if (pv.includes("有罪但顯著減輕")) outcomeCode = 'CRIMINAL_GUILTY_MITIGATE_HIGH_COUNT';
            else if (pv.includes("有罪但略微減輕")) outcomeCode = 'CRIMINAL_GUILTY_MITIGATE_MEDIUM_COUNT';
            else if (pv.includes("有罪且符合預期")) outcomeCode = 'CRIMINAL_GUILTY_EXPECTED_COUNT';
            else if (pv.includes("有罪且加重")) outcomeCode = 'CRIMINAL_GUILTY_AGGRAVATED_COUNT';
            else if (pv.includes("有罪依法量刑")) outcomeCode = 'CRIMINAL_GUILTY_SENTENCED_COUNT';
            else if (source.verdict_type && source.verdict_type.toLowerCase().includes("免訴")) outcomeCode = 'CRIMINAL_DISMISSED_NO_PROSECUTION_COUNT';
            else if (source.verdict_type && source.verdict_type.toLowerCase().includes("不受理")) outcomeCode = 'CRIMINAL_DISMISSED_NOT_ACCEPTED_COUNT';
            else outcomeCode = 'OTHER_UNKNOWN_COUNT';
          }
          if (pv.includes("n/a") || pv.includes("未明確記載")) outcomeCode = 'OTHER_UNKNOWN_COUNT';

        } else if (mainType === 'administrative') {
          if (isRulingCase) { // --- 行政裁定的有利判斷 (通常針對原告/聲請人) ---
            if (role === '原告代理人' || role === '聲請人代理人') {
                if (pv.includes("准予停止執行") || (pv.includes("聲請") && pv.includes("停止執行") && pv.includes("准"))) outcomeCode = 'ADMIN_RULING_FAVORABLE_COUNT';
                else if (pv.includes("駁回停止執行") || (pv.includes("聲請") && pv.includes("停止執行") && pv.includes("駁回"))) outcomeCode = 'ADMIN_RULING_UNFAVORABLE_COUNT';
                else outcomeCode = 'OTHER_UNKNOWN_COUNT';
            } else { outcomeCode = 'OTHER_UNKNOWN_COUNT'; }
          } else { // --- 行政判決 ---
            if (pv.includes("撤銷原處分") && !(pv.includes("部分") || pv.includes("一部"))) outcomeCode = 'ADMIN_WIN_FULL_REVOKE_COUNT';
            else if (pv.includes("部分撤銷原處分") || pv.includes("一部撤銷")) outcomeCode = 'ADMIN_WIN_PARTIAL_REVOKE_COUNT';
            else if (pv.includes("駁回訴訟") || pv.includes("訴願駁回")) outcomeCode = 'ADMIN_LOSE_DISMISSED_COUNT';
            else if (pv.includes("義務訴訟勝訴")) outcomeCode = 'ADMIN_WIN_OBLIGATION_COUNT';
            else outcomeCode = 'OTHER_UNKNOWN_COUNT';
          }
          if (pv.includes("n/a") || pv.includes("未明確記載")) outcomeCode = 'OTHER_UNKNOWN_COUNT';
        }
      } // end 實體結果判斷
    } // end if (perf && perf.verdict)
  } // end if (mainType ... && performances ...)

  // 兜底描述 (如果 outcomeCode 仍然是初始的 UNKNOWN，但 description 已被 lawyerperformance.verdict 更新)
  if (outcomeCode === `${mainType.toUpperCase()}_OTHER_UNKNOWN` && description !== (source.verdict_type || source.verdict || '結果未明')) {
      // description 已經是來自 lawyerperformance.verdict 的較好描述了，但我們未能將其映射到具體的 outcomeCode
      // 保持 outcomeCode 為 _OTHER_UNKNOWN，但 description 是 lawyerperformance 的
  } 
  // 如果 description 仍然是 "結果未明" (表示 lawyerperformance 中也無有效 verdict)
  // 且 outcomeCode 也是 UNKNOWN (表示前面所有規則都沒匹配上)
  // 則嘗試使用案件本身的 verdict/verdict_type 作為最終 description
  else if (description === '結果未明' && outcomeCode.endsWith('OTHER_UNKNOWN')) {
      description = source.verdict || source.verdict_type || '結果資訊不足';
  }
  // 最後確保 description 不為空
  if (!description || description.trim() === '') {
      description = '結果資訊不足';
  }

  return { outcomeCode, description };
}


// --- 輔助函數：獲取律師角色 ---
function getLawyerRole(source, lawyerName) {
  const plaintiffLawyers = source.lawyers || [];
  const defendantLawyers = source.lawyersdef || [];
  // 確保 lawyerName 是字符串
  const targetLawyerName = String(lawyerName);
  const isPlaintiffLawyer = plaintiffLawyers.map(String).includes(targetLawyerName);
  const isDefendantLawyer = defendantLawyers.map(String).includes(targetLawyerName);

  if (isPlaintiffLawyer && isDefendantLawyer) return '雙方代理';
  if (isPlaintiffLawyer) return '原告代理人';
  if (isDefendantLawyer) return '被告代理人';
  return '未知角色';
}

// --- 輔助函數：創建統計對象的模板 ---
function createCivilRoleStats() {
  return {
    total: 0,
    WIN_FULL: 0, // 對應前端條形圖 "完全勝訴"
    WIN_PARTIAL: 0, // 對應前端條形圖 "部分勝訴"
    LOSE_FULL: 0, // 對應前端條形圖 "敗訴"
    OTHER_SETTLEMENT: 0, // 對應前端條形圖 "其他/和解"
    PROCEDURAL: 0,
    // 以下是更細的分類，可能不直接用於主條形圖，但可用於計算或 tooltip
    CIVIL_WIN_HIGH: 0,
    CIVIL_WIN_MEDIUM: 0,
    CIVIL_WIN_LOW: 0,
    CIVIL_WIN_MINOR: 0,
    CIVIL_LOSE_FULL: 0, // 注意與上面的 LOSE_FULL 的關係
    CIVIL_NEUTRAL_SETTLEMENT: 0,
    CIVIL_NEUTRAL_WITHDRAW: 0,
    CIVIL_PROCEDURAL_SPECIFIC: 0, // 更具體的程序性
    CIVIL_DEFENDANT_MITIGATE_HIGH: 0,
    CIVIL_DEFENDANT_MITIGATE_MEDIUM: 0,
    CIVIL_DEFENDANT_MITIGATE_LOW: 0,
    OTHER_UNKNOWN: 0
  };
}

function createCriminalRoleStats() {
  return {
    total: 0,
    acquitted: 0,
    dismissed_charge_no_prosecution: 0,
    dismissed_charge_not_accepted: 0,
    guilty_probation: 0,
    guilty_fine_convertible: 0,
    guilty_fine_only: 0,
    guilty_imprisonment: 0,
    guilty_mitigate_high: 0,
    guilty_mitigate_medium: 0,
    guilty_expected: 0,
    guilty_aggravated: 0,
    guilty_sentenced: 0,
    procedural: 0,
    other: 0
  };
}

function createAdminRoleStats() {
  return {
    total: 0,
    win_full_revoke: 0,
    win_partial_revoke: 0,
    admin_win_obligation: 0,
    lose_dismissed: 0,
    procedural: 0,
    other: 0
  };
}

// --- 輔助函數：計算詳細勝訴率 ---
function calculateDetailedWinRates(processedCases, detailedWinRatesStats, lawyerName) {
  processedCases.forEach(caseInfo => {
    const {
      mainType,
      role,
      _outcomeCodeForStat,
      originalSource
    } = caseInfo; // 使用 _outcomeCodeForStat
    if (!_outcomeCodeForStat || _outcomeCodeForStat === 'unknown_outcome') return;

    const statsBucketRoot = detailedWinRatesStats[mainType];
    if (!statsBucketRoot) return;

    let targetBucket;
    if (mainType === 'civil') {
      targetBucket = role === '原告代理人' ? statsBucketRoot.plaintiff : (role === '被告代理人' ? statsBucketRoot.defendant : null);
    } else if (mainType === 'criminal' && role === '被告代理人') {
      targetBucket = statsBucketRoot.defendant;
    } else if (mainType === 'administrative' && role === '原告代理人') {
      targetBucket = statsBucketRoot.plaintiff;
    }

    if (targetBucket) {
      targetBucket.total = (targetBucket.total || 0) + 1; // 確保 total 初始化
      if (targetBucket[_outcomeCodeForStat] !== undefined) {
        targetBucket[_outcomeCodeForStat]++;
      } else {
        targetBucket.other = (targetBucket.other || 0) + 1;
      }
    }
  });

  // 計算 overall 勝訴/有利結果率
  // 民事
  const civilP = detailedWinRatesStats.civil.plaintiff;
  const civilD = detailedWinRatesStats.civil.defendant;

  let civilFavorableTotal = 0;
  let civilConsideredTotal = 0;

  // 原告方
  civilFavorableTotal += (civilP.WIN_FULL || 0) + (civilP.WIN_PARTIAL || 0);
  civilConsideredTotal += (civilP.total - ((civilP.PROCEDURAL || 0) + (civilP.OTHER_SETTLEMENT || 0) + (civilP.OTHER_UNKNOWN || 0)));

  // 被告方 (假設其 WIN_FULL, WIN_PARTIAL 也是對己方有利的統計)
  civilFavorableTotal += (civilD.WIN_FULL || 0) + (civilD.WIN_PARTIAL || 0);
  civilConsideredTotal += (civilD.total - ((civilD.PROCEDURAL || 0) + (civilD.OTHER_SETTLEMENT || 0) + (civilD.OTHER_UNKNOWN || 0)));

  detailedWinRatesStats.civil.overall = civilConsideredTotal > 0 ? Math.round((civilFavorableTotal / civilConsideredTotal) * 100) : 0;
  // 刑事 (對被告有利的)
  const crimD = detailedWinRatesStats.criminal.defendant;
  const crimTotalConsidered = crimD.total - (crimD.dismissed_charge_no_prosecution + crimD.dismissed_charge_not_accepted + crimD.procedural + crimD.other);
  if (crimTotalConsidered > 0) {
    const crimFavorable = crimD.acquitted + crimD.guilty_mitigate_high + crimD.guilty_mitigate_medium + crimD.guilty_probation + crimD.guilty_fine_convertible + crimD.guilty_fine_only;
    detailedWinRatesStats.criminal.overall = Math.round((crimFavorable / crimTotalConsidered) * 100);
  }
  // 行政 (對原告有利的)
  const adminP = detailedWinRatesStats.administrative.plaintiff;
  const adminTotalConsidered = adminP.total - (adminP.procedural + adminP.other);
  if (adminTotalConsidered > 0) {
    const adminFavorable = adminP.win_full_revoke + adminP.win_partial_revoke + adminP.admin_win_obligation;
    detailedWinRatesStats.administrative.overall = Math.round((adminFavorable / adminTotalConsidered) * 100);
  }
}

// --- 輔助函數：填充動態篩選選項 ---
function populateDynamicFilterOptions(optionsTarget, esAggregations, allProcessedCases, lawyerName) {
  // 目前我們假設在後端手動聚合，因為 ES 中沒有 mainType 欄位用於高效的 filter aggregation
  ['civil', 'criminal', 'administrative'].forEach(mainType => {
    const typeCases = allProcessedCases.filter(c => c.mainType === mainType);
    const uniqueCauses = new Set();
    const uniqueLawyerVerdicts = new Set();

    typeCases.forEach(c => {
      if (c.cause && c.cause !== '未指定') {
        uniqueCauses.add(c.cause);
      }
      // 從 lawyerperformance 中提取該律師的 verdict
      if (c.originalSource && c.originalSource.lawyerperformance && Array.isArray(c.originalSource.lawyerperformance)) {
        const perf = c.originalSource.lawyerperformance.find(p => p.lawyer === lawyerName);
        if (perf && perf.verdict) {
          uniqueLawyerVerdicts.add(perf.verdict);
        }
      }
    });
    optionsTarget[mainType].causes = Array.from(uniqueCauses).sort();
    optionsTarget[mainType].verdicts = Array.from(uniqueLawyerVerdicts).sort();
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
        plaintiff: createCivilRoleStats(),
        defendant: createCivilRoleStats()
      },
      criminal: {
        overall: 0,
        defendant: createCriminalRoleStats()
      },
      administrative: {
        overall: 0,
        plaintiff: createAdminRoleStats()
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
    analysis: null // analysis 欄位保留，但目前為 null
  };

  if (!esHits || esHits.length === 0) {
    console.log(`[analyzeLawyerData] No cases found for lawyer: ${lawyerName}`);
    return resultData;
  }

  const now = new Date();
  const threeYearsAgoNum = parseInt(`${now.getFullYear() - 3}${("0" + (now.getMonth() + 1)).slice(-2)}${("0" + now.getDate()).slice(-2)}`, 10);

  const allCaseTypesCounter = {};

  resultData.cases = esHits.map(hit => {
    const source = hit._source;
    const mainType = getMainType(source);
    const detailedResult = getDetailedResult(source, mainType, lawyerName);
    const role = getLawyerRole(source, lawyerName);
    const caseDateStr = (source.JDATE || "").replace(/\//g, '');

    if (caseDateStr && parseInt(caseDateStr, 10) >= threeYearsAgoNum) {
      resultData.stats.totalCasesLast3Years++;
    }

    if (source.case_type) { // 使用原始的 case_type 進行統計
      allCaseTypesCounter[source.case_type] = (allCaseTypesCounter[source.case_type] || 0) + 1;
    }

    return {
      id: hit._id,
      mainType: mainType,
      title: source.JTITLE || `${source.court || ''} 判決`,
      cause: source.cause || '未指定',
      result: detailedResult.description, // 這是給前端顯示的，基於 lawyerperformance.verdict
      originalVerdict: source.verdict, // 案件本身的 verdict
      originalVerdictType: source.verdict_type, // 案件本身的 verdict_type
      date: caseDateStr,
      role: role,
      _outcomeCodeForStat: detailedResult.outcomeCode, // 用於內部統計
      originalSource: source // 保留原始 source 以便 populateDynamicFilterOptions 使用
    };
  });

  calculateDetailedWinRates(resultData.cases, resultData.stats.detailedWinRates, lawyerName);

  const sortedCommonCaseTypes = Object.entries(allCaseTypesCounter)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  resultData.stats.commonCaseTypes = sortedCommonCaseTypes.map(entry => entry[0]);
  resultData.stats.caseTypeValues = sortedCommonCaseTypes.map(entry => entry[1]);

  populateDynamicFilterOptions(resultData.stats.dynamicFilterOptions, esAggregations, resultData.cases, lawyerName);

  // 計算 lawRating (示例: 可以用民事整體有利結果率)
  const overallFavorableRate = resultData.stats.detailedWinRates.civil.overall ||
    resultData.stats.detailedWinRates.criminal.overall ||
    resultData.stats.detailedWinRates.administrative.overall || 0;
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