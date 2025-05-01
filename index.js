import express from 'express'
import cors from 'cors'
import {
  Client
} from '@elastic/elasticsearch'
import dotenv from 'dotenv'
dotenv.config()

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

// 搜尋判決書
app.get('/search', async (req, res) => {
  try {
    const {
      query, // 關鍵字
      caseTypes, // 案件類型（逗號分隔的字串）
      verdict, // 勝敗結果
      laws, // 法條（逗號分隔的字串）
      courtLevels, // 法院層級（逗號分隔的字串）
      minAmount, // 最低金額
      maxAmount, // 最高金額
      reasoningStrength, // 推理強度
      complexity, // 案件複雜度
      winReasons, // 勝訴理由（逗號分隔的字串）
      onlyWithFullText, // 只顯示有全文的
      includeCitedCases, // 包含引用案例
      onlyRecent3Years, // 近三年判決
      page = 1,
      pageSize = 20
    } = req.query

    // 建構多條件查詢
    const must = []
    const filter = []

    // 關鍵字搜尋 - 使用 multi_match 涵蓋多個欄位
    if (query) {
      must.push({
        multi_match: {
          query: query,
          fields: [
            'JFULL^3',
            'summary_ai^2',
            'main_reasons_ai^2',
            'JTITLE',
            'tags'
          ],
          type: 'best_fields',
          operator: 'and'
        }
      })
    }

    // 案件類型篩選
    if (caseTypes) {
      const types = caseTypes.split(',')
      filter.push({
        terms: {
          'case_type': types
        }
      })
    }

    // 勝敗結果篩選
    if (verdict && verdict !== '不指定') {
      filter.push({
        term: {
          'verdict': verdict
        }
      })
    }

    // 法條篩選
    if (laws) {
      const lawList = laws.split(',')
      lawList.forEach(law => {
        must.push({
          match: {
            'legal_basis': law
          }
        })
      })
    }

    // 法院層級篩選
    if (courtLevels) {
      const levels = courtLevels.split(',')
      const courtQuery = {
        bool: {
          should: []
        }
      }

      levels.forEach(level => {
        if (level === '地方法院') {
          // 使用 match 查詢而不是 wildcard
          courtQuery.bool.should.push({
            match_phrase: {
              court: '簡易'
            }
          }, {
            match_phrase: {
              court: '地方法'
            }
          })
        } else if (level === '高等法院') {
          courtQuery.bool.should.push({
            match_phrase: {
              court: '高等'
            }
          })
        } else if (level === '最高法院') {
          courtQuery.bool.should.push({
            match_phrase: {
              court: '最高'
            }
          })
        } else if (level === '智慧財產及商業法院') {
          courtQuery.bool.should.push({
            match_phrase: {
              court: '智慧財產'
            }
          })
        }
      })

      if (courtQuery.bool.should.length > 0) {
        filter.push(courtQuery)
      }
    }

    // 金額範圍篩選
    if (minAmount || maxAmount) {
      const rangeQuery = {}
      if (minAmount) rangeQuery.gte = parseInt(minAmount)
      if (maxAmount) rangeQuery.lte = parseInt(maxAmount)

      filter.push({
        range: {
          'compensation_claimed': rangeQuery
        }
      })
    }

    // 推理強度篩選
    if (reasoningStrength) {
      filter.push({
        term: {
          'outcome_reasoning_strength': reasoningStrength
        }
      })
    }

    // 案件複雜度篩選
    if (complexity) {
      let minScore, maxScore
      if (complexity.includes('簡單')) {
        minScore = 1
        maxScore = 2
      } else if (complexity.includes('普通')) {
        minScore = 3
        maxScore = 5
      } else if (complexity.includes('複雜')) {
        minScore = 6
        maxScore = 9
      }

      if (minScore && maxScore) {
        filter.push({
          range: {
            'SCORE': {
              gte: minScore,
              lte: maxScore
            }
          }
        })
      }
    }

    // 勝訴理由篩選
    if (winReasons) {
      const reasons = winReasons.split(',')
      must.push({
        terms: {
          'main_reasons_ai': reasons
        }
      })
    }

    // 進階篩選
    if (onlyWithFullText === 'true') {
      filter.push({
        exists: {
          'field': 'JFULL'
        }
      })
    }

    if (includeCitedCases === 'true') {
      must.push({
        bool: {
          should: [{
            exists: {
              'field': 'citations'
            }
          }, {
            term: {
              'cited_cases_count': {
                gte: 1
              }
            }
          }]
        }
      })
    }

    if (onlyRecent3Years === 'true') {
      const threeYearsAgo = new Date()
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)

      filter.push({
        range: {
          'date': {
            gte: threeYearsAgo.getFullYear() * 10000 +
              (threeYearsAgo.getMonth() + 1) * 100 +
              threeYearsAgo.getDate()
          }
        }
      })
    }

    // 建構最終查詢
    const esQuery = {
      bool: {}
    }

    if (must.length) esQuery.bool.must = must
    if (filter.length) esQuery.bool.filter = filter

    const from = (parseInt(page) - 1) * parseInt(pageSize)

    const result = await client.search({
      index: 'search-boooook',
      from,
      size: pageSize,
      query: Object.keys(esQuery.bool).length > 0 ? esQuery : {
        match_all: {}
      },
      aggs: { // 添加聚合
        win_reasons: {
          terms: {
            field: 'main_reasons_ai',
            size: 20,
            order: { _count: 'desc' }  // 按出現次數排序
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
    })

    // 處理高亮結果
    const hits = result.hits.hits.map(hit => {
      const source = hit._source
      const highlight = hit.highlight || {}

      // 如果有高亮結果，使用高亮文本
      if (highlight.JFULL && highlight.JFULL.length > 0) {
        source.JFULL_highlight = highlight.JFULL[0]
      }
      if (highlight.summary_ai && highlight.summary_ai.length > 0) {
        source.summary_ai_highlight = highlight.summary_ai[0]
      }

      return {
        id: hit._id,
        ...source
      }
    })

    res.json({
      total: result.hits.total.value,
      hits: hits,
      totalPages: Math.ceil(result.hits.total.value / pageSize),
      // 添加聚合結果
      aggregations: {
        win_reasons: result.aggregations?.win_reasons?.buckets || []
      }
    })
  } catch (e) {
    console.error('搜尋錯誤:', e)
    res.status(500).json({
      error: e.message
    })
  }
})

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