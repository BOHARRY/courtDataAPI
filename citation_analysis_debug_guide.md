# 🔍 援引分析調試指南

## 📋 **問題診斷流程**

### **第一步：檢查數據獲取**
查看以下日誌來確認數據是否正確獲取：

```
[CitationDebug:DataRetrieval] 處理案例 1/40 - { caseId: "xxx", title: "最高法院...", hasSource: true }
[CitationDebug:DataRetrieval] 初始數據狀態 - { citationsFromSource: 0, hasJFULL: false, JFULLLength: 0 }
[CitationDebug:DataRetrieval] 需要從ES獲取完整數據 - { reason: "no_citations" }
[CitationDebug:DataRetrieval] ES數據獲取成功 - { citationsFromES: 15, JFULLFromES: 45000 }
```

**關鍵檢查點**：
- `citationsFromSource` 是否為 0（表示案例池數據不完整）
- `citationsFromES` 是否 > 0（表示ES有數據）
- `JFULLFromES` 是否 > 0（表示有判決書全文）

### **第二步：檢查文本匹配**
查看以下日誌來確認匹配過程：

```
[CitationDebug:ExtractContext] 開始提取上下文 - { citation: "最高法院51年度台上字第223號判決...", hasJFULL: true }
[CitationDebug:ExtractContext] 判例名稱比較 - { original: "最高法院51年度台上字第223號判決", cleaned: "最高法院51年度台上字第223號判決" }
[CitationDebug:ExtractContext] 精確匹配結果 - { citationIndex: -1, found: false }
[CitationDebug:ExtractContext] 數字格式變換策略 - { variants: ["最高法院五一年度台上字第二二三號判決", ...] }
```

**關鍵檢查點**：
- `citationIndex` 是否為 -1（表示精確匹配失敗）
- `variants` 數組是否包含可能的格式變體
- 是否有 `✅ 找到數字變換匹配` 的成功日誌

### **第三步：檢查單個分析**
查看以下日誌來確認深度分析過程：

```
[CitationDebug:SingleAnalysis] 開始搜尋 "最高法院51年度台上字第223號判決" 的上下文
[CitationDebug:SingleAnalysis] 檢查案例: 最高法院65年度台上字第2908號判決
[CitationDebug:SingleAnalysis] 精確匹配檢查 - { hasExactMatch: false, totalCitations: 12 }
[CitationDebug:SingleAnalysis] ✅ 找到模糊匹配 - { original: "...", matched: "..." }
```

## 🚨 **常見問題和解決方案**

### **問題1：援引次數為0**
**症狀**：
```
援引：0次
法院見解：0次
可信度：低
```

**可能原因**：
1. **數據格式不一致**：citations數組中的格式與JFULL中的格式不同
2. **文本清理過度**：getCleanText函數移除了關鍵字符
3. **ES數據缺失**：某些案例在ES中沒有完整數據

**調試步驟**：
1. 檢查 `[CitationDebug:DataRetrieval]` 日誌，確認ES數據獲取成功
2. 檢查 `[CitationDebug:ExtractContext]` 日誌，查看文本比較結果
3. 檢查 `[CitationDebug:SingleAnalysis]` 日誌，確認是否找到匹配

### **問題2：模糊匹配失敗**
**症狀**：
```
[CitationDebug:ExtractContext] ❌ 所有匹配策略都失敗
```

**可能原因**：
1. **數字格式變體不完整**：沒有覆蓋所有可能的數字格式
2. **判例名稱結構差異**：法院名稱、案件類型等有差異
3. **特殊字符問題**：包含特殊符號或空格

**解決方案**：
1. 擴展 `generateNumberVariants` 函數
2. 添加法院名稱標準化
3. 改進文本清理邏輯

### **問題3：上下文提取失敗**
**症狀**：
```
[CitationDebug:SingleAnalysis] ❌ 提取上下文失敗 - { found: false }
```

**可能原因**：
1. **JFULL數據不完整**：判決書全文缺失或格式錯誤
2. **CourtInsights標記缺失**：法院見解標記不存在
3. **文本編碼問題**：特殊字符編碼錯誤

## 🔧 **調試命令**

### **查看特定案例的詳細日誌**
```bash
# 過濾特定案例的日誌
grep "caseId.*specific-case-id" logs/citation-analysis.log

# 查看文本匹配過程
grep "CitationDebug:ExtractContext" logs/citation-analysis.log

# 查看數據獲取過程
grep "CitationDebug:DataRetrieval" logs/citation-analysis.log
```

### **檢查援引統計結果**
```bash
# 查看援引統計摘要
grep "援引統計完成" logs/citation-analysis.log

# 查看AI分析結果
grep "AI 分析完成" logs/citation-analysis.log
```

## 📊 **性能監控指標**

### **數據獲取效率**
- ES查詢成功率：應該 > 95%
- 數據完整性：citations和JFULL都存在的比例
- 查詢響應時間：平均 < 100ms

### **匹配成功率**
- 精確匹配成功率：目標 > 60%
- 模糊匹配成功率：目標 > 80%
- 總體匹配成功率：目標 > 85%

### **分析質量**
- 找到上下文的援引比例：目標 > 70%
- 法院見解內援引比例：目標 > 30%
- AI推薦準確性：需要人工評估

## 🚀 **部署前檢查清單**

### **代碼修改確認**
- [x] 增強調試日誌系統 (`CitationDebugLogger`)
- [x] 改進文本匹配算法 (`generateNumberVariants`, `buildContextResult`)
- [x] 統一數據獲取路徑 (所有階段使用相同的ES查詢)
- [x] 添加模糊匹配策略 (數字格式變體匹配)
- [ ] 運行測試腳本 (`test_citation_analysis_fix.js`)

### **測試驗證**
```bash
# 1. 運行單元測試
node test_citation_analysis_fix.js

# 2. 檢查日誌輸出
tail -f logs/citation-analysis.log | grep "CitationDebug"

# 3. 測試實際案例
# 選擇一個已知有援引次數為0問題的案例進行測試
```

### **監控指標**
部署後需要監控以下指標：
- **匹配成功率提升**：從當前的 ~20% 提升到 >80%
- **援引次數為0的案例減少**：減少 >70%
- **系統響應時間**：不應顯著增加 (<10% 增長)
- **錯誤率**：保持在 <5%

### **回滾計劃**
如果出現問題，可以快速回滾：
1. 移除新增的調試日誌 (保留核心功能)
2. 恢復原始的 `extractCitationContext` 函數
3. 禁用模糊匹配功能

## 🎯 **優化建議**

### **短期優化**
1. **擴展數字格式變體**：添加更多數字格式組合
2. **改進文本清理**：保留更多語義信息
3. **增強錯誤處理**：對ES查詢失敗的情況提供備選方案

### **中期優化**
1. **建立判例名稱標準化庫**：統一不同來源的判例名稱格式
2. **實現智能匹配算法**：使用編輯距離或語義相似度
3. **優化數據存儲**：在入庫時就標準化判例名稱

### **長期優化**
1. **機器學習匹配**：訓練模型識別判例名稱變體
2. **實時數據同步**：確保案例池和ES數據一致性
3. **分布式處理**：提高大規模分析的處理速度
