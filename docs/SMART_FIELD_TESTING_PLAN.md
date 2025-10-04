# 🧪 方案 C: 智能欄位選擇 - 測試計劃與效果分析

> **相關文檔**:
> - [README_SMART_FIELD.md](./README_SMART_FIELD.md) - 文檔導航
> - [SMART_FIELD_THREE_LAYER_ARCHITECTURE.md](./SMART_FIELD_THREE_LAYER_ARCHITECTURE.md) - 三層架構設計
> - [SMART_FIELD_SELECTION_PLAN.md](./SMART_FIELD_SELECTION_PLAN.md) - 方案設計
> - [SMART_FIELD_CODE_CHANGES.md](./SMART_FIELD_CODE_CHANGES.md) - 代碼修改指南
> - [SMART_FIELD_OPTIMIZATION_PROPOSALS.md](./SMART_FIELD_OPTIMIZATION_PROPOSALS.md) - 優化建議

---

## 📊 測試目標

### 1. 功能正確性
- ✅ 智能欄位選擇功能正常運作
- ✅ 不同 `intended_analysis` 返回正確的欄位
- ✅ 向後兼容（不指定 `intended_analysis` 時正常運作）

### 2. Token 優化效果
- ✅ 驗證 Token 節省 50-80%
- ✅ 對比不同場景的 Token 消耗

### 3. GPT 理解能力
- ✅ GPT 能正確選擇 `intended_analysis`
- ✅ 準確率 > 90%

### 4. 性能影響
- ✅ 響應時間不增加
- ✅ API 調用次數減少

---

## 🧪 測試場景

### 場景 1: 列表查詢

**用戶問題**: "列出黃麟捷法官的所有案件"

**預期行為**:
```javascript
// GPT 應該調用
semantic_search_judgments({
    query: "*",
    judge_name: "黃麟捷",
    limit: 50,
    intended_analysis: "list"  // ✅ 正確選擇
})
```

**預期返回欄位**:
```json
{
  "判決書": [
    {
      "判決字號": "CLEV,114,壢小,418,20250603,1",
      "判決日期": "2025-06-03",
      "案由": "損害賠償",
      "法官": "黃麟捷",
      "裁判結果": "原告勝訴",
      "法院": "臺灣桃園地方法院"
      // ✅ 只有索引欄位，沒有 summary_ai, claim_amount 等
    }
  ]
}
```

**Token 對比**:
- 當前方案: 50 筆 × 200 tokens = 10,000 tokens
- 方案 C: 50 筆 × 50 tokens = 2,500 tokens
- **節省**: 75%

---

### 場景 2: 金額分析

**用戶問題**: "黃麟捷法官的案件中，牽涉金額最大的案件是?"

**預期行為**:
```javascript
// 第1輪: GPT 應該調用
semantic_search_judgments({
    query: "*",
    judge_name: "黃麟捷",
    limit: 50,
    intended_analysis: "amount_analysis"  // ✅ 正確選擇
})

// 第2輪: GPT 調用本地函數
calculate_verdict_statistics({
    analysis_type: "amount_stats"
})
```

**預期返回欄位**:
```json
{
  "判決書": [
    {
      "判決字號": "CLEV,113,壢簡,1884,20250715,1",
      "判決日期": "2025-07-15",
      "案由": "給付服務報酬",
      "法官": "黃麟捷",
      "裁判結果": "原告勝訴",
      "法院": "臺灣桃園地方法院",
      "請求金額": 500000,  // ✅ 有金額欄位
      "判賠金額": 500000   // ✅ 有金額欄位
      // ✅ 沒有 summary_ai, main_reasons_ai 等不需要的欄位
    }
  ]
}
```

**Token 對比**:
- 當前方案: 50 筆 × 200 tokens = 10,000 tokens
- 方案 C: 50 筆 × 60 tokens = 3,000 tokens
- **節省**: 70%

---

### 場景 3: 勝訴率分析

**用戶問題**: "黃麟捷法官在債務清償案件的勝訴率是多少?"

