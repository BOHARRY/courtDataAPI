// services/courtNormalizer.js
// 法院標準化服務 - 處理法院名稱標準化、地區分組、同名異字等問題

/**
 * 法院地區分組配置
 * 注意：只包含民事案件的法院（目前資料庫不包含刑事和行政）
 * 根據 ES 實際資料更新
 */
const COURT_REGIONS = {
  '高等以上': [
    '最高法院',
    '臺灣高等法院',
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
    '臺灣宜蘭地方法院'
  ],
  '中部': [
    '臺灣臺中地方法院',
    '臺灣彰化地方法院',
    '臺灣南投地方法院',
    '臺灣雲林地方法院',
    '臺灣苗栗地方法院'
  ],
  '南部': [
    '臺灣臺南地方法院',
    '臺灣高雄地方法院',
    '臺灣橋頭地方法院',
    '臺灣嘉義地方法院',
    '臺灣屏東地方法院',
    '臺灣高雄少年及家事法院',
    '臺灣澎湖地方法院'
  ],
  '東部外島': [
    '臺灣花蓮地方法院',
    '臺灣臺東地方法院',
    '福建金門地方法院',
    '福建連江地方法院'
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

  // 2. 移除庭別後綴（民事庭、民事第X庭、民事簡易庭等）
  normalized = normalized.replace(/民事第?[一二三四五六七八九十\d]+庭$/g, '').trim();
  normalized = normalized.replace(/民事庭$/g, '').trim();
  normalized = normalized.replace(/民事簡易庭$/g, '').trim();
  normalized = normalized.replace(/民事勞動法庭$/g, '').trim();
  normalized = normalized.replace(/家事法庭$/g, '').trim();
  normalized = normalized.replace(/醫事法庭$/g, '').trim();
  normalized = normalized.replace(/商業庭$/g, '').trim();
  normalized = normalized.replace(/智慧財產第?[一二三四五六七八九十\d]+庭$/g, '').trim();
  normalized = normalized.replace(/勞動法庭第?[一二三四五六七八九十\d]+庭$/g, '').trim();

  // 3. 移除案件類型後綴（民事、刑事、行政、民事判決）
  normalized = normalized.replace(/(民事|刑事|行政|民事判決)$/g, '').trim();

  // 4. 簡易庭標準化
  // 移除括號內容：「南投簡易庭(含埔里)」→「南投簡易庭」
  normalized = normalized.replace(/\([^)]*\)/g, '').trim();

  // 移除簡易庭後的地名重複：「臺灣台中地方法院臺中簡易庭」→「臺灣臺中地方法院簡易庭」
  // 但保留簡易庭名稱：「板橋簡易庭」、「新店簡易庭」等
  if (normalized.includes('簡易庭')) {
    // 移除「地方法院」和簡易庭之間的重複地名
    normalized = normalized.replace(/地方法院(臺北|臺中|臺南|高雄|桃園|新竹|基隆|宜蘭|花蓮|臺東|屏東|嘉義|彰化|南投|雲林|苗栗|澎湖)簡易庭/g, '地方法院簡易庭');
  }

  // 5. 補充「臺灣」前綴（如果缺少）
  if (!normalized.startsWith('臺灣') &&
      !normalized.startsWith('最高') &&
      !normalized.startsWith('福建') &&
      !normalized.startsWith('智慧財產') &&
      !normalized.startsWith('憲法') &&
      !normalized.startsWith('懲戒')) {
    // 檢查是否為地方法院
    if (normalized.includes('地方法院')) {
      normalized = '臺灣' + normalized;
    }
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

  // 特殊處理：高等法院分院
  if (normalized.includes('高等法院')) {
    if (normalized.includes('臺中分院')) return '中部';
    if (normalized.includes('臺南分院')) return '南部';
    if (normalized.includes('高雄分院')) return '南部';
    if (normalized.includes('花蓮分院')) return '東部外島';
    if (normalized.includes('金門分院')) return '東部外島';
    // 臺灣高等法院（本院）歸類為高等以上
    return '高等以上';
  }

  // 遍歷所有地區，找到匹配的法院
  for (const [region, courts] of Object.entries(COURT_REGIONS)) {
    for (const court of courts) {
      // 完全匹配
      if (normalized === court) {
        return region;
      }

      // 部分匹配（處理簡易庭的情況）
      if (normalized.includes('簡易庭')) {
        // 提取地方法院名稱
        const match = normalized.match(/臺灣(.+?)地方法院/);
        if (match) {
          const courtBase = '臺灣' + match[1] + '地方法院';
          if (court === courtBase) {
            return region;
          }
        }
      }

      // 檢查是否包含法院基本名稱
      if (normalized.includes(court)) {
        return region;
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

