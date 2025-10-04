# 法官助手工具增強分析

## 📊 當前數據資產分析

基於 `mapping.txt` 和實際判決書 `TPHV,111,上,397,20250730,1.json` 的分析，我們擁有非常豐富的數據資產：

### **已有的強大欄位**

#### **1. 律師相關欄位** 🔥
```javascript
- lawyers: 律師列表
- lawyersdef: 被告方律師
- appellant_lawyers: 上訴人律師
- appellee_lawyers: 被上訴人律師
- appeal_party_lawyers: 上訴當事人與律師關聯 (nested)
- role_links: 律師與當事人角色關聯 (詳細)
- lawyer_performance: 律師表現評估 (nested) 🌟
  - lawyer: 律師姓名
  - performance: Excellent | Good | Fair | Poor
  - outcome: 結果描述
  - justification: 理由說明
- lawyer_assessment: 律師評估
  - plaintiff_side_comment: 原告方律師評論
  - defendant_side_comment: 被告方律師評論
```

#### **2. 法律爭點欄位** 🔥
```javascript
- legal_issues: 法律爭點 (nested)
  - issue_id: 爭點ID
  - topic: 爭點主題
  - plaintiff_position: 原告立場
  - defendant_position: 被告立場
  - court_ruling: 法院裁決
  - cited_laws: 引用法條
- issue_tilt_by_party: 爭點傾向分析 (nested)
  - issue_id: 爭點ID
  - topic: 主題
  - favored_party: 有利方
  - confidence: 信心度
  - basis_para: 依據段落
```

#### **3. 引用與法條欄位** 🔥
```javascript
- citations: 引用判例列表
- legal_basis: 法律依據
- legal_claim_basis: 法律請求依據
- citable_paragraphs: 可引用段落 (nested)
  - para_id: 段落ID
  - paragraph_text: 段落文字
```

#### **4. AI 生成的高價值欄位** 🔥
```javascript
- summary_ai: AI 摘要
- summary_ai_full: AI 完整摘要
- plaintiff_claims_summary: 原告主張摘要
- defendant_defenses_summary: 被告抗辯摘要
- main_reasons_ai: 主要理由 (AI 提取)
- tags: 標籤列表
```

#### **5. 當事人與角色欄位**
```javascript
- plaintiff: 原告
- defendant: 被告
- appellant: 上訴人
- appellee: 被上訴人
- prosecutor: 檢察官
- representations: 代理關係 (nested)
```

#### **6. 判決結果與類型欄位**
```javascript
- verdict_type: 判決類型
- disposition: 判決處分 (nested)
  - class: 類別
  - raw_verdict_type: 原始判決類型
  - is_procedural: 是否程序性
- is_procedural: 是否程序性判決
- is_complex_case: 是否複雜案件
- is_ruling: 是否裁定
```

---

## 🎯 當前工具缺口分析

### **MCP_TOOLS 現狀**
1. ✅ `search_judgments` - 關鍵詞搜尋
2. ✅ `semantic_search_judgments` - 語意搜尋
3. ✅ `get_case_details` - 獲取案件詳情
4. ✅ `analyze_judge` - 分析法官

### **LOCAL_FUNCTION_TOOLS 現狀**
1. ✅ `calculate_verdict_statistics` - 計算判決統計
2. ✅ `calculate_citation_frequency` - 計算法條引用頻率
3. ✅ `analyze_verdict_trend` - 分析判決趨勢

---

## 💡 建議新增的工具

### **🔥 優先級 1: 律師分析工具 (超強需求！)**

#### **1. `analyze_lawyer_performance` (MCP Tool)**
```javascript
{
  name: "analyze_lawyer_performance",
  description: "分析律師在特定法官面前的表現。提供律師勝訴率、常見策略、成功案例等。",
  parameters: {
    lawyer_name: "律師姓名",
    judge_name: "法官姓名 (可選)",
    case_type: "案由 (可選)",
    limit: "返回案件數量"
  }
}
```

