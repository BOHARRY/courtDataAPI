// Boooook/services/contactService.js
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import {
    GMAIL_APP_USER, // 您需要在 environment.js 或 .env 中配置這些
    GMAIL_APP_PASSWORD,
    CONTACT_FORM_RECIPIENT_EMAIL // 收件人郵箱，例如 "investors@lawsowl.com" 或您的郵箱
} from '../config/environment.js'; // 假設您會在這裡定義 Gmail 相關環境變數



/**
 * 處理聯繫表單的提交。
 * @param {object} formData - 包含 name, email, topic, message, organization, userId (可選) 的物件。
 * @param {object} [file] - (可選) 上傳的檔案物件 (來自 multer)。
 * @returns {Promise<{id: string, attachmentUrl?: string}>} 提交記錄的 ID 和附件 URL (如果有的話)。
 */
export async function handleSubmitContactForm(formData, file) {
    const db = admin.firestore();
    const storage = admin.storage();
    const bucket = storage.bucket(FIREBASE_STORAGE_BUCKET_NAME); // <--- 確保 FIREBASE_STORAGE_BUCKET_NAME 已定義

    let attachmentUrl = null;
    let attachmentFileName = null;

    try {
        // 1. 如果有附件，先上傳到 Firebase Storage
        if (file) {
            const uniqueFileName = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
            const filePath = `contact_attachments/${formData.userId || 'anonymous'}/${uniqueFileName}`;
            const fileUpload = bucket.file(filePath);

            const stream = fileUpload.createWriteStream({
                metadata: {
                    contentType: file.mimetype,
                },
                resumable: false,
            });

            await new Promise((resolve, reject) => {
                stream.on('error', (err) => {
                    console.error('Error uploading to Firebase Storage:', err);
                    reject(new Error('檔案上傳失敗。'));
                });
                stream.on('finish', resolve);
                stream.end(file.buffer); // 從 multer 的 memoryStorage 獲取 buffer
            });

            // 獲取公開的下載 URL (確保您的 Storage 規則允許讀取)
            // 為了簡化，這裡假設直接獲取簽名 URL 或拼接 URL (取決於您的 bucket 權限)
            // 更安全的方式是生成一個有時效性的簽名 URL
            // const [url] = await fileUpload.getSignedUrl({ action: 'read', expires: '03-09-2491' }); // 一個很長的過期時間
            // attachmentUrl = url;
            // 或者，如果 bucket 是公開可讀的 (不推薦用於敏感附件)
            attachmentUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media`;
            attachmentFileName = file.originalname;
            console.log(`檔案已上傳至 Firebase Storage: ${attachmentUrl}`);
        }

        // 2. 將表單數據和附件資訊保存到 Firestore
        const submission = {
            ...formData,
            submittedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'new', // 初始狀態
            ...(attachmentUrl && { attachmentUrl }), // 如果有附件 URL，則添加
            ...(attachmentFileName && { attachmentFileName }), // 如果有附件檔名，則添加
        };
        const docRef = await db.collection('contact_submissions').add(submission);
        console.log('聯繫表單已保存到 Firestore，ID:', docRef.id);

        // 3. 發送郵件通知
        await sendContactNotificationEmail(submission, file ? { url: attachmentUrl, name: attachmentFileName } : null);

        return { id: docRef.id, attachmentUrl };

    } catch (error) {
        console.error('處理聯繫表單時發生錯誤:', error);
        // 可以在這裡根據錯誤類型做更細緻的處理，例如如果只是郵件發送失敗，數據仍應保存
        throw new Error(error.message || '提交聯繫表單失敗，請稍後再試。');
    }
}

/**
 * 發送聯繫表單的郵件通知。
 * @param {object} submissionData - 已保存到 Firestore 的表單數據。
 * @param {object} [attachmentInfo] - (可選) 附件信息 { url, name }。
 */
async function sendContactNotificationEmail(submissionData, attachmentInfo) {
    if (!GMAIL_APP_USER || !GMAIL_APP_PASSWORD || !CONTACT_FORM_RECIPIENT_EMAIL) {
        console.warn('Gmail 環境變數未完整設定，無法發送通知郵件。');
        return;
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: GMAIL_APP_USER,
            pass: GMAIL_APP_PASSWORD, // 推薦使用應用程式密碼
        },
    });

    let subject = `[LawSowl 聯繫表單] 新訊息：${submissionData.topic}`;
    if (submissionData.topic === 'collaboration_investment') {
        subject = `🌟 [重要 - LawSowl 投資/合作洽詢] 來自 ${submissionData.name}`;
    }

    let htmlBody = `
    <h2>LawSowl 平台收到新的聯繫訊息：</h2>
    <p><strong>姓名：</strong> ${submissionData.name}</p>
    <p><strong>Email：</strong> ${submissionData.email}</p>
    <p><strong>聯繫主題：</strong> ${submissionData.topic}</p>
    ${submissionData.organization ? `<p><strong>公司/組織：</strong> ${submissionData.organization}</p>` : ''}
    <p><strong>詳細內容：</strong></p>
    <div style="border:1px solid #eee; padding:10px; white-space:pre-wrap;">${submissionData.message}</div>
  `;

    if (attachmentInfo && attachmentInfo.url) {
        htmlBody += `<p><strong>附件：</strong> <a href="${attachmentInfo.url}" target="_blank">${attachmentInfo.name || '點此查看附件'}</a></p>`;
    }

    htmlBody += `<hr><p>提交時間：${new Date(submissionData.submittedAt?.toDate() || Date.now()).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</p>`;
    if (submissionData.userId) {
        htmlBody += `<p>用戶 UID (如果已登入)：${submissionData.userId}</p>`;
    }

    const mailOptions = {
        from: `"LawSowl 通知" <${GMAIL_APP_USER}>`,
        to: CONTACT_FORM_RECIPIENT_EMAIL, // 可以是您的郵箱或團隊郵箱
        subject: subject,
        html: htmlBody,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('通知郵件已成功發送:', info.messageId);
    } catch (error) {
        console.error('發送通知郵件失敗:', error);
        // 這裡不應該 re-throw error，避免影響主流程的成功響應
        // 但需要記錄下來
    }
}