**預期行為**:
```javascript
// 第1輪: GPT 應該調用
semantic_search_judgments({
    query: "債務清償",
    judge_name: "黃麟捷",
    limit: 50,
    intended_analysis: "verdict_rate"  // ✅ 正確選擇
})

// 第2輪: GPT 調用本地函數
calculate_verdict_statistics({
    analysis_type: "verdict_rate",
    verdict_type: "原告勝訴"
})
```

**預期返回欄位**:
```json
{
  "判決書": [
    {
      "判決字號": "...",
      "判決日期": "...",
      "案由": "...",
      "法官": "黃麟捷",
      "裁判結果": "原告勝訴",  // ✅ 有裁判結果，用於統計
      "法院": "..."
      // ✅ 只有索引欄位，足夠計算勝訴率
    }
  ]
}
```

**Token 對比**:
- 當前方案: 50 筆 × 200 tokens = 10,000 tokens
- 方案 C: 50 筆 × 50 tokens = 2,500 tokens
- **節省**: 75%

---

### 場景 4: 摘要查詢

**用戶問題**: "這些案件的主要內容是什麼?"

**預期行為**:
```javascript
semantic_search_judgments({
    query: "*",
    judge_name: "黃麟捷",
    limit: 10,
    intended_analysis: "summary"  // ✅ 正確選擇
})
```

**預期返回欄位**:
```json
{
  "判決書": [
    {
      "判決字號": "...",
      "判決日期": "...",
      "案由": "...",
      "法官": "黃麟捷",
      "裁判結果": "...",
      "法院": "...",
      "摘要": "本案原告依居間契約及服務確認單，請求被告給付新臺幣500,000元服務報酬..."  // ✅ 有摘要
      // ✅ 沒有 main_reasons_ai, legal_issues 等深度內容
    }
  ]
}
```

**Token 對比**:
- 當前方案: 10 筆 × 200 tokens = 2,000 tokens
- 方案 C: 10 筆 × 200 tokens = 2,000 tokens
- **節省**: 0% (但這是合理的，因為用戶需要摘要)

---

### 場景 5: 深度分析

**用戶問題**: "詳細分析這些案件的法律推理"

**預期行為**:
```javascript
semantic_search_judgments({
    query: "*",
    judge_name: "黃麟捷",
    limit: 5,
    intended_analysis: "deep_analysis"  // ✅ 正確選擇
})
```

**預期返回欄位**:
```json
{
  "判決書": [
    {
      "判決字號": "...",
      "判決日期": "...",
      "案由": "...",
      "法官": "黃麟捷",
      "裁判結果": "...",
      "法院": "...",
      "摘要": "...",
      "主要理由": "...",  // ✅ 有主要理由
      "法律爭點": [...]   // ✅ 有法律爭點
      // ✅ 有深度分析所需的所有欄位
    }
  ]
}
```

**Token 對比**:
- 當前方案: 5 筆 × 200 tokens = 1,000 tokens
- 方案 C: 5 筆 × 500 tokens = 2,500 tokens
- **節省**: -150% (增加，但這是合理的，因為用戶需要深度內容)

---

### 場景 6: 向後兼容測試

**用戶問題**: (舊版 API 調用，不指定 `intended_analysis`)

**預期行為**:
```javascript
semantic_search_judgments({
    query: "*",
    judge_name: "黃麟捷",
    limit: 10
    // ✅ 沒有 intended_analysis 參數
})
```

**預期返回欄位**:
```json
{
  "判決書": [
    {
      "判決字號": "...",
      "判決日期": "...",
      "案由": "...",
      "法官": "黃麟捷",
      "裁判結果": "...",
      "法院": "...",
      "摘要": "..."  // ✅ 預設返回摘要層欄位
      // ✅ 向後兼容，功能正常
    }
  ]
}
```

**Token 對比**:
- 當前方案: 10 筆 × 200 tokens = 2,000 tokens
- 方案 C: 10 筆 × 200 tokens = 2,000 tokens
- **節省**: 0% (向後兼容，保持一致)

---

## 📊 整體效果分析

### Token 節省統計

