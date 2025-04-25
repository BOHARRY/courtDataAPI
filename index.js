import express from 'express'
import cors from 'cors'
import { Client } from '@elastic/elasticsearch'
import dotenv from 'dotenv'
dotenv.config()

const app = express()
app.use(cors())

const client = new Client({
  node: process.env.ES_URL,
  auth: {
    apiKey: process.env.ES_API_KEY
  }
})

app.get('/search', async (req, res) => {
  const q = req.query.q || ''
  const page = parseInt(req.query.page || '1')     // 第幾頁，預設第1頁
  const pageSize = parseInt(req.query.pageSize || '10') // 每頁幾筆，預設10筆

  const from = (page - 1) * pageSize

  try {
    const result = await client.search({
      index: 'search-boooook',
      from,
      size: pageSize,
      query: {
        match_phrase: {
          JFULL: q
        }
      },
      highlight: {
        fields: {
          JFULL: {}
        }
      }
    })

    res.json({
      total: result.hits.total.value,
      hits: result.hits.hits
    })
  } catch (e) {
    res.status(500).send(e.message)
  }
})


const port = process.env.PORT || 3000
app.listen(port, () => console.log(`🚀 Listening on ${port}`))
