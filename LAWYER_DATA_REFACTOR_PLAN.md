# 律師數據分析重構計劃

## 📋 現狀分析

### 當前問題
1. **後端數據結構過時** - 使用舊的 `lawyers`/`lawyersdef` 欄位，無法精確綁定律師與當事人
2. **勝率計算不準確** - 基於簡單的 `verdict_type` 判斷，無法反映律師真實表現
3. **缺少律師表現評估** - 沒有使用新的 `lawyer_performance` 欄位
4. **前端圖表數據不匹配** - 期望的欄位名稱與後端返回的不一致

### 新 Mapping 的優勢
1. **trial_party_lawyers** - 精確綁定律師與當事人及其角色（原告/被告）
2. **lawyer_performance** - AI 評估的律師表現（Good/Fair/Poor）
3. **disposition.class** - 標準化的判決結果分類
4. **role_links** - 詳細的律師-當事人-角色關聯

---

## 🎯 重構目標

### 1. 後端數據提取邏輯
**目標**: 使用新欄位重新設計律師案件統計

#### 1.1 律師角色識別
```javascript
// 從 trial_party_lawyers 提取律師角色
function getLawyerRole(caseData, lawyerName) {
  const trialPartyLawyers = caseData.trial_party_lawyers || [];
  
  for (const entry of trialPartyLawyers) {
    if (entry.lawyers && entry.lawyers.includes(lawyerName)) {
      return {
        side: entry.side,           // "plaintiff" or "defendant"
        party: entry.party,          // 當事人名稱
        partyType: entry.party_type  // "person" or "organization"
      };
    }
  }
  
  return null;
}
```

#### 1.2 律師表現統計
```javascript
// 從 lawyer_performance 提取表現評估
function getLawyerPerformance(caseData, lawyerName) {
  const performances = caseData.lawyer_performance || [];
  
  const lawyerPerf = performances.find(p => p.lawyer === lawyerName);
  
  if (lawyerPerf) {
    return {
      performance: lawyerPerf.performance,  // "Good", "Fair", "Poor"
      outcome: lawyerPerf.outcome,          // "部分勝訴", "勝訴", etc.
      justification: lawyerPerf.justification
    };
  }
  
  return null;
}
```

#### 1.3 判決結果分類
```javascript
// 使用 disposition.class 進行標準化分類
function getDispositionClass(caseData) {
  const disposition = caseData.disposition || {};
  
  return {
    class: disposition.class,              // "partial_win", "win", "loss", etc.
    isProcedural: disposition.is_procedural,
    rawVerdictType: disposition.raw_verdict_type
  };
}
```

---

## 📊 新的數據結構設計（律師實戰視角）

### 🎯 律師想知道的核心資訊

#### 1. **對手的勝率和擅長領域**
- 在民事原告/被告的勝率
- 擅長的案由類型
- 案件標的金額分布

#### 2. **對手的表現模式**
- 完全勝訴 vs 部分勝訴比例
- 和解傾向
- 程序性結案比例

#### 3. **對手的審級經驗**
- 初審 vs 上訴審分布
- 上訴成功率

#### 4. **對手的客戶類型**
- 個人 vs 企業客戶比例
- 產業專長

---

