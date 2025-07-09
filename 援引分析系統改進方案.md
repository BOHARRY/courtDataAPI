# 🎯 援引判例分析精確度改進報告

## 🔍 **問題診斷**

### **用戶反饋的問題**：
- 援引判例分析結果「攏統」
- 核心價值和使用時機描述不夠具體
- 缺乏針對性的法律適用指導

### **根本原因分析**：
1. **AI 無法直接閱讀援引判例內容**：如 2908 號判決太久遠
2. **上下文數據被精簡**：為節省 Firestore 空間，移除了 `totalContexts`
3. **提示詞不夠具體**：缺乏對上下文深度分析的指導

## 🛠️ **改進措施**

### **1. 重新獲取上下文數據**

**問題**：原本為了節省空間，移除了詳細的上下文數據
```javascript
// 🚨 原本的精簡版本
sampleCases: citation.occurrences.slice(0, 3).map(occ => ({
    caseId: occ.caseId,
    caseTitle: occ.caseTitle,
    found: occ.context?.found || false,
    inCourtInsight: occ.context?.inCourtInsight || false
    // 🚨 不保存完整的 context 數據
}))
```

**解決方案**：在 AI 分析時重新提取上下文
```javascript
// 🆕 為 AI 分析重新獲取上下文數據
for (const citation of valuableCitations.slice(0, 10)) {
    const contextSamples = [];
    
    for (const case_ of casePool.allCases.slice(0, 20)) {
        if (case_.source.citations.includes(citation.citation)) {
            const context = extractCitationContext(
                citation.citation,
                case_.source?.JFULL || '',
                case_.source?.CourtInsightsStart || '',
                case_.source?.CourtInsightsEND || ''
            );
            
            if (context.found && context.context) {
                contextSamples.push({
                    fullContext: context.context,
                    inCourtInsight: context.inCourtInsight,
                    caseTitle: case_.title
                });
            }
        }
    }
}
```

### **2. 強化 AI 提示詞**

**新增分析重點**：
```
🎯 **分析重點**：
- 仔細閱讀每個判例的 sampleContexts（前後文脈絡）
- 從上下文推斷該判例的具體法律適用場景
- 分析該判例在原判決書中解決了什麼具體法律問題
- 評估該判例與當前案件的相關性和適用性
```

**優化回應格式**：
```javascript
{
  "reason": "基於上下文分析的具體推薦理由，說明該判例解決什麼法律問題（50-100字）",
  "usageStrategy": "具體使用時機和策略，基於上下文推斷的適用場景（30-50字）"
}
```

### **3. 強化分析原則**

**新的重要原則**：
1. **深度上下文分析**：仔細分析 sampleContexts，從中推斷具體法律適用場景
2. **具體化推薦理由**：避免攏統描述，要說明該判例解決了什麼具體法律問題
3. **精確使用策略**：基於上下文推斷，提供具體的使用時機和適用場景
4. **避免泛化推薦**：不要給出「適用於類似案件」等攏統建議

## 📊 **預期改進效果**

### **改進前**（攏統）：
```
核心價值：此判例在法院見解中有引用，且其價值分數高，可能對於支持乙方損害賠償請求有幫助。
使用時機：可用於支持乙方的損害賠償請求，特別是關於常用費用和精神慰撫金的請求。
```

### **改進後**（具體）：
```
核心價值：此判例確立保險人代位求償的限制原則，當損害額小於保險給付時，保險人僅能就實際損害額代位求償，適用於保險法第53條爭議。
使用時機：適用於保險代位求償案件中，當保險人請求金額超過實際損害時，可援引此判例主張代位求償應以實際損害額為限。
```

## 🎯 **技術實作細節**

### **上下文提取優化**：
- 增加上下文長度至 400 字符
- 優先選擇法院見解內的上下文
- 提供案例來源信息增加可信度

### **數據結構增強**：
```javascript
sampleContexts: [
    {
        context: "依保險法第53條第1項規定，如其損害額超過或等於保險人已給付之賠償金額...",
        inCourtInsight: true,
        fromCase: "某某地方法院判決"
    }
]
```

### **性能考量**：
- 限制檢查案例數量（最多20個）
- 限制上下文樣本數量（最多3個）
- 避免在 AI 分析時造成超時

## 🧪 **測試建議**

1. **使用具體案例測試**：如保險代位求償案件
2. **比較改進前後的分析結果**：檢查具體性提升
3. **驗證上下文提取正確性**：確保提取到相關的法律條文引用
4. **檢查性能影響**：確保不會造成分析超時

這些改進應該能顯著提升援引判例分析的精確度和實用性，讓律師獲得更具體、更有針對性的援引建議。
