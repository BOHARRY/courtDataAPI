// 測試高等法院分院歸類
import { normalizeCourtName, getCourtRegion } from './services/courtNormalizer.js';

console.log('🧪 測試高等法院分院歸類\n');

const highCourtTests = [
  '臺灣高等法院',
  '臺灣高等法院臺中分院',
  '臺灣高等法院臺南分院',
  '臺灣高等法院高雄分院',
  '臺灣高等法院花蓮分院',
  '台灣高等法院台中分院',
  '台灣高等法院台南分院',
  '福建高等法院金門分院',
];

highCourtTests.forEach(court => {
  const normalized = normalizeCourtName(court);
  const region = getCourtRegion(court);
  const isCorrect = region === '高等以上';
  
  console.log(${isCorrect ? '✅' : '❌'} );
  console.log(   標準化: );
  console.log(   地區: \n);
});

const allCorrect = highCourtTests.every(court => getCourtRegion(court) === '高等以上');
console.log(allCorrect ? '✅ 所有高等法院都正確歸類到「高等以上」' : '❌ 有高等法院歸類錯誤');