### 2.1 民事案件統計（實戰版）
```javascript
{
  civil: {
    // === 基本統計 ===
    total_cases: 15,

    // === 角色分布 ===
    by_role: {
      plaintiff: {
        total: 10,
        trial_level: 8,      // 初審
        appeal_level: 2,     // 上訴審

        // 判決結果分布
        outcomes: {
          win: 4,              // 完全勝訴（原告訴求全部獲准）
          partial_win: 3,      // 部分勝訴（部分訴求獲准）
          loss: 2,             // 敗訴（訴求全部駁回）
          settlement: 1,       // 和解
          procedural: 0        // 程序駁回
        },

        // AI 評估的律師表現
        performance: {
          good: 6,    // 表現優秀（策略得當、證據充分）
          fair: 3,    // 表現一般
          poor: 1     // 表現不佳
        },

        // 勝率計算
        win_rate: 70,  // (win + partial_win) / (total - settlement - procedural) * 100

        // 案件標的金額（民事特有）
        claim_amounts: {
          avg: 500000,        // 平均標的金額
          median: 300000,     // 中位數
          max: 2000000,       // 最高
          granted_rate: 65    // 平均獲准金額比例
        }
      },

      defendant: {
        total: 5,
        trial_level: 4,
        appeal_level: 1,
        outcomes: { win: 1, partial_win: 1, loss: 2, settlement: 1, procedural: 0 },
        performance: { good: 2, fair: 2, poor: 1 },
        win_rate: 40,
        claim_amounts: {
          avg: 800000,
          median: 600000,
          max: 3000000,
          granted_rate: 35  // 原告獲准比例（對被告越低越好）
        }
      }
    },

    // === 客戶類型分析 ===
    client_types: {
      person: 8,        // 代理個人
      organization: 7   // 代理企業/組織
    },

    // === 常見案由 TOP 3 ===
    top_causes: [
      { cause: "侵權行為損害賠償", count: 6, win_rate: 66 },
      { cause: "給付買賣價金", count: 4, win_rate: 75 },
      { cause: "返還不當得利", count: 3, win_rate: 33 }
    ]
  }
}
```

### 2.2 刑事案件統計（實戰版）
```javascript
{
  criminal: {
    total_cases: 20,

    by_role: {
      defendant: {  // 刑事案件主要為被告辯護
        total: 20,
        trial_level: 15,
        appeal_level: 5,

        outcomes: {
          acquitted: 5,           // 無罪/免訴（最佳結果）
          reduced_sentence: 8,    // 成功減刑/緩刑
          guilty_as_expected: 4,  // 依法量刑（未能減輕）
          procedural: 3           // 程序駁回/不受理
        },

        performance: {
          good: 12,   // 成功為被告爭取到較輕刑罰
          fair: 6,
          poor: 2
        },

        // 辯護成功率（無罪 + 減刑）/ (total - procedural)
        defense_success_rate: 76,

        // 常見罪名
        top_charges: [
          { charge: "詐欺", count: 8, acquittal_rate: 25 },
          { charge: "毒品", count: 6, reduced_rate: 66 },
          { charge: "傷害", count: 4, acquittal_rate: 50 }
        ]
      }
    }
  }
}
```

### 2.3 行政案件統計（實戰版）
```javascript
{
  administrative: {
    total_cases: 8,

    by_role: {
      plaintiff: {  // 行政案件通常代理人民告政府
        total: 8,
        trial_level: 6,
        appeal_level: 2,

        outcomes: {
          full_revoke: 2,      // 完全撤銷（最佳結果）
          partial_revoke: 2,   // 部分撤銷
          dismissed: 3,        // 駁回
          procedural: 1        // 程序駁回
        },

        performance: {
          good: 3,
          fair: 3,
          poor: 2
        },

        // 勝訴率（完全+部分撤銷）/ (total - procedural)
        win_rate: 57,

        // 常見行政爭議
        top_actions: [
          { action: "稅務爭議", count: 3, win_rate: 66 },
          { action: "土地徵收", count: 2, win_rate: 50 },
          { action: "建築管理", count: 2, win_rate: 50 }
        ]
      }
    }
  }
}
```

---

## 🎨 前端圖表呈現建議

