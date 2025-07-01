# 法條搜索 API 文檔

## 概述

法條搜索 API 提供強大的法條檢索功能，支援精準搜索、語意搜索、自動完成建議等多種搜索方式。基於 Elasticsearch 和 OpenAI embedding 技術，為律師提供高效的法條查詢體驗。

## 資料結構

### law_book Index Mapping

```json
{
  "mappings": {
    "properties": {
      "article_number": { "type": "keyword" },
      "article_number_numeric": { "type": "float" },
      "article_number_str": { "type": "keyword" },
      "chapter": { "type": "keyword" },
      "code_name": { "type": "keyword" },
      "embedding_vector": {
        "type": "dense_vector",
        "dims": 1536,
        "index": true,
        "similarity": "cosine"
      },
      "plain_explanation": { "type": "text" },
      "section": { "type": "keyword" },
      "subsection": { "type": "keyword" },
      "synonyms": { "type": "keyword" },
      "text_original": { "type": "text" },
      "typical_scenarios": { "type": "text" },
      "upload_timestamp": { "type": "date" },
      "volume": { "type": "keyword" }
    }
  }
}
```

## API 端點

### 1. 法條精準搜索

**端點**: `GET /api/law-search/articles`

**描述**: 支援條號、法典名稱、關鍵字等多種精準搜索方式

**認證**: 需要 JWT Token

**積分消耗**: 1 積分

**查詢參數**:
- `query` (string, optional): 搜索關鍵字
- `code_name` (string, optional): 法典名稱篩選
- `article_number` (string, optional): 條號篩選
- `search_type` (string, optional): 搜索類型，可選值：
  - `exact`: 精確搜索
  - `fuzzy`: 模糊搜索
  - `mixed`: 混合搜索（預設）
- `page` (number, optional): 頁碼，預設 1
- `pageSize` (number, optional): 每頁結果數，預設 20

**請求範例**:
```bash
GET /api/law-search/articles?query=侵權行為&code_name=民法&page=1&pageSize=10
```

**回應範例**:
```json
{
  "success": true,
  "articles": [
    {
      "id": "doc_id_123",
      "code_name": "民法",
      "article_number": "第184條",
      "article_number_str": "184",
      "text_original": "因故意或過失，不法侵害他人之權利者，負損害賠償責任...",
      "plain_explanation": "本條規定一般侵權行為的成立要件...",
      "typical_scenarios": "車禍事故、醫療糾紛、名譽損害...",
      "synonyms": ["侵權", "損害賠償", "過失責任"],
      "relevanceScore": 15.2,
      "highlights": {
        "text_original": ["因故意或過失，不法<em>侵害</em>他人之權利者"]
      }
    }
  ],
  "total": 25,
  "page": 1,
  "pageSize": 10,
  "totalPages": 3,
  "searchTime": 45,
  "creditsDeducted": 1,
  "userCreditsRemaining": 99
}
```

### 2. 法條語意搜索

**端點**: `POST /api/law-search/semantic`

**描述**: 使用 AI 進行自然語言查詢理解和向量搜索

**認證**: 需要 JWT Token

**積分消耗**: 3 積分

**請求體**:
```json
{
  "query": "房東對於租賃物的修繕義務有哪些相關法條？",
  "context": "租賃契約糾紛",
  "page": 1,
  "pageSize": 10
}
```

**回應範例**:
```json
{
  "success": true,
  "articles": [
    {
      "id": "doc_id_456",
      "code_name": "民法",
      "article_number": "第429條",
      "text_original": "租賃物之修繕，除契約另有訂定外，由出租人負擔...",
      "relevanceScore": 0.89
    }
  ],
  "total": 15,
  "page": 1,
  "pageSize": 10,
  "enhancedQuery": {
    "keywords": ["修繕義務", "租賃契約", "出租人責任"],
    "codes": ["民法"],
    "enhanced": "租賃物修繕義務與出租人責任相關法條"
  },
  "searchTime": 120,
  "processingTime": 1500,
  "creditsDeducted": 3,
  "userCreditsRemaining": 96
}
```

### 3. 法條詳細內容

**端點**: `GET /api/law-search/articles/:id`

**描述**: 獲取特定法條的完整資訊

**認證**: 需要 JWT Token

**積分消耗**: 無

**回應範例**:
```json
{
  "success": true,
  "article": {
    "id": "doc_id_123",
    "code_name": "民法",
    "volume": "",
    "chapter": "第二編債",
    "section": "第一章通則",
    "subsection": "",
    "article_number": "第184條",
    "article_number_str": "184",
    "text_original": "因故意或過失，不法侵害他人之權利者，負損害賠償責任...",
    "plain_explanation": "本條規定一般侵權行為的成立要件...",
    "typical_scenarios": "車禍事故、醫療糾紛、名譽損害...",
    "synonyms": ["侵權", "損害賠償", "過失責任"],
    "upload_timestamp": "2024-01-01T00:00:00Z"
  }
}
```

### 4. 搜索建議

**端點**: `GET /api/law-search/suggestions`

**描述**: 提供搜索自動完成建議

**認證**: 無需認證

**積分消耗**: 無

**查詢參數**:
- `query` (string, required): 搜索關鍵字
- `type` (string, optional): 建議類型，可選值：
  - `all`: 所有類型（預設）
  - `code`: 僅法典名稱
  - `article`: 僅條號

**請求範例**:
```bash
GET /api/law-search/suggestions?query=民法&type=all
```

**回應範例**:
```json
{
  "success": true,
  "suggestions": [
    {
      "type": "code",
      "text": "民法",
      "count": 1225
    },
    {
      "type": "article",
      "text": "民法第184條",
      "code_name": "民法",
      "article_number": "184"
    }
  ]
}
```

## 使用場景

### 1. 律師日常查詢
- **條號查詢**: 「民法第184條」
- **概念搜索**: 「侵權行為」
- **情境查詢**: 「房東修繕義務」

### 2. 法律研究
- **主題研究**: 「契約責任相關法條」
- **比較分析**: 「民法與商事法的差異」
- **案例準備**: 「醫療糾紛適用法條」

### 3. 智能輔助
- **自動完成**: 輸入「民」自動建議「民法」
- **相關推薦**: 查詢一條法條時推薦相關條文
- **語意理解**: 自然語言轉換為精準法條搜索

## 技術特色

1. **混合搜索**: 結合關鍵字搜索和向量搜索
2. **AI 優化**: 使用 GPT-4o-mini 優化查詢意圖
3. **高精度向量**: OpenAI text-embedding-3-large (1536維)
4. **智能建議**: 基於用戶輸入提供相關建議
5. **高亮顯示**: 搜索結果中關鍵字高亮
6. **多維篩選**: 支援法典、條號、章節等多維度篩選

## 錯誤處理

所有 API 都遵循統一的錯誤回應格式：

```json
{
  "success": false,
  "error": "錯誤類型",
  "message": "詳細錯誤訊息"
}
```

常見錯誤碼：
- `400`: 請求參數錯誤
- `401`: 未授權
- `402`: 積分不足
- `404`: 資源不存在
- `502`: 外部服務錯誤（OpenAI API）
