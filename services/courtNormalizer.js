// services/courtNormalizer.js
// 法院標準化服務 - 處理法院名稱標準化、地區分組、同名異字等問題

/**
 * 法院地區分組配置
 * 注意：只包含民事案件的法院（目前資料庫不包含刑事和行政）
 */
const COURT_REGIONS = {
  '高等以上': [
    '最高法院',
    '福建高等法院金門分院',
    '智慧財產及商業法院',
    '憲法法庭',
    '懲戒法院'
  ],
  '北部': [
    '臺灣臺北地方法院',
    '臺灣新北地方法院',
    '臺灣士林地方法院',
    '臺灣基隆地方法院',
    '臺灣桃園地方法院',
    '臺灣新竹地方法院',
    '臺灣宜蘭地方法院',
    // 簡易庭
    '士林簡易庭',
    '內湖簡易庭',
    '新店簡易庭',
    '三重簡易庭',
    '板橋簡易庭',
    '桃園簡易庭',
    '中壢簡易庭',
    '竹北簡易庭',
    '宜蘭簡易庭',
    '羅東簡易庭'
  ],
  '中部': [
    '臺灣臺中地方法院',
    '臺灣彰化地方法院',
    '臺灣南投地方法院',
    '臺灣雲林地方法院',
    '臺灣苗栗地方法院',
    // 簡易庭
    '臺中簡易庭',
    '沙鹿簡易庭',
    '彰化簡易庭',
    '員林簡易庭',
    '南投簡易庭',
    '斗六簡易庭',
    '北斗簡易庭'
  ],
  '南部': [
    '臺灣臺南地方法院',
    '臺灣高雄地方法院',
    '臺灣嘉義地方法院',
    '臺灣屏東地方法院',
    // 簡易庭
    '嘉義簡易庭',
    '北港簡易庭',
    '臺南簡易庭',
    '新市簡易庭',
    '柳營簡易庭',
    '橋頭簡易庭',
    '岡山簡易庭',
    '旗山簡易庭',
    '屏東簡易庭',
    '潮州簡易庭'
  ],
  '東部外島': [
    '臺灣花蓮地方法院',
    '臺灣臺東地方法院',
    '福建金門地方法院',
    '福建連江地方法院',
    // 簡易庭
    '臺東簡易庭'
  ]
};

/**
 * 同名異字對應表（台 ↔ 臺）
 */
const CHARACTER_VARIANTS = {
  '台': '臺',
  '臺': '台'
};

/**
 * 標準化法院名稱
 * @param {string} courtName - 原始法院名稱
 * @returns {string} 標準化後的法院名稱
 */
export function normalizeCourtName(courtName) {
  if (!courtName || typeof courtName !== 'string') {
    return null;
  }

  let normalized = courtName.trim();

  // 1. 統一使用「臺」字（台 → 臺）
  normalized = normalized.replace(/台/g, '臺');

  // 2. 移除案件類型後綴（民事、刑事、行政）
  normalized = normalized.replace(/(民事|刑事|行政)$/g, '').trim();

  // 3. 簡易庭標準化 - 移除括號內容和案件類型
  // 例如：「南投簡易庭(含埔里)民事」→「南投簡易庭」
  if (normalized.includes('簡易庭')) {
    normalized = normalized.replace(/\([^)]*\)/g, '').trim();
    normalized = normalized.replace(/簡易庭.*$/g, '簡易庭').trim();
  }

  return normalized;
}

/**
 * 獲取法院所屬地區
 * @param {string} courtName - 法院名稱
 * @returns {string} 地區名稱
 */