### 民事案件 - 環圈圖
```javascript
// 原告角色
[
  { label: '完全勝訴', value: 4, color: '#7fa37f' },      // 深綠 - 最佳結果
  { label: '部分勝訴', value: 3, color: '#a8d5a8' },      // 淺綠 - 良好結果
  { label: '敗訴', value: 2, color: '#e74c3c' },          // 紅色 - 不利結果
  { label: '和解', value: 1, color: '#3498db' },          // 藍色 - 中性結果
  { label: '程序駁回', value: 0, color: '#95a5a6' }       // 灰色 - 程序性
]

// 被告角色
[
  { label: '完全勝訴（原告敗訴）', value: 1, color: '#7fa37f' },
  { label: '部分勝訴', value: 1, color: '#a8d5a8' },
  { label: '敗訴（原告勝訴）', value: 2, color: '#e74c3c' },
  { label: '和解', value: 1, color: '#3498db' }
]
```

### 刑事案件 - 環圈圖
```javascript
[
  { label: '無罪/免訴', value: 5, color: '#7fa37f' },     // 深綠 - 最佳結果
  { label: '成功減刑', value: 8, color: '#a8d5a8' },     // 淺綠 - 良好結果
  { label: '依法量刑', value: 4, color: '#f39c12' },     // 橙色 - 一般結果
  { label: '程序駁回', value: 3, color: '#95a5a6' }      // 灰色 - 程序性
]
```

### 行政案件 - 環圈圖
```javascript
[
  { label: '完全撤銷', value: 2, color: '#7fa37f' },     // 深綠 - 最佳結果
  { label: '部分撤銷', value: 2, color: '#a8d5a8' },     // 淺綠 - 良好結果
  { label: '駁回', value: 3, color: '#e74c3c' },         // 紅色 - 不利結果
  { label: '程序駁回', value: 1, color: '#95a5a6' }      // 灰色 - 程序性
]
```

### 關鍵指標卡片
```javascript
// 顯示在圖表上方
{
  totalCases: 15,
  winRate: 70,              // 勝率
  avgClaimAmount: 500000,   // 平均標的（民事）
  grantedRate: 65,          // 獲准比例（民事）
  defenseSuccessRate: 76,   // 辯護成功率（刑事）
  clientType: "企業為主"     // 客戶類型
}
```

---

## 🔧 實施步驟

### Step 1: 修改後端服務層
**檔案**: `services/lawyer.js`

**核心邏輯**:
```javascript
function analyzeLawyerCases(cases, lawyerName) {
  const stats = {
    civil: { total_cases: 0, by_role: { plaintiff: {}, defendant: {} } },
    criminal: { total_cases: 0, by_role: { defendant: {} } },
    administrative: { total_cases: 0, by_role: { plaintiff: {} } }
  };

  cases.forEach(caseData => {
    // 1. 確定律師角色（使用 trial_party_lawyers 或 appeal_party_lawyers）
    const role = getLawyerRoleFromCase(caseData, lawyerName);
    if (!role) return;

    // 2. 提取判決結果（使用 disposition.class）
    const outcome = caseData.disposition?.class;

    // 3. 提取律師表現（使用 lawyer_performance）
    const performance = getLawyerPerformance(caseData, lawyerName);

    // 4. 提取案件類型
    const caseType = getCaseType(caseData);

    // 5. 統計累加
    updateStats(stats, caseType, role, outcome, performance, caseData);
  });

  return stats;
}
```

### Step 2: 更新前端數據轉換
**檔案**: `frontend/src/components/lawyer/LawyerCaseTypeStats.js`

1. 修改 `convertToChartData` 函數適配新結構
2. 添加關鍵指標卡片組件
3. 更新圖表標籤和顏色方案

### Step 3: 測試驗證
1. 使用真實律師數據測試（蕭嘉豪）
2. 驗證圖表顯示正確性
3. 確認勝率計算準確性
4. 檢查審級分布是否正確

---

## 📝 下一步行動

**建議實施順序**:
1. ✅ **後端**: 修改 `services/lawyer.js` - 使用新欄位提取數據
2. ✅ **前端**: 更新圖表組件 - 適配新數據結構
3. ✅ **測試**: 驗證完整流程

**您希望我現在開始實施嗎？**
我建議從後端開始，確保數據結構正確後再更新前端。