| 場景 | 案件數 | 當前 Token | 方案 C Token | 節省 | 節省率 |
|------|--------|-----------|-------------|------|--------|
| 列表查詢 | 50 | 10,000 | 2,500 | 7,500 | 75% |
| 金額分析 | 50 | 10,000 | 3,000 | 7,000 | 70% |
| 勝訴率分析 | 50 | 10,000 | 2,500 | 7,500 | 75% |
| 法條分析 | 50 | 10,000 | 4,000 | 6,000 | 60% |
| 摘要查詢 | 10 | 2,000 | 2,000 | 0 | 0% |
| 深度分析 | 5 | 1,000 | 2,500 | -1,500 | -150% |
| **平均** | - | - | - | - | **55%** |

### API 調用次數對比

| 場景 | 當前方案 | 方案 C | 節省 |
|------|---------|--------|------|
| 列表查詢 | 1 輪 | 1 輪 | 0% |
| 金額分析 | 2 輪 | 2 輪 | 0% |
| 勝訴率分析 | 2 輪 | 2 輪 | 0% |
| 法條分析 | 2 輪 | 2 輪 | 0% |

**結論**: API 調用次數不變，但每次調用的 Token 消耗大幅減少

---

## 🎯 測試執行計劃

### Phase 1: 單元測試 (MCP Server)

**測試 `get_fields_for_analysis()` 函數**:

```python
# 測試腳本: test_smart_fields.py

def test_get_fields_for_analysis():
    # 測試 1: 列表查詢
    fields = get_fields_for_analysis("list")
    assert fields == ["JID", "JDATE", "JTITLE", "judges", "verdict_type", "court"]
    
    # 測試 2: 金額分析
    fields = get_fields_for_analysis("amount_analysis")
    assert "claim_amount" in fields
    assert "granted_amount" in fields
    assert "summary_ai" not in fields  # 不應該包含摘要
    
    # 測試 3: 向後兼容
    fields = get_fields_for_analysis(None)
    assert "summary_ai" in fields  # 預設應該包含摘要
    
    # 測試 4: 未知類型
    fields = get_fields_for_analysis("unknown_type")
    assert "summary_ai" in fields  # 應該回退到預設
    
    print("✅ 所有單元測試通過!")

if __name__ == "__main__":
    test_get_fields_for_analysis()
```

---

### Phase 2: 整合測試 (MCP Server + 後端)

**測試工具調用**:

```javascript
// 測試腳本: test_smart_fields_integration.js

async function testSmartFieldsIntegration() {
    // 測試 1: 列表查詢
    const result1 = await callMCPTool("semantic_search_judgments", {
        query: "*",
        judge_name: "黃麟捷",
        limit: 5,
        intended_analysis: "list"
    });
    
    const firstJudgment = result1.判決書[0];
    assert(firstJudgment.判決字號);
    assert(firstJudgment.案由);
    assert(!firstJudgment.摘要);  // ✅ 不應該有摘要
    assert(!firstJudgment.請求金額);  // ✅ 不應該有金額
    
    // 測試 2: 金額分析
    const result2 = await callMCPTool("semantic_search_judgments", {
        query: "*",
        judge_name: "黃麟捷",
        limit: 5,
        intended_analysis: "amount_analysis"
    });
    
    const firstJudgment2 = result2.判決書[0];
    assert(firstJudgment2.請求金額 !== undefined);  // ✅ 應該有金額
    assert(firstJudgment2.判賠金額 !== undefined);  // ✅ 應該有金額
    assert(!firstJudgment2.摘要);  // ✅ 不應該有摘要
    
    console.log("✅ 所有整合測試通過!");
}
```

---

### Phase 3: 端到端測試 (完整流程)

**測試 AI Agent 對話**:

```javascript
// 測試場景 1: 金額分析
const conversation1 = await chatWithAIAgent({
    judgeName: "黃麟捷",
    questionType: "金額",
    message: "黃麟捷法官的案件中，牽涉金額最大的案件是?"
});

// 驗證 GPT 選擇了正確的 intended_analysis
assert(conversation1.toolCalls[0].function.arguments.includes("amount_analysis"));

// 驗證返回了正確的結果
assert(conversation1.response.includes("500,000"));

// 測試場景 2: 列表查詢
const conversation2 = await chatWithAIAgent({
    judgeName: "黃麟捷",
    questionType: "列表",
    message: "列出黃麟捷法官的所有案件"
});

// 驗證 GPT 選擇了正確的 intended_analysis
assert(conversation2.toolCalls[0].function.arguments.includes("list"));

console.log("✅ 所有端到端測試通過!");
```

