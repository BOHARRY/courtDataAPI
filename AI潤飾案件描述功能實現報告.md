# AI 潤飾案件描述功能實現報告

## 📅 完成日期
2025/10/10

---

## ✅ 功能實現總結

### **實現目標**
為案件規劃節點添加 AI 潤飾案件描述功能,使用 Gemini Flash 4.1 nano 模型提供快速、低成本的文字優化服務。

### **實現結果**
✅ **完全實現!** 後端 API 已完成,前端待整合

---

## 📊 修改統計

### **新增文件**: 1 個
1. ✅ `services/descriptionBeautifyService.js` - AI 潤飾服務

### **修改文件**: 3 個
1. ✅ `controllers/aiAnalysisController.js` - 添加 Controller
2. ✅ `routes/aiAnalysisRoutes.js` - 添加路由
3. ✅ `config/creditCosts.js` - 添加積分配置

---

## 🔧 詳細實現內容

### **1. Service Layer** (`services/descriptionBeautifyService.js`)

#### **核心功能**:

**1.1 智能模式判斷**:
```javascript
function isDescriptionMeaningful(description) {
  // 檢查描述是否有意義
  // 無意義模式: "wer", "今天天氣真好", "測試", "當事人想要判被告有罪"
  // 返回 false → 觸發生成模式
  // 返回 true → 觸發潤飾模式
}
```

**1.2 潤飾模式** (Beautify Mode):
- 保持原意,不添加虛構事實
- 使用專業法律用語
- 字數控制在 100-200 字
- 格式清晰,邏輯連貫

**1.3 生成模式** (Generate Mode):
- 根據案由生成典型案件描述範例
- 使用「某甲」、「某乙」等代稱
- 不包含具體金額、日期等細節
- 字數控制在 100-150 字

#### **API 調用配置**:
```javascript
const response = await openai.chat.completions.create({
  model: OPENAI_MODEL_NAME_NANO,  // gpt-4.1-nano
  messages: [...],
  temperature: 0.7,      // 適度創造性
  max_tokens: 500,       // 控制輸出長度
  top_p: 0.9,
  frequency_penalty: 0.3,  // 減少重複
  presence_penalty: 0.3    // 鼓勵多樣性
});
```

---

### **2. Controller Layer** (`controllers/aiAnalysisController.js`)

#### **新增 Controller**:
```javascript
export const beautifyDescriptionController = async (req, res, next) => {
  try {
    const { description, caseType, courtLevel, caseNature, stance, mode } = req.body;
    const userId = req.user.uid;

    const result = await beautifyDescription({
      description: description || '',
      caseType,
      courtLevel,
      caseNature,
      stance,
      mode: mode || 'auto'
    });

    res.status(200).json({
      success: true,
      originalDescription: result.originalDescription,
      beautifiedDescription: result.beautifiedDescription,
      mode: result.mode,
      creditsUsed: 1,
      metadata: result.metadata
    });
  } catch (error) {
    next(error);
  }
};
```

---

### **3. Route Layer** (`routes/aiAnalysisRoutes.js`)

#### **新增路由**:
```javascript
// POST /api/ai/beautify-description
router.post(
  '/beautify-description',
  verifyToken,
  checkAndDeductCredits(
    CREDIT_COSTS.BEAUTIFY_DESCRIPTION,  // 1 點
    CREDIT_PURPOSES.BEAUTIFY_DESCRIPTION,
    { description: 'AI潤飾案件描述' }
  ),
  beautifyDescriptionController
);
```

---

### **4. Credit Configuration** (`config/creditCosts.js`)

#### **新增積分配置**:
```javascript
// CREDIT_COSTS
BEAUTIFY_DESCRIPTION: 1,  // AI潤飾案件描述（輕量級功能，使用 nano 模型）

// CREDIT_PURPOSES
BEAUTIFY_DESCRIPTION: 'beautify_description',
```

---

## 📝 API 規格

### **端點**: `POST /api/ai/beautify-description`

### **請求格式**:
```json
{
  "description": "wer",
  "caseType": "侵權行為損害賠償",
  "courtLevel": "地方法院",
  "caseNature": "民事",
  "stance": "plaintiff",
  "mode": "auto"
}
```

### **請求參數**:
| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| description | string | 否 | 原始案件描述 |
| caseType | string | 否 | 案由 |
| courtLevel | string | 否 | 法院層級 |
| caseNature | string | 否 | 案件性質 |
| stance | string | 否 | 辯護立場 (plaintiff/defendant) |
| mode | string | 否 | 模式 (auto/beautify/generate)，默認 auto |

