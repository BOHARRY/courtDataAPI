// test-survey-query.js
// 測試調查查詢功能

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

async function testSurveyQuery(userId) {
  console.log(`\n🔍 測試查詢用戶 ${userId} 的調查記錄...\n`);

  try {
    // 方法 1: 使用 where 查詢（當前實作）
    console.log('📋 方法 1: where 查詢');
    const snapshot1 = await db.collection('satisfaction_surveys')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    console.log(`   查詢結果數量: ${snapshot1.size}`);
    if (!snapshot1.empty) {
      const doc = snapshot1.docs[0];
      console.log(`   ✅ 找到調查 ID: ${doc.id}`);
      console.log(`   數據:`, {
        userId: doc.data().userId,
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
        submissionCount: doc.data().submissionCount,
        hasReceivedReward: doc.data().hasReceivedReward
      });
    } else {
      console.log(`   ❌ 沒有找到調查記錄`);
    }

    // 方法 2: 列出所有調查（檢查是否有重複）
    console.log('\n📋 方法 2: 列出該用戶的所有調查');
    const snapshot2 = await db.collection('satisfaction_surveys')
      .where('userId', '==', userId)
      .get();

    console.log(`   總共找到 ${snapshot2.size} 筆調查記錄`);
    snapshot2.docs.forEach((doc, index) => {
      console.log(`   [${index + 1}] ID: ${doc.id}`);
      console.log(`       創建時間: ${doc.data().createdAt?.toDate()}`);
      console.log(`       更新時間: ${doc.data().updatedAt?.toDate()}`);
      console.log(`       提交次數: ${doc.data().submissionCount}`);
      console.log(`       已領獎勵: ${doc.data().hasReceivedReward}`);
    });

    if (snapshot2.size > 1) {
      console.log(`\n   ⚠️ 警告: 發現 ${snapshot2.size} 筆調查記錄！應該只有 1 筆。`);
    }

  } catch (error) {
    console.error('❌ 查詢失敗:', error);
  }
}

// 從命令行參數獲取 userId
const userId = process.argv[2];

if (!userId) {
  console.error('❌ 請提供 userId 參數');
  console.log('使用方式: node test-survey-query.js <userId>');
  process.exit(1);
}

testSurveyQuery(userId).then(() => {
  console.log('\n✅ 測試完成');
  process.exit(0);
}).catch(error => {
  console.error('❌ 測試失敗:', error);
  process.exit(1);
});

