// services/orderService.js
import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid'; // 用於生成唯一訂單號

const db = admin.firestore();
const ordersCollection = db.collection('orders'); // 建議的集合名稱

/**
 * 創建一個新的支付訂單記錄
 * @param {string} userId
 * @param {string} itemId - 方案ID或積分包ID
 * @param {string} itemType - 'plan' 或 'package'
 * @param {number} amount - 應付金額 (考慮折扣後)
 * @param {string} itemDescription - 商品描述
 * @returns {Promise<string>} 新訂單的 MerchantOrderNo
 */
export async function createOrder(userId, itemId, itemType, amount, itemDescription, billingCycle = null) { // 新增 
    const merchantOrderNo = `LAWSOML_${uuidv4().replace(/-/g, '').substring(0, 16)}`; // 生成唯一訂單號
    const orderData = {
        merchantOrderNo,
        userId,
        itemId,
        itemType,
        amount, // 實際應付金額
        itemDescription,
        ...(billingCycle && { billingCycle }), // 如果是 plan，記錄週期
        status: 'PENDING_PAYMENT',
        paymentGateway: 'newebpay',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ordersCollection.doc(merchantOrderNo).set(orderData);
    console.log(`[OrderService] Order created: ${merchantOrderNo} for user ${userId}, item ${itemId}`);
    return merchantOrderNo;
}

/**
 * 根據 MerchantOrderNo 更新訂單狀態和相關資訊
 * @param {string} merchantOrderNo
 * @param {object} updateData - 例如 { status: 'PAID', gatewayTradeNo: 'xxx', updatedAt: serverTimestamp(), notifyDataRaw: '...', notifyDataDecrypted: {...} }
 */
export async function updateOrderByMerchantOrderNo(merchantOrderNo, updateData) {
    const orderRef = ordersCollection.doc(merchantOrderNo);
    await orderRef.update({
        ...updateData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[OrderService] Order updated: ${merchantOrderNo}, status: ${updateData.status}`);
}

/**
 * 根據 MerchantOrderNo 獲取訂單
 * @param {string} merchantOrderNo
 * @returns {Promise<FirebaseFirestore.DocumentSnapshot | null>}
 */
export async function getOrderByMerchantOrderNo(merchantOrderNo) {
    const orderRef = ordersCollection.doc(merchantOrderNo);
    const docSnap = await orderRef.get();
    if (docSnap.exists) {
        return docSnap;
    }
    return null;
}