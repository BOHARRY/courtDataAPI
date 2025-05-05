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
  const idToken = req.headers.authorization?.split('Bearer ')[1];
  if (!idToken) {
    console.warn("verifyToken: No token provided.");
    return res.status(401).json({
      error: 'Unauthorized: No token provided'
    });
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // 將 uid 等信息附加到請求
    console.log("verifyToken: Token verified for UID:", req.user.uid);
    next(); // Token 有效，繼續處理請求
  } catch (error) {
    console.error('Error verifying token:', error);
    // 區分錯誤類型，例如 token 過期
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Unauthorized: Token expired'
      });
    }
    return res.status(403).json({
      error: 'Unauthorized: Invalid token'
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
              fragment_size: 200,
              number_of_fragments: 1
            },
            summary_ai: {
              fragment_size: 150,
              number_of_fragments: 1
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
    must.push({
      multi_match: {
        query,
        fields: ['JFULL^3', 'summary_ai^2', 'main_reasons_ai^2', 'JTITLE', 'tags'],
        type: 'best_fields',
        operator: 'and'
      }
    });
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
  const hits = esResult.hits.hits.map(hit => {
    const source = hit._source;
    const highlight = hit.highlight || {};
    if (highlight.JFULL?.[0]) source.JFULL_highlight = highlight.JFULL[0];
    if (highlight.summary_ai?.[0]) source.summary_ai_highlight = highlight.summary_ai[0];
    return {
      id: hit._id,
      ...source
    };
  });

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

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`🚀 Listening on ${port}`))