**為什麼重要**：
- 律師想知道「這個律師在這個法官面前表現如何？」
- 律師想知道「這個律師的成功策略是什麼？」
- 律師想知道「這個律師常用的法條和論點是什麼？」

**數據支撐**：
- `lawyer_performance` (nested) - 律師表現評估
- `lawyer_assessment` - 律師評估
- `role_links` - 律師與當事人角色關聯

---

#### **2. `compare_lawyers` (Local Function)**
```javascript
{
  name: "compare_lawyers",
  description: "比較多位律師在特定法官或案由中的表現。",
  parameters: {
    lawyers: ["律師A", "律師B"],
    judge_name: "法官姓名 (可選)",
    case_type: "案由 (可選)"
  }
}
```

**為什麼重要**：
- 律師想知道「我應該選哪個律師？」
- 律師想知道「對方律師的實力如何？」

---

### **🔥 優先級 2: 法律爭點分析工具**

#### **3. `analyze_legal_issues` (MCP Tool)**
```javascript
{
  name: "analyze_legal_issues",
  description: "分析法官在特定法律爭點上的裁決傾向。",
  parameters: {
    issue_topic: "爭點主題 (如: 契約成立、證據充分性)",
    judge_name: "法官姓名",
    case_type: "案由 (可選)"
  }
}
```

**為什麼重要**：
- 律師想知道「法官在這個爭點上通常怎麼判？」
- 律師想知道「法官重視哪些證據？」

**數據支撐**：
- `legal_issues` (nested) - 法律爭點
- `issue_tilt_by_party` (nested) - 爭點傾向分析

---

#### **4. `find_similar_issues` (MCP Tool)**
```javascript
{
  name: "find_similar_issues",
  description: "找出與當前案件相似的法律爭點案例。",
  parameters: {
    issue_description: "爭點描述",
    judge_name: "法官姓名 (可選)",
    limit: "返回案件數量"
  }
}
```

**為什麼重要**：
- 律師想找「類似爭點的案例」
- 律師想知道「法官在類似情況下怎麼判？」

---

### **🔥 優先級 3: 引用與判例分析工具**

#### **5. `analyze_citations` (Local Function)**
```javascript
{
  name: "analyze_citations",
  description: "分析法官引用判例的模式。",
  parameters: {
    judgments: "判決書陣列",
    citation_type: "引用類型 (最高法院判決 | 大法官解釋 | 其他)"
  }
}
```

**為什麼重要**：
- 律師想知道「法官常引用哪些判例？」
- 律師想知道「法官重視哪些最高法院判決？」

**數據支撐**：
- `citations` - 引用判例列表
- `citable_paragraphs` - 可引用段落

---

### **🔥 優先級 4: 當事人與角色分析工具**

#### **6. `analyze_party_patterns` (Local Function)**
```javascript
{
  name: "analyze_party_patterns",
  description: "分析特定當事人類型(個人/公司)在法官面前的勝訴率。",
  parameters: {
    judgments: "判決書陣列",
    party_type: "當事人類型 (individual | organization)"
  }
}
```

**為什麼重要**：
- 律師想知道「法官對公司訴個人的案件傾向如何？」
- 律師想知道「法官對特定類型當事人是否有偏好？」

**數據支撐**：
- `appeal_party_lawyers` (nested) - 包含 `party_type`
- `role_links` - 包含 `party_type`

---

### **🔥 優先級 5: 標籤與分類分析工具**

#### **7. `analyze_tags` (Local Function)**
```javascript
{
  name: "analyze_tags",
  description: "分析判決書標籤的分布和模式。",
  parameters: {
    judgments: "判決書陣列",
    tag_category: "標籤類別 (可選)"
  }
}
```

**為什麼重要**：
- 律師想知道「這類案件的常見特徵是什麼？」
- 律師想知道「法官處理過哪些類型的案件？」