---

### Phase 4: Token 消耗驗證

**測試 Token 節省效果**:

```javascript
// 測試腳本: test_token_savings.js

async function testTokenSavings() {
    // 場景 1: 列表查詢 (50 筆)
    const before1 = await measureTokens(() => 
        callMCPTool("semantic_search_judgments", {
            query: "*",
            judge_name: "黃麟捷",
            limit: 50
            // 不指定 intended_analysis (當前方案)
        })
    );
    
    const after1 = await measureTokens(() => 
        callMCPTool("semantic_search_judgments", {
            query: "*",
            judge_name: "黃麟捷",
            limit: 50,
            intended_analysis: "list"  // 方案 C
        })
    );
    
    const savings1 = ((before1 - after1) / before1 * 100).toFixed(1);
    console.log(`列表查詢 Token 節省: ${savings1}%`);
    assert(savings1 > 70);  // 應該節省 > 70%
    
    // 場景 2: 金額分析 (50 筆)
    const before2 = await measureTokens(() => 
        callMCPTool("semantic_search_judgments", {
            query: "*",
            judge_name: "黃麟捷",
            limit: 50
        })
    );
    
    const after2 = await measureTokens(() => 
        callMCPTool("semantic_search_judgments", {
            query: "*",
            judge_name: "黃麟捷",
            limit: 50,
            intended_analysis: "amount_analysis"
        })
    );
    
    const savings2 = ((before2 - after2) / before2 * 100).toFixed(1);
    console.log(`金額分析 Token 節省: ${savings2}%`);
    assert(savings2 > 65);  // 應該節省 > 65%
    
    console.log("✅ Token 節省驗證通過!");
}
```

---

## ✅ 驗收標準

### 功能正確性
- [ ] 所有單元測試通過
- [ ] 所有整合測試通過
- [ ] 所有端到端測試通過
- [ ] 向後兼容測試通過

### Token 優化效果
- [ ] 列表查詢節省 > 70%
- [ ] 金額分析節省 > 65%
- [ ] 勝訴率分析節省 > 70%
- [ ] 平均節省 > 50%

### GPT 理解能力
- [ ] GPT 正確選擇 `intended_analysis` 的準確率 > 90%
- [ ] 錯誤選擇時能自動回退到預設

### 性能影響
- [ ] 響應時間不增加（或略微減少）
- [ ] API 調用次數不增加

---

## 📝 測試報告模板

```markdown
# 智能欄位選擇測試報告

## 測試日期
2025-10-XX

## 測試環境
- MCP Server: https://esmcp.onrender.com
- 後端: https://courtdataapi.onrender.com
- 前端: https://lawsowl.vercel.app

## 測試結果

### 功能正確性
- 單元測試: ✅ 通過 (10/10)
- 整合測試: ✅ 通過 (8/8)
- 端到端測試: ✅ 通過 (6/6)
- 向後兼容: ✅ 通過 (5/5)

### Token 優化效果
- 列表查詢: 節省 75% (10,000 → 2,500 tokens)
- 金額分析: 節省 70% (10,000 → 3,000 tokens)
- 勝訴率分析: 節省 75% (10,000 → 2,500 tokens)
- 平均節省: 55%

### GPT 理解能力
- 準確率: 95% (19/20 次正確選擇)
- 錯誤案例: 1 次 (深度分析被誤判為摘要查詢)

### 性能影響
- 平均響應時間: 減少 15% (因為數據量減少)
- API 調用次數: 不變

## 結論
✅ 方案 C 成功實施，達到預期目標
```

---

**文檔版本**: 1.0  
**最後更新**: 2025-10-04  
**維護者**: Harry + AI Assistant (Augment)

