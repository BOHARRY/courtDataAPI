// config/creditCosts.js

export const CREDIT_COSTS = {
  // 搜尋相關
  SEARCH_JUDGEMENT: 1,
  VIEW_JUDGEMENT_DETAIL: 1,

  // 律師相關
  LAWYER_PROFILE_BASIC: 1,         // 查詢律師基本資料與案件列表
  LAWYER_CASES_DISTRIBUTION: 1,  // 查詢律師案件分布
  LAWYER_AI_ANALYSIS: 2,         // 查詢律師AI優劣勢分析

  // 法官相關
  JUDGE_PROFILE_STATS: 1,        // (假設) 查詢法官基本資料與統計 (如果有的話)
  JUDGE_AI_ANALYTICS: 3,         // 法官AI分析與統計 (包含AI)

  AI_SUCCESS_ANALYSIS: 5,
  SEMANTIC_SEARCH: 3, // 新增語意搜尋功能，消耗 3 積分

  // 其他未來可能的功能
  // EXAMPLE_FEATURE_A: 1,
  // EXAMPLE_FEATURE_B: 2,
};

// 也可以導出 purpose 的常數，以確保一致性
export const CREDIT_PURPOSES = {
  SEARCH_JUDGEMENT: 'search_judgement',
  VIEW_JUDGEMENT_DETAIL: 'view_judgement_detail',
  LAWYER_PROFILE_BASIC: 'lawyer_profile_basic',
  LAWYER_CASES_DISTRIBUTION: 'lawyer_cases_distribution',
  LAWYER_AI_ANALYSIS: 'lawyer_ai_analysis',
  JUDGE_AI_ANALYTICS: 'judge_ai_analytics',
  SEMANTIC_SEARCH: 'SEMANTIC_SEARCH',  // 新增語意搜尋用途
  // ... 其他 purpose ...

  // 積分增加的 purpose
  SIGNUP_BONUS: 'signup_bonus',
  SUBSCRIPTION_MONTHLY_GRANT_BASIC: 'subscription_monthly_grant_basic',
  SUBSCRIPTION_MONTHLY_GRANT_ADVANCED: 'subscription_monthly_grant_advanced',
  PURCHASE_CREDITS_PKG_20: 'purchase_credits_PKG_20', // 範例
  ADMIN_GRANT: 'admin_grant',
  REFUND_ADJUSTMENT: 'refund_adjustment',
  AI_SUCCESS_ANALYSIS: 'ai_success_analysis',
  PURCHASE_CREDITS_PKG_PREFIX: 'purchase_credit_package_', // 前綴，後面會跟 package_id
  SUBSCRIPTION_GRANT_PREFIX: 'subscription_grant_', // 前綴，後面會跟 plan_id
  SUBSCRIPTION_RENEWAL_GRANT: 'subscription_renewal_grant_', // 前綴，後面會跟 plan_id
};