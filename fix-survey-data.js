// fix-survey-data.js
// 修復舊的調查記錄，添加 hasReceivedReward 欄位

import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 初始化 Firebase Admin
const serviceAccountPath = join(__dirname, 'serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixSurveyData() {
  console.log('\n🔧 開始修復調查數據...\n');

  try {
    // 獲取所有調查記錄
    const snapshot = await db.collection('satisfaction_surveys').get();

    console.log(`📊 找到 ${snapshot.size} 筆調查記錄\n`);

    let fixedCount = 0;
    let alreadyCorrectCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      console.log(`\n檢查調查 ${doc.id}:`);
      console.log(`  用戶: ${data.userId}`);
      console.log(`  創建時間: ${data.createdAt?.toDate()}`);
      console.log(`  hasReceivedReward: ${data.hasReceivedReward}`);

      // 如果沒有 hasReceivedReward 欄位，則添加
      if (data.hasReceivedReward === undefined) {
        console.log(`  ⚠️ 缺少 hasReceivedReward 欄位，正在修復...`);
        
        await doc.ref.update({
          hasReceivedReward: true  // 假設舊記錄都已經發放過積分
        });
        
        console.log(`  ✅ 已添加 hasReceivedReward: true`);
        fixedCount++;
      } else {
        console.log(`  ✅ 欄位正確`);
        alreadyCorrectCount++;
      }
    }

    console.log(`\n\n📊 修復完成統計:`);
    console.log(`  總記錄數: ${snapshot.size}`);
    console.log(`  已修復: ${fixedCount}`);
    console.log(`  已正確: ${alreadyCorrectCount}`);

  } catch (error) {
    console.error('❌ 修復失敗:', error);
  }
}

fixSurveyData().then(() => {
  console.log('\n✅ 腳本執行完成');
  process.exit(0);
}).catch(error => {
  console.error('❌ 腳本執行失敗:', error);
  process.exit(1);
});