**數據支撐**：
- `tags` - 標籤列表 (非常豐富！)

---

## 📊 建議的實施優先級

### **Phase 1: 律師分析 (立即實施)** 🔥🔥🔥
1. `analyze_lawyer_performance` (MCP Tool)
2. `compare_lawyers` (Local Function)

**理由**：
- 律師是法官助手的核心使用者
- 律師最關心「對手律師」和「自己律師」的表現
- 數據已經非常完整 (`lawyer_performance`, `lawyer_assessment`)

---

### **Phase 2: 法律爭點分析 (高優先級)** 🔥🔥
3. `analyze_legal_issues` (MCP Tool)
4. `find_similar_issues` (MCP Tool)

**理由**：
- 法律爭點是案件的核心
- 律師需要知道「法官在這個爭點上怎麼判？」
- 數據已經結構化 (`legal_issues`, `issue_tilt_by_party`)

---

### **Phase 3: 引用與判例分析 (中優先級)** 🔥
5. `analyze_citations` (Local Function)

**理由**：
- 律師需要知道「法官重視哪些判例？」
- 可以提升律師的論述品質

---

### **Phase 4: 當事人與標籤分析 (低優先級)**
6. `analyze_party_patterns` (Local Function)
7. `analyze_tags` (Local Function)

**理由**：
- 這些是「錦上添花」的功能
- 可以等前面的功能穩定後再實施

---

## 🎯 預期效果

### **實施 Phase 1 後**
```
律師: "陳義文律師在王婉如法官面前的表現如何？"

AI: "根據 2025年6-7月 的數據，陳義文律師在王婉如法官面前的表現：

**整體表現**：
- 案件數：5 筆
- 勝訴率：80% (4 筆勝訴，1 筆敗訴)
- 表現評級：Excellent (4 筆), Good (1 筆)

**成功案例**：
1. PCDV,114,訴,1434,20250714,1 (返還投資本金)
   - 結果：原告勝訴
   - 評價：「法院認定金商公司具確認利益」
   - 關鍵策略：提供完整的合約文件和金流證明

2. TPHV,111,上,397,20250730,1 (分配表異議)
   - 結果：部分勝訴
   - 評價：「成功爭取確認票據債權不存在」
   - 關鍵策略：時效抗辯

**常用法條**：
- 民法第320條 (新債清償) - 出現 3 次
- 票據法第22條 (時效) - 出現 2 次

**常見策略**：
- 重視證據完整性 (5/5 筆案件)
- 善用時效抗辯 (2/5 筆案件)
- 強調契約成立證明 (3/5 筆案件)

📊 數據說明：
以上分析基於王婉如法官在 2025年6-7月 的判決數據（共 5 筆陳義文律師參與的案件）。"
```

---

## 💡 總結

### **當前數據資產**
- ✅ 非常豐富的律師相關欄位
- ✅ 完整的法律爭點結構化數據
- ✅ 詳細的引用與判例資訊
- ✅ AI 生成的高品質摘要和評估

### **建議新增工具**
1. 🔥🔥🔥 `analyze_lawyer_performance` - 律師表現分析
2. 🔥🔥🔥 `compare_lawyers` - 律師比較
3. 🔥🔥 `analyze_legal_issues` - 法律爭點分析
4. 🔥🔥 `find_similar_issues` - 相似爭點查找
5. 🔥 `analyze_citations` - 引用分析
6. `analyze_party_patterns` - 當事人模式分析
7. `analyze_tags` - 標籤分析

### **實施建議**
- **立即實施**: Phase 1 (律師分析)
- **高優先級**: Phase 2 (法律爭點分析)
- **中優先級**: Phase 3 (引用分析)
- **低優先級**: Phase 4 (當事人與標籤分析)

---

**你的數據資產非常豐富！特別是律師相關的欄位，這是一個巨大的優勢！** 🎉

**建議立即實施 Phase 1 的律師分析工具，這將大幅提升法官助手的實用性！** 🚀

