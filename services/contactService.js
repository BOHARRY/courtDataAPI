// Boooook/services/contactService.js
import admin from 'firebase-admin';
import nodemailer from 'nodemailer';
import {
    GMAIL_APP_USER, // 您需要在 environment.js 或 .env 中配置這些
    GMAIL_APP_PASSWORD,
    CONTACT_FORM_RECIPIENT_EMAIL, // 收件人郵箱，例如 "investors@lawsowl.com" 或您的郵箱
    FIREBASE_STORAGE_BUCKET_NAME
} from '../config/environment.js'; // 假設您會在這裡定義 Gmail 相關環境變數

/**
 * 嘗試解碼可能被錯誤編碼的檔名。
 * 瀏覽器有時會將 UTF-8 檔名錯誤地按 ISO-8859-1 解釋後再進行百分比編碼。
 * 或者 multer 可能以 ISO-8859-1 來解讀 UTF-8 bytes。
 * @param {string} filename
 * @returns {string}
 */
function decodeFilename(filename) {
    try {
        // 嘗試標準的 UTF-8 解碼 (如果它是正確的百分比編碼)
        // 但 multer 的 originalname 通常不是百分比編碼的 URL 字符串
        // const decoded = decodeURIComponent(filename);
        // return Buffer.from(decoded, 'latin1').toString('utf8'); // 如果 decodeURIComponent 後是 latin1

        // 一個常見的修復是假設 multer 將 UTF-8 字節流錯誤地解釋為 ISO-8859-1 (Latin-1)
        // 所以我們將其轉回字節流，然後再用 UTF-8 解碼
        const buffer = Buffer.from(filename, 'latin1');
        const utf8Decoded = buffer.toString('utf8');

        // 檢查解碼後的結果是否仍然包含看起來像亂碼的替換字符 (�)
        // 如果原始字節流本來就不是有效的 UTF-8，那麼 toString('utf8') 可能會產生 �
        // 這種情況下，可能原始檔名就是這樣，或者需要更複雜的檢測
        if (utf8Decoded.includes('\uFFFD')) {
            // 如果解碼結果包含 Unicode 替換字符，可能原始就是 UTF-8 或其他編碼
            // 這裡可以嘗試 decodeURIComponent，雖然 multer 的 originalname 通常不是 URL 編碼的
            try {
                return decodeURIComponent(escape(filename)); // 一個舊的技巧，但可能有效
            } catch (e) {
                return utf8Decoded; // 如果 decodeURIComponent 也失敗，則返回之前的 utf8 解碼結果
            }
        }
        return utf8Decoded;
    } catch (e) {
        console.warn(`解碼檔名 "${filename}" 失敗，返回原始檔名。錯誤: ${e.message}`);
        return filename; // 如果解碼失敗，返回原始檔名
    }
}

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

    if (!FIREBASE_STORAGE_BUCKET_NAME) {
        console.error('[contactService] CRITICAL: FIREBASE_STORAGE_BUCKET_NAME is undefined or empty within handleSubmitContactForm!');
        throw new Error('伺服器存儲配置錯誤，無法處理附件。');
    }
    console.log('FIREBASE_STORAGE_BUCKET_NAME in contactService:', FIREBASE_STORAGE_BUCKET_NAME);

    let attachmentUrl = null;
    let attachmentFileName = null;

    try {
        // 1. 如果有附件，先上傳到 Firebase Storage
        if (file) {
            // --- 在這裡解碼檔名 ---
            const originalDecodedName = decodeFilename(file.originalname);
            attachmentFileName = originalDecodedName; // 用於郵件和 Firestore
            // --- 結束解碼 ---

            const safeStorageFileName = `${Date.now()}_${originalDecodedName.replace(/\s+/g, '_').replace(/[^\w.-]/g, '')}`;
            const filePath = `contact_attachments/${formData.userId || 'anonymous'}/${safeStorageFileName}`;
            const fileUpload = bucket.file(filePath);


            const stream = fileUpload.createWriteStream({
                metadata: {
                    contentType: file.mimetype,
                    // 可以嘗試在這裡設定 contentDisposition，提示瀏覽器下載時使用 UTF-8 檔名
                    contentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(originalDecodedName)}`
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

            // --- 生成簽名 URL ---
            const expiresDate = new Date();
            expiresDate.setDate(expiresDate.getDate() + 90); // 設置簽名 URL 7 天後過期

            const [signedUrl] = await fileUpload.getSignedUrl({
                action: 'read',
                expires: expiresDate.toISOString().substring(0, 10) // 格式 YYYY-MM-DD
            });
            attachmentUrl = signedUrl;
            // --- 結束生成簽名 URL ---
        }

        // 2. 將表單數據和附件資訊保存到 Firestore
        const submission = {
            ...formData,
            submittedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'new',
            ...(attachmentUrl && { attachmentUrl }),
            ...(attachmentFileName && { attachmentFileName }), // <--- 儲存解碼後的檔名
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

    const submissionTime = new Date(); // 獲取當前伺服器時間
    htmlBody += `<hr><p>提交時間 (約)：${submissionTime.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</p>`;
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