export function getCourtRegion(courtName) {
  const normalized = normalizeCourtName(courtName);
  if (!normalized) return '其他';

  // 遍歷所有地區，找到匹配的法院
  for (const [region, courts] of Object.entries(COURT_REGIONS)) {
    for (const court of courts) {
      // 完全匹配
      if (normalized === court) {
        return region;
      }
      
      // 部分匹配（處理簡易庭的情況）
      // 例如：「竹北簡易庭(含竹東)」應該匹配「竹北簡易庭」
      if (normalized.includes(court) || court.includes(normalized)) {
        return region;
      }
      
      // 處理地方法院的簡易庭
      // 例如：「臺北簡易庭」應該歸類到「臺灣臺北地方法院」所在的地區
      if (normalized.includes('簡易庭')) {
        const courtBase = normalized.replace('簡易庭', '');
        if (court.includes(courtBase)) {
          return region;
        }
      }
    }
  }

  return '其他';
}

/**
 * 生成法院的所有可能變體（用於搜索）
 * @param {string} courtName - 法院名稱
 * @returns {string[]} 所有可能的變體
 */
export function getCourtVariants(courtName) {
  if (!courtName) return [];

  const variants = new Set();
  const normalized = normalizeCourtName(courtName);
  
  if (!normalized) return [];

  // 1. 標準化名稱（臺）
  variants.add(normalized);

  // 2. 台字變體
  variants.add(normalized.replace(/臺/g, '台'));

  // 3. 如果是地方法院，添加簡稱
  if (normalized.includes('地方法院')) {
    const shortName = normalized.replace('臺灣', '').replace('地方法院', '');
    variants.add(shortName);
    variants.add(shortName.replace(/臺/g, '台'));
  }

  return Array.from(variants);
}

/**
 * 獲取結構化的法院列表（按地區分組）
 * @param {string[]} rawCourtNames - 從 ES 獲取的原始法院名稱列表
 * @returns {Object} 按地區分組的法院列表
 */
export function getStructuredCourtList(rawCourtNames) {
  if (!Array.isArray(rawCourtNames)) {
    return {
      '高等以上': [],
      '北部': [],
      '中部': [],
      '南部': [],
      '東部外島': [],
      '其他': []
    };
  }

  // 使用 Map 來去重和合併同名異字的法院
  const courtMap = new Map();

  rawCourtNames.forEach(name => {
    const normalized = normalizeCourtName(name);
    if (!normalized) return;

    if (!courtMap.has(normalized)) {
      courtMap.set(normalized, {
        displayName: normalized,
        originalNames: [name],
        region: getCourtRegion(normalized),
        variants: getCourtVariants(normalized)
      });
    } else {
      // 合併原始名稱（處理同名異字）
      const existing = courtMap.get(normalized);
      if (!existing.originalNames.includes(name)) {
        existing.originalNames.push(name);
      }
    }
  });

  // 按地區分組
  const grouped = {
    '高等以上': [],
    '北部': [],
    '中部': [],
    '南部': [],
    '東部外島': [],
    '其他': []
  };

  courtMap.forEach(court => {
    const region = court.region || '其他';
    if (grouped[region]) {
      grouped[region].push(court);
    } else {
      grouped['其他'].push(court);
    }
  });

  // 每個地區內按名稱排序
  Object.keys(grouped).forEach(region => {
    grouped[region].sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-TW'));
  });

  return grouped;
}

/**
 * 檢查法院名稱是否匹配（支持同名異字）
 * @param {string} courtName - 要檢查的法院名稱
 * @param {string} targetCourt - 目標法院名稱
 * @returns {boolean} 是否匹配
 */
export function isCourtMatch(courtName, targetCourt) {
  if (!courtName || !targetCourt) return false;

  const normalized1 = normalizeCourtName(courtName);
  const normalized2 = normalizeCourtName(targetCourt);

  return normalized1 === normalized2;
}

/**
 * 獲取法院的簡短顯示名稱（用於前端顯示）
 * @param {string} courtName - 法院名稱
 * @returns {string} 簡短名稱
 */
export function getCourtShortName(courtName) {
  if (!courtName) return '';

  let shortName = normalizeCourtName(courtName);
  if (!shortName) return courtName;

  // 移除「臺灣」前綴
  shortName = shortName.replace('臺灣', '');

  // 地方法院簡化
  shortName = shortName.replace('地方法院', '地院');

  // 簡易庭保持原樣
  // 最高法院等保持原樣

  return shortName;
}

