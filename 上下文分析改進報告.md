# 🔍 上下文分析改進報告

## 🐛 **問題診斷**

### **用戶反饋**：
- AI 分析結果說「無法確定該判例在此案中的適用性」
- 上下文可能沒有正確傳遞給 AI
- 分析結果缺乏具體的法律適用建議

### **根本原因分析**：
1. **上下文數據結構問題**：可能沒有正確提取或傳遞上下文
2. **AI 提示詞不夠具體**：沒有明確要求基於上下文進行分析
3. **缺乏調試信息**：無法確認上下文是否正確提取

## 🛠️ **改進措施**

### **1. 增強上下文數據結構**
```javascript
// 改進前
contextSamples.push({
    context: context.context.fullContext,
    inCourtInsight: context.inCourtInsight,
    fromCase: case_.title
});

// 改進後
contextSamples.push({
    fullContext: context.context.fullContext,
    beforeContext: context.context.before,      // 🆕 前文
    afterContext: context.context.after,       // 🆕 後文
    inCourtInsight: context.inCourtInsight,
    fromCase: case_.title || '未知案例'
});
```

### **2. 添加調試日誌**
```javascript
// 🔍 調試：記錄上下文提取情況
console.log(`[analyzeSingleCitation] 找到上下文 - 案例: ${case_.title}, 長度: ${context.context.fullContext?.length || 0}, 在法院見解內: ${context.inCourtInsight}`);

console.log(`[analyzeSingleCitation] 準備分析 ${citation.citation}，找到 ${contextSamples.length} 個上下文樣本`);
```

### **3. 處理無上下文情況**
```javascript
if (contextSamples.length === 0) {
    console.log(`[analyzeSingleCitation] 警告：${citation.citation} 沒有找到任何上下文`);
    return {
        citation: citation.citation,
        recommendationLevel: "謹慎使用",
        reason: "未找到該判例在案例中的具體使用上下文，無法評估適用性",
        // ... 其他字段
    };
}
```

### **4. 改進 AI 提示詞結構**

#### **更詳細的上下文展示**：
```javascript
實際使用上下文：
${contextSamples.map((sample, index) => `
樣本 ${index + 1} (來源案例: ${sample.fromCase}):
${sample.inCourtInsight ? '【法院見解內引用】' : '【一般引用】'}

前文：${sample.beforeContext}
援引：${citation.citation}
後文：${sample.afterContext}

完整段落：
${sample.fullContext}
---
`).join('\n')}
```

#### **更具體的分析要求**：
```javascript
分析要求：
1. 仔細閱讀每個上下文樣本，理解該判例在實際案例中的使用方式
2. 分析該判例與當前案件的相關性
3. 評估從${positionLabel}角度使用此判例的效果
```

#### **增強的回應格式**：
```json
{
  "citation": "判例名稱",
  "recommendationLevel": "強烈推薦|建議考慮|謹慎使用",
  "reason": "基於實際上下文的推薦理由（80-120字）",
  "usageStrategy": "具體使用建議（50-80字）",
  "contextEvidence": "支持推薦的關鍵上下文片段",
  "legalPrinciple": "該判例確立的法律原則", // 🆕
  "applicabilityAnalysis": "與當前案件的適用性分析", // 🆕
  "riskWarning": "使用注意事項",
  "confidence": "高|中|低",
  "uncertaintyNote": "適用性限制說明"
}
```

## 🎯 **預期改進效果**

### **改進前的問題**：
```
核心價值：由於缺乏具體的上下文本，無法確定該判例在此案中的適用性。
使用時機：在討論過失比例時引用，以支持乙的主張，強調甲的主要過失。
注意事項：該判例的具體內容不明，可能不完全適用於本案。
```

### **改進後的預期**：
```
核心價值：該判例在交通事故案件中確立了「保險代位求償權」的法律原則，
         根據上下文顯示其處理保險公司代位求償的法律依據。
         
使用時機：當案件涉及保險公司代位求償時，可引用此判例支持代位求償的
         法律基礎，特別適用於原告立場。
         
上下文證據：「保險人依法代位行使被保險人對於第三人之請求權...」
           （引用自 CLEV,113,壢保險簡,197 案例）
           
適用性分析：與當前交通事故案件高度相關，特別是涉及保險理賠的情況。
```

## 🧪 **測試重點**

### **1. 上下文提取驗證**
- [ ] 確認能正確提取前文、後文和完整段落
- [ ] 驗證法院見解內/外的標記正確
- [ ] 檢查上下文長度是否合理（300字左右）

### **2. AI 分析質量**
- [ ] 確認 AI 能基於實際上下文進行分析
- [ ] 驗證推薦理由引用了具體的上下文片段
- [ ] 檢查法律原則提取的準確性

### **3. 邊界情況處理**
- [ ] 測試沒有上下文的判例處理
- [ ] 驗證上下文不足時的降級處理
- [ ] 確認錯誤處理機制正常工作

## 📊 **調試信息監控**

通過新增的調試日誌，可以監控：

1. **上下文提取情況**：
   ```
   [analyzeSingleCitation] 找到上下文 - 案例: 侵權行為損害賠償(交通), 長度: 245, 在法院見解內: true
   ```

2. **分析準備情況**：
   ```
   [analyzeSingleCitation] 準備分析 最高法院65年度台上字第2908號判決，找到 2 個上下文樣本
   ```

3. **異常情況警告**：
   ```
   [analyzeSingleCitation] 警告：某判例 沒有找到任何上下文
   ```

## 🚀 **下一步測試**

重新運行援引分析，觀察：
1. 調試日誌是否顯示正確的上下文提取
2. AI 分析結果是否包含具體的上下文引用
3. 推薦理由是否更加具體和有說服力

這些改進應該能顯著提升 AI 分析的準確性和實用性！
