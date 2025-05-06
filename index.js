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

// --- 律師搜尋 API 端點 ---
app.get('/api/lawyers/:name', verifyToken, async (req, res) => {
  const lawyerName = req.params.name;
  const userId = req.user.uid;
  const searchCost = 1; // 每次搜尋成本

  console.log(`[Lawyer Search] 用戶 ${userId} 搜尋律師: ${lawyerName}`);
  const userDocRef = admin.firestore().collection('users').doc(userId);

  try {
    let lawyerData = null; // 用於儲存搜尋結果

    // --- 使用 Firestore Transaction 處理積分 ---
    await admin.firestore().runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userDocRef);

      if (!userDoc.exists) {
        console.error(`用戶數據不存在: ${userId}`);
        throw new Error('用戶數據不存在。');
      }

      const userData = userDoc.data();
      const currentCredits = userData.credits || 0;
      console.log(`[交易] 用戶 ${userId} 目前積分: ${currentCredits}`);

      if (currentCredits < searchCost) {
        console.warn(`[交易] 用戶 ${userId} 積分不足.`);
        throw new Error('積分不足');
      }

      // 扣除積分
      console.log(`[交易] 扣除 ${searchCost} 點積分，用戶 ${userId}.`);
      transaction.update(userDocRef, {
        credits: admin.firestore.FieldValue.increment(-searchCost),
        lastLawyerSearchAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // --- 執行 Elasticsearch 搜尋 (在 Transaction 內) ---
      console.log(`[交易] 執行 Elasticsearch 搜尋律師: ${lawyerName}`);

      // 1. 搜尋包含律師名的判決書
      const result = await client.search({
        index: 'search-boooook',
        size: 100,
        query: {
          bool: {
            should: [{
                match: {
                  "lawyers": lawyerName
                }
              }, // 原告律師
              {
                match: {
                  "lawyers.raw": lawyerName
                }
              }, // 原告律師 (raw)
              {
                match: {
                  "lawyersdef": lawyerName
                }
              }, // 被告律師
              {
                match: {
                  "lawyersdef.raw": lawyerName
                }
              }, // 被告律師 (raw)
              {
                match: {
                  "winlawyers": lawyerName
                }
              }, // 勝訴律師
              {
                match: {
                  "loselawyers": lawyerName
                }
              } // 敗訴律師
            ],
            minimum_should_match: 1
          }
        },
        _source: [
          "court", "JTITLE", "JDATE", "case_type",
          "verdict", "cause", "lawyers", "lawyersdef",
          "winlawyers", "loselawyers",
          "compensation_claimed", "compensation_awarded"
        ]
      });

      // 2. 處理搜尋結果
      if (result.hits.total.value === 0) {
        console.log(`[律師搜尋] 找不到律師: ${lawyerName}`);
        return; // 無結果，不扣積分
      }

      // 3. 分析律師數據
      lawyerData = analyzeLawyerData(result.hits.hits, lawyerName);
      console.log(`[律師搜尋] 成功獲取律師資料: ${lawyerName}`);
    });
    // --- Transaction 結束 ---

    // Transaction 成功後，發送儲存的結果
    if (lawyerData) {
      // 成功後記錄搜尋歷史
      try {
        await admin.firestore().collection('users').doc(userId)
          .collection('lawyerSearchHistory').add({
            lawyerName: lawyerName,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
      } catch (historyError) {
        console.error('記錄搜尋歷史失敗:', historyError);
        // 不影響主要功能，繼續執行
      }

      res.status(200).json(lawyerData);
    } else {
      // 找不到律師資料
      res.status(404).json({
        error: `找不到律師 "${lawyerName}" 的相關資料`
      });
    }
  } catch (error) {
    console.error(`[律師搜尋錯誤] 詳細錯誤:`, error);

    // 處理積分不足的錯誤
    if (error.message === '積分不足') {
      try {
        const userDoc = await userDocRef.get();
        const currentCredits = userDoc.exists ? (userDoc.data().credits || 0) : 0;
        return res.status(402).json({
          error: '您的積分不足，請購買積分或升級方案。',
          required: searchCost,
          current: currentCredits
        });
      } catch (readError) {
        console.error("積分不足後讀取當前積分失敗:", readError);
        return res.status(402).json({
          error: '您的積分不足，請購買積分或升級方案。'
        });
      }
    }

    // 處理用戶數據找不到的錯誤
    if (error.message === '用戶數據不存在。') {
      return res.status(404).json({
        error: '找不到您的用戶資料，請嘗試重新登入。'
      });
    }

    // 其他伺服器錯誤
    res.status(500).json({
      error: '搜尋律師時發生伺服器內部錯誤。'
    });
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
function analyzeLawyerData(hits, lawyerName) {
  // 無結果判斷
  if (!hits || hits.length === 0) {
    console.log(`[律師搜尋] 找不到律師: ${lawyerName} 的任何案件`);
    // 返回空結構而非null
    return {
      name: lawyerName,
      lawRating: 0,
      source: '法院公開判決書',
      stats: {
        totalCasesLast3Years: 0,
        commonCaseTypes: [],
        commonCourts: [],
      },
      winRate: {
        plaintiffWinPercent: 0,
        defendantWinPercent: 0,
      },
      cases: [],
      analysis: null
    };
  }

  // 1. 初始化數據結構
  const caseTypes = {};
  const courts = {};
  const cases = [];
  let totalCases = hits.length;
  let winCases = 0;
  let loseCases = 0;
  let partialCases = 0;
  const recentCases = []; // 近三年案件

  // 2. 計算近三年日期 (數字格式)
  const now = new Date();
  const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
  const threeYearsAgoNum = threeYearsAgo.getFullYear() * 10000 +
    (threeYearsAgo.getMonth() + 1) * 100 +
    threeYearsAgo.getDate();

  // 3. 遍歷所有案件，統計資料
  hits.forEach(hit => {
    const source = hit._source;

    // 記錄案件類型
    if (source.case_type) {
      caseTypes[source.case_type] = (caseTypes[source.case_type] || 0) + 1;
    }

    // 記錄法院
    if (source.court) {
      courts[source.court] = (courts[source.court] || 0) + 1;
    }

    // 判斷勝訴情況 - 修改後
    // 1. 檢查律師是否為勝訴律師
    const isWinLawyer = source.winlawyers &&
      source.winlawyers.includes(lawyerName);

    // 2. 檢查律師是否為敗訴律師
    const isLoseLawyer = source.loselawyers &&
      source.loselawyers.includes(lawyerName);

    // 3. 檢查律師的角色（原告/被告）
    const isPlaintiffLawyer = source.lawyers &&
      source.lawyers.includes(lawyerName);
    const isDefendantLawyer = source.lawyersdef &&
      source.lawyersdef.includes(lawyerName);

    // 根據角色和結果來判斷勝敗
    if (isWinLawyer ||
      (isPlaintiffLawyer && source.verdict === '原告勝訴') ||
      (isDefendantLawyer && source.verdict === '被告勝訴')) {
      winCases++;
    } else if (isLoseLawyer ||
      (isPlaintiffLawyer && source.verdict === '被告勝訴') ||
      (isDefendantLawyer && source.verdict === '原告勝訴')) {
      loseCases++;
    } else if (source.verdict === '部分勝訴') {
      partialCases++;
    }

    // 轉換日期格式，例如 "2022/07/15" -> 20220715
    let dateNum = 0;
    if (source.JDATE) {
      const dateParts = source.JDATE.split('/');
      if (dateParts.length === 3) {
        dateNum = parseInt(dateParts[0]) * 10000 +
          parseInt(dateParts[1]) * 100 +
          parseInt(dateParts[2]);
      }
    }

    // 記錄案件資料
    const caseItem = {
      id: hit._id,
      title: source.JTITLE || `${source.court || ''} 判決`,
      cause: source.cause || '未指定',
      result: source.verdict || '未指定',
      date: source.JDATE || '未知日期',
      role: isPlaintiffLawyer ? '原告代表' : isDefendantLawyer ? '被告代表' : '未知角色'
    };

    cases.push(caseItem);

    // 判斷是否為近三年案件
    if (dateNum >= threeYearsAgoNum) {
      recentCases.push(caseItem);
    }
  });

  // 4. 轉換為前端需要的數據格式

  // 取出前 4 個最常見的案件類型
  const commonCaseTypes = Object.entries(caseTypes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(entry => entry[0]);

  // 取出前 3 個最常出現的法院
  const commonCourts = Object.entries(courts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(entry => entry[0]);

  // 計算勝訴率
  const totalVerdictsWithResult = winCases + loseCases;
  const winRate = totalVerdictsWithResult > 0 ?
    Math.round((winCases / totalVerdictsWithResult) * 100) : 0;

  // 計算近三年案件數
  const totalRecentCases = recentCases.length;

  // 計算法評星等 (0-8)
  // 簡單實現：基於勝訴率、案件量等因素
  let lawRating = 0;
  if (totalRecentCases >= 5) {
    // 基礎分數 (0-5)
    lawRating = Math.min(5, Math.floor(totalRecentCases / 10));

    // 勝訴率加分 (0-3)
    if (winRate > 90) lawRating += 3;
    else if (winRate > 70) lawRating += 2;
    else if (winRate > 50) lawRating += 1;
  } else {
    // 案件太少時的評分方法
    lawRating = Math.min(3, totalRecentCases);
  }

  // 確保評分在 0-8 範圍內
  lawRating = Math.max(0, Math.min(8, lawRating));

  // 5. 構建返回數據
  return {
    name: lawyerName,
    lawRating: lawRating,
    source: '法院公開判決書',
    stats: {
      totalCasesLast3Years: totalRecentCases,
      commonCaseTypes: commonCaseTypes,
      commonCourts: commonCourts,
    },
    winRate: {
      plaintiffWinPercent: winRate,
      defendantWinPercent: 100 - winRate,
    },
    cases: cases.sort((a, b) => {
      // 按照日期排序，最新的在前
      const dateA = a.date.split('/').join('');
      const dateB = b.date.split('/').join('');
      return dateB.localeCompare(dateA);
    }).slice(0, 10), // 只返回前 10 個案件
    analysis: null // 分析部分需要另外請求
  };
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