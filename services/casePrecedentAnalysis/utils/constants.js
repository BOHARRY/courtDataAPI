// services/casePrecedentAnalysis/utils/constants.js

/**
 * 案件判決分析服務 - 常量定義
 * 
 * 集中管理所有常量，避免魔法數字和字串散落在代碼中
 */

// Elasticsearch 索引名稱
export const ES_INDEX_NAME = 'search-boooook';

// OpenAI 模型配置
export const EMBEDDING_MODEL = 'text-embedding-3-large';
export const EMBEDDING_DIMENSIONS = 1536;

// 相似度門檻映射
export const SIMILARITY_THRESHOLDS = {
    low: 0.5,        // 低 (50%)：擴大量以找到更多判決
    medium: 0.7,     // 中 (70%)：預設值，更精準
    high: 0.8        // 高 (80%)：嚴格篩選
};

// 預設相似度門檻
export const DEFAULT_THRESHOLD = 'medium';

// 案件類型映射 (中文 -> 英文)
export const CASE_TYPE_MAP = {
    '民事': 'civil',
    '刑事': 'criminal',
    '行政': 'administrative'
};

// 法院層級映射 (中文 -> 英文)
export const COURT_LEVEL_MAP = {
    '地方法院': 'district',
    '高等法院': 'high',
    '最高法院': 'supreme'
};

// 立場映射
export const POSITION_MAP = {
    plaintiff: 'plaintiff',
    defendant: 'defendant',
    neutral: 'neutral'
};

// 立場視角映射 (根據案件類型)
export const PERSPECTIVE_MAP = {
    '民事': {
        plaintiff: 'plaintiff_perspective',
        defendant: 'defendant_perspective'
    },
    '刑事': {
        plaintiff: 'prosecutor_perspective',
        defendant: 'defense_perspective'
    },
    '行政': {
        plaintiff: 'citizen_perspective',
        defendant: 'agency_perspective'
    }
};

// 向量欄位權重配置
export const VECTOR_FIELD_WEIGHTS = {
    plaintiff: {
        'legal_issues_vector': 0.5,
        'plaintiff_combined_vector': 0.3,
        'main_reasons_ai_vector': 0.2
    },
    defendant: {
        'legal_issues_vector': 0.5,
        'defendant_combined_vector': 0.3,
        'main_reasons_ai_vector': 0.2
    },
    neutral: {
        'legal_issues_vector': 0.4,
        'main_reasons_ai_vector': 0.3,
        'replicable_strategies_vector': 0.2,
        'summary_ai_vector': 0.1
    }
};

// KNN 搜索配置
export const KNN_CONFIG = {
    k: 50,                  // 返回的案例數量
    num_candidates: 100,    // 候選數量
    timeout: '20s'          // 搜索超時時間
};

// 搜索角度權重配置
export const SEARCH_ANGLE_WEIGHTS = {
    法律爭點: 0.35,
    核心概念: 0.3,
    法律術語: 0.2,
    實務用詞: 0.1,
    爭點導向: 0.05
};

// 記憶體警告閾值 (MB)
export const MEMORY_WARNING_THRESHOLD = 400;

// AI 分析配置
export const AI_CONFIG = {
    enrichment: {
        model: 'gpt-4o',
        max_tokens: 400,
        temperature: 0.3
    },
    summarization: {
        model: 'gpt-4o-mini',
        max_tokens: 1500,
        temperature: 0.1
    }
};

// 律師價值評分權重
export const LAWYER_VALUE_WEIGHTS = {
    relevance: 0.5,    // 相關性權重 50%
    diversity: 0.2,    // 多樣性權重 20%
    practical: 0.3     // 實務價值權重 30%
};

// 結果合併配置
export const MERGE_CONFIG = {
    max_results: 50,           // 最多返回的案例數
    min_intersection: 2,       // 最少交集次數
    position_score_weight: 1.0 // 位置分數權重
};

// ES 查詢來源欄位
export const ES_SOURCE_FIELDS = [
    'JID',
    'JTITLE',
    'verdict_type',
    'court',
    'JYEAR',
    'summary_ai',
    'main_reasons_ai',
    'position_based_analysis',
    'plaintiff_combined_vector',
    'defendant_combined_vector',
    'replicable_strategies_vector',
    'main_reasons_ai_vector',
    'text_embedding',
    'legal_issues_vector'
];

// 標籤關鍵字映射
export const TAG_KEYWORDS = {
    名譽權: ['名譽', '誹謗', '不實言論'],
    侵權行為: ['侵權', '損害賠償'],
    誹謗: ['誹謗'],
    交通事故: ['車禍', '交通', '撞'],
    契約: ['契約', '違約', '解除契約'],
    勞動: ['加班', '工資', '解僱', '勞動']
};

// 預設值
export const DEFAULTS = {
    courtLevel: '地方法院',
    caseType: '民事',
    threshold: 'medium',
    position: 'neutral',
    pageSize: 25
};

