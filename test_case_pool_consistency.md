# 案例池一致性測試文檔

## 🎯 修改目標

確保智慧洞察、主流歸納分析、異常案例詳情都使用相同的案例池，避免數據不一致問題。

## 🔧 主要修改

### 1. 智慧洞察結果結構增強
```javascript
// 新增案例池結構
casePool: {
    allCases: [...],           // 所有找到的案例
    caseIds: [...],            // 案例ID列表
    mainPattern: {
        verdict: "部分勝訴部分敗訴",
        percentage: 70,
        cases: [...]           // 主流案例ID列表
    },
    anomalies: [{
        verdict: "程序駁回",
        count: 5,
        percentage: 10,
        cases: [...]           // 異常案例ID列表
    }],
    searchMetadata: {
        courtLevel: "地方法院",
        caseType: "民事",
        position: "plaintiff",
        timestamp: "2025-07-07T14:46:00Z",
        totalCases: 50,
        searchAngles: ["事實角度", "法律角度", "程序角度", "證據角度"]
    }
}
```

### 2. 主流歸納分析修改
- **舊邏輯**: 重新搜尋案例 → 可能得到不同結果
- **新邏輯**: 使用案例池中的主流案例 → 確保一致性

```javascript
// 舊方式 (已棄用)
const mainStreamCases = await getMainstreamCasesWithSummary(...)

// 新方式
const mainStreamCases = await getMainstreamCasesFromPool(casePool, mainPattern.verdict)
```

### 3. 異常案例詳情修改
- **舊邏輯**: 基於智慧洞察的 similarCases 生成
- **新邏輯**: 基於案例池中的異常案例生成

```javascript
// 舊方式 (已棄用)
const anomalyDetails = await generateAnomalyDetails(verdictAnalysis.anomalies, similarCases)

// 新方式
const anomalyDetails = await generateAnomalyDetailsFromPool(verdictAnalysis.anomalies, casePool)
```

## 🎯 數據流程

### 正確流程
```
智慧洞察 → 搜尋案例群 → 建立案例池 → 記錄案例ID
    ↓
主流歸納 → 使用案例池.mainPattern.cases → 基於相同案例分析
    ↓
異常詳情 → 使用案例池.anomalies[].cases → 基於相同案例分析
```

### 優勢
1. **數據一致性**: 所有分析都基於同一批案例
2. **邏輯連貫性**: 主流歸納分析的是"這批案例中的主流模式"
3. **用戶體驗**: 結果更可信、更有說服力
4. **性能優化**: 避免重複搜尋，減少 ES 查詢次數
5. **透明度**: 用戶可以清楚知道所有分析都基於同一個案例池

## 🧪 測試要點

### 1. 智慧洞察測試
- [ ] 確認結果包含完整的 `casePool` 結構
- [ ] 驗證 `mainPattern.cases` 包含正確的案例ID
- [ ] 驗證 `anomalies[].cases` 包含正確的案例ID

### 2. 主流歸納測試
- [ ] 確認使用案例池中的主流案例
- [ ] 驗證不會重新搜尋案例
- [ ] 確認 AI 提示詞包含"來自智慧洞察案例池"說明

### 3. 異常詳情測試
- [ ] 確認使用案例池中的異常案例
- [ ] 驗證異常案例與智慧洞察中的異常案例一致

### 4. 一致性測試
- [ ] 比較智慧洞察和主流歸納中引用的案例
- [ ] 確認案例ID完全一致
- [ ] 驗證案例標題和法院信息一致

## 🚨 注意事項

1. **向後兼容**: 舊的分析結果可能沒有 `casePool` 結構
2. **錯誤處理**: 如果案例池中案例數量不足，需要適當處理
3. **性能考慮**: 案例池可能包含大量數據，注意內存使用

## 📊 預期效果

用戶應該能看到：
- 智慧洞察顯示 50 個案例
- 主流歸納明確說明"基於上述 35 個主流案例分析"
- 異常詳情明確說明"基於上述 15 個異常案例分析"
- 所有引用的案例ID都能在智慧洞察結果中找到對應案例