### **響應格式**:
```json
{
  "success": true,
  "originalDescription": "wer",
  "beautifiedDescription": "原告主張被告因侵權行為造成損害，請求賠償相關損失。本案涉及侵權行為之構成要件、因果關係認定，以及損害賠償範圍之計算等爭議。",
  "mode": "generate",
  "creditsUsed": 1,
  "metadata": {
    "model": "gpt-4.1-nano",
    "tokensUsed": 245,
    "timestamp": "2025-10-10T12:00:00.000Z"
  }
}
```

---

## 🎯 功能特點

### **1. 智能模式切換**
- ✅ **auto 模式**: 自動判斷使用潤飾或生成
- ✅ **beautify 模式**: 強制潤飾現有描述
- ✅ **generate 模式**: 強制生成新描述

### **2. 無意義檢測**
檢測以下模式:
- ✅ 過短描述 (< 5 字)
- ✅ 純字母/數字/符號
- ✅ 測試文字 ("test", "測試")
- ✅ 無意義語句 ("今天天氣真好", "當事人想要判被告有罪")

### **3. 專業 Prompt 設計**
- ✅ 使用台灣法律用語
- ✅ 避免過於艱澀的文言文
- ✅ 不添加虛構事實
- ✅ 字數控制合理

### **4. 低成本高效率**
- ✅ 使用 nano 模型 (速度快)
- ✅ 只消耗 1 點積分
- ✅ Token 控制在 500 以內

---

## 💰 積分消耗對比

| 功能 | 積分 | 模型 | 用途 |
|------|------|------|------|
| **AI 潤飾描述** | **1 點** | nano | 短文本優化 |
| 案件判決分析 | 4 點 | gpt-4.1 | 複雜分析 |
| 訴狀生成 | 6 點 | claude-opus-4 | 長文本生成 |
| 語意搜尋 | 3 點 | embedding | 向量搜索 |

---

## 🎨 前端整合指南

### **調用示例**:
```javascript
const handleBeautifyDescription = async () => {
  try {
    setIsBeautifying(true);
    
    const response = await fetch('/api/ai/beautify-description', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        description: localData.description,
        caseType: localData.caseType,
        courtLevel: localData.courtLevel,
        caseNature: localData.caseNature,
        stance: localData.stance,
        mode: 'auto'
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // 更新描述
      handleFieldChange('description', data.beautifiedDescription);
      
      // 顯示提示
      if (data.mode === 'generate') {
        toast.success('✨ 已根據案由生成案件描述範例');
      } else {
        toast.success('✨ 案件描述已優化');
      }
    }
  } catch (error) {
    toast.error('AI 潤飾失敗: ' + error.message);
  } finally {
    setIsBeautifying(false);
  }
};
```

### **UI 建議**:
```jsx
<div className="case-planning-v2-char-count">
  <span>{descriptionLength}/{MAX_DESCRIPTION_LENGTH} 字</span>
  <button
    className="case-planning-v2-beautify-button"
    onClick={handleBeautifyDescription}
    disabled={isBeautifying}
    title="AI 潤飾案件描述"
  >
    {isBeautifying ? (
      <Icon icon="eos-icons:loading" />
    ) : (
      <Icon icon="hugeicons:ai-beautify" />
    )}
  </button>
</div>
```

---

## ✅ 測試建議

### **測試場景**:

#### **場景 1: 空描述**
```
輸入: ""
預期: 生成模式，根據案由生成範例
```

#### **場景 2: 無意義描述**
```
輸入: "wer"
預期: 生成模式，根據案由生成範例
```

#### **場景 3: 簡短描述**
```
輸入: "車禍賠償"
預期: 潤飾模式，擴展為專業描述
```

#### **場景 4: 完整描述**
```
輸入: "被告開車撞到原告，原告受傷住院，請求賠償醫療費用"
預期: 潤飾模式，優化為專業法律語言
```

---

## 🎉 實現成果

### **後端完成度**: 100% ✅
- ✅ Service 實現
- ✅ Controller 實現
- ✅ Route 配置
- ✅ 積分配置
- ✅ 錯誤處理
- ✅ 日誌記錄

### **待完成**:
- ⏳ 前端 UI 整合
- ⏳ 前端調用邏輯
- ⏳ 用戶測試

---

**實現完成時間**: 2025/10/10  
**實現人員**: Augment Agent  
**實現狀態**: ✅ 後端完成，待前端整合  
**預計效果**: 大幅提升用戶體驗，降低案件描述撰寫門檻

