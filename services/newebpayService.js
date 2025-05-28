// services/newebpayService.js
import crypto from 'crypto';
import {
    NEWEBPAY_HASH_KEY,
    NEWEBPAY_HASH_IV,
    // NEWEBPAY_MERCHANT_ID // MerchantID 通常在控制器或更高層傳入
} from '../config/environment.js';

// AES 加密函數 (符合藍新 PKCS7 Padding)
function aesEncrypt(data, key, iv) {
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

// AES 解密函數 (符合藍新 PKCS7 Padding)
export function aesDecrypt(encryptedData, key, iv) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    decipher.setAutoPadding(false); // 需手動處理 padding
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    // 手動移除 PKCS7 padding
    const pad = decrypted.charCodeAt(decrypted.length - 1);
    return decrypted.slice(0, -pad);
}

// SHA256 雜湊函數
function sha256Encrypt(data) {
    return crypto.createHash('sha256').update(data).digest('hex').toUpperCase();
}

/**
 * 準備藍新 MPG (幕前支付) 交易的加密參數
 * @param {object} tradeParams - 包含 MerchantOrderNo, Amt, ItemDesc, Email, RespondType, TimeStamp, Version, NotifyURL, ReturnURL 等
 * @param {string} merchantID - 商店代號
 * @returns {{TradeInfo: string, TradeSha: string, MerchantID: string, Version: string}}
 */
export function prepareMpgTradeArgs(tradeParams, merchantID) {
    const version = tradeParams.Version || '2.0'; // 藍新手冊通常是 2.0 或 2.2

    // 1. 組裝 TradeInfo 字串 (Query String 格式)
    const tradeInfoQueryString = new URLSearchParams(tradeParams).toString();

    // 2. AES 加密 TradeInfo
    const encryptedTradeInfo = aesEncrypt(tradeInfoQueryString, NEWEBPAY_HASH_KEY, NEWEBPAY_HASH_IV);

    // 3. SHA256 雜湊 (HashKey + EncryptedTradeInfo + HashIV)
    const shaString = `HashKey=${NEWEBPAY_HASH_KEY}&${encryptedTradeInfo}&HashIV=${NEWEBPAY_HASH_IV}`;
    const tradeSha = sha256Encrypt(shaString);

    return {
        MerchantID: merchantID, // 藍新 POST 表單中的欄位是 MerchantID (非 MerchantID_)
        TradeInfo: encryptedTradeInfo,
        TradeSha: tradeSha,
        Version: version, // 將版本號也傳給表單
    };
}

/**
 * 準備藍新信用卡定期定額建立委託的加密參數
 * @param {object} periodParams - 包含 RespondType, TimeStamp, Version, MerOrderNo, ProdDesc, PeriodAmt, PeriodType, PeriodPoint, PeriodStartType, PeriodTimes, PayerEmail, NotifyURL 等
 * @returns {{PostData_: string}} // 注意藍新手冊中 POST 的欄位名
 */
export function preparePeriodCreateArgs(periodParams) {
    const periodDataQueryString = new URLSearchParams(periodParams).toString();
    const encryptedPostData = aesEncrypt(periodDataQueryString, NEWEBPAY_HASH_KEY, NEWEBPAY_HASH_IV);
    return {
        PostData_: encryptedPostData, // 藍新手冊中 POST 的欄位名
    };
}

/**
 * 驗證並解密藍新 MPG Notify 或 Return 的資料
 * @param {string} encryptedTradeInfo - 藍新回傳的加密 TradeInfo
 * @param {string} receivedTradeSha - 藍新回傳的 TradeSha
 * @returns {object|null} 解密後的 TradeInfo 物件，或驗證失敗時返回 null
 */
export function verifyAndDecryptMpgData(encryptedTradeInfo, receivedTradeSha) {
    const shaString = `HashKey=${NEWEBPAY_HASH_KEY}&${encryptedTradeInfo}&HashIV=${NEWEBPAY_HASH_IV}`;
    const calculatedTradeSha = sha256Encrypt(shaString);

    if (calculatedTradeSha !== receivedTradeSha.toUpperCase()) {
        console.error('[NewebpayService] MPG SHA checksum mismatch.');
        console.error(`Received SHA: ${receivedTradeSha}`);
        console.error(`Calculated SHA: ${calculatedTradeSha}`);
        return null;
    }

    try {
        const decryptedString = aesDecrypt(encryptedTradeInfo, NEWEBPAY_HASH_KEY, NEWEBPAY_HASH_IV);
        // 將查詢字串轉為物件
        const params = {};
        new URLSearchParams(decryptedString).forEach((value, key) => {
            params[key] = value;
        });
        return params;

    } catch (error) {
        console.error('[NewebpayService] MPG AES decryption failed:', error);
        return null;
    }
}

/**
 * 解密藍新信用卡定期定額 Notify 的資料
 * @param {string} encryptedPeriodData - 藍新回傳的加密 Period 資料
 * @returns {object|null} 解密後的 Period 物件，或解密失敗時返回 null
 */
export function decryptPeriodData(encryptedPeriodData) {
    try {
        const decryptedString = aesDecrypt(encryptedPeriodData, NEWEBPAY_HASH_KEY, NEWEBPAY_HASH_IV);
        return JSON.parse(decryptedString); // 定期定額回傳的是 JSON 字串
    } catch (error) {
        console.error('[NewebpayService] Period AES decryption/JSON parse failed:', error);
        return null;
    }
}