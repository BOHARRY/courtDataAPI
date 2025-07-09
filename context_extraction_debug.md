# 🔍 上下文提取調試報告

## 🐛 **重大發現：上下文提取完全失敗**

### **問題現象**：
```
[analyzeSingleCitation] 準備分析 最高法院77年度第9次民事庭會議決議，找到 0 個上下文樣本
[analyzeSingleCitation] 警告：最高法院77年度第9次民事庭會議決議 沒有找到任何上下文
[analyzeSingleCitation] 準備分析 最高法院65年度台上字第2908號判決，找到 0 個上下文樣本
[analyzeSingleCitation] 警告：最高法院65年度台上字第2908號判決 沒有找到任何上下文
```

**所有判例都找不到上下文！** 這表示 `extractCitationContext` 函數可能從一開始就有問題。

## 🔍 **可能的問題點**

### **1. Citations 匹配問題**
```javascript
if (case_.source.citations.includes(citation.citation)) {
    // 這裡可能沒有匹配到
}
```

**可能原因**：
- `case_.source.citations` 中的判例名稱格式與 `citation.citation` 不一致
- 空格、標點符號、繁簡體差異
- 大小寫問題

### **2. extractCitationContext 內部問題**
```javascript
const citationIndex = cleanJfull.indexOf(cleanCitation);
if (citationIndex === -1) {
    return { found: false }; // 這裡可能總是返回 false
}
```

**可能原因**：
- `getCleanText()` 清理過度，導致無法匹配
- 判例名稱在 JFULL 中的格式與 citations 數組中不同
- 文本編碼問題

### **3. 數據結構問題**
```javascript
case_.source?.JFULL || ''
case_.source?.citations
```

**可能原因**：
- JFULL 為空或格式異常
- citations 數組為空或格式異常

## 🛠️ **添加的調試代碼**

### **1. 分析階段調試**
```javascript
// 🔍 調試：記錄搜尋過程
console.log(`[analyzeSingleCitation] 開始搜尋 "${citation.citation}" 的上下文，檢查 ${casePool.allCases.slice(0, 10).length} 個案例`);

// 🔍 調試：檢查 citations 匹配
console.log(`[analyzeSingleCitation] 檢查案例 ${case_.title} - 有 ${case_.source.citations.length} 個援引`);
console.log(`[analyzeSingleCitation] 案例援引列表:`, case_.source.citations.slice(0, 3));

const hasMatch = case_.source.citations.includes(citation.citation);
console.log(`[analyzeSingleCitation] 是否包含 "${citation.citation}": ${hasMatch}`);
```

### **2. extractCitationContext 調試**
```javascript
// 🔍 調試：記錄輸入參數
console.log(`[extractCitationContext] 開始提取上下文:`, {
    citation: citation?.substring(0, 50) + '...',
    hasJFULL: !!JFULL,
    JFULLLength: JFULL?.length || 0,
    hasCourtInsights: !!(CourtInsightsStart && CourtInsightsEND)
});

// 🔍 調試：記錄清理後的文本
console.log(`[extractCitationContext] 清理後文本長度:`, {
    originalJFULL: JFULL.length,
    cleanJfull: cleanJfull.length,
    originalCitation: citation.length,
    cleanCitation: cleanCitation.length
});

// 🔍 調試：搜尋結果
console.log(`[extractCitationContext] 搜尋結果:`, {
    cleanCitation: cleanCitation.substring(0, 50) + '...',
    citationIndex,
    found: citationIndex !== -1
});
```

### **3. 部分匹配嘗試**
```javascript
// 🔍 調試：嘗試部分匹配
const citationParts = cleanCitation.split(/\s+/).filter(part => part.length > 2);
console.log(`[extractCitationContext] 嘗試部分匹配:`, citationParts.slice(0, 3));

for (const part of citationParts.slice(0, 3)) {
    if (cleanJfull.includes(part)) {
        console.log(`[extractCitationContext] 找到部分匹配: "${part}"`);
        break;
    }
}
```

## 🧪 **調試測試計劃**

### **階段一：確認數據結構**
重新運行分析，觀察日誌：

1. **檢查 citations 數組**：
   ```
   [analyzeSingleCitation] 案例援引列表: ["最高法院65年度台上字第2908號判決", "..."]
   ```

2. **檢查匹配結果**：
   ```
   [analyzeSingleCitation] 是否包含 "最高法院65年度台上字第2908號判決": true/false
   ```

3. **檢查 JFULL 數據**：
   ```
   [extractCitationContext] hasJFULL: true, JFULLLength: 12345
   ```

### **階段二：確認文本清理**
1. **檢查清理前後的文本**：
   ```
   [extractCitationContext] 清理後文本長度: {originalJFULL: 12345, cleanJfull: 11000}
   ```

2. **檢查搜尋結果**：
   ```
   [extractCitationContext] 搜尋結果: {citationIndex: -1, found: false}
   ```

### **階段三：部分匹配分析**
1. **檢查部分匹配**：
   ```
   [extractCitationContext] 嘗試部分匹配: ["最高法院", "65年度", "台上字"]
   [extractCitationContext] 找到部分匹配: "最高法院"
   ```

## 🎯 **預期發現**

### **可能的問題場景**：

#### **場景一：Citations 格式不匹配**
```
// citations 數組中
"最高法院65年度台上字第2908號判決"

// 實際搜尋的
"最高法院 65 年度台上字第 2908 號判決"
```

#### **場景二：JFULL 中的格式不同**
```
// JFULL 中實際內容
"依最高法院65年台上字第2908號判決意旨..."

// 搜尋的完整名稱
"最高法院65年度台上字第2908號判決"
```

#### **場景三：清理過度**
```
// 原始
"最高法院65年度台上字第2908號判決"

// 清理後
"最高法院年度台上字第號判決" // 數字被清理掉了
```

## 🚀 **下一步行動**

1. **立即重新測試**：運行援引分析，觀察新的調試日誌
2. **分析日誌結果**：確定問題出現在哪個階段
3. **針對性修復**：根據調試結果修復具體問題
4. **驗證修復效果**：確認上下文能正確提取

這次的調試應該能幫我們找到上下文提取失敗的根本原因！🔍
