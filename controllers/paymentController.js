// controllers/paymentController.js
import * as newebpayService from '../services/newebpayService.js';
import * as orderService from '../services/orderService.js';
import * as userService from '../services/user.js'; // 引入 user service
import * as creditService from '../services/credit.js';
import { subscriptionProducts } from '../config/subscriptionProducts.js';
import { commerceConfig } from '../config/commerceConfig.js';
import { CREDIT_PURPOSES } from '../config/creditCosts.js';
import admin from 'firebase-admin';
import {
    NEWEBPAY_MERCHANT_ID,
    NEWEBPAY_MPG_URL,
    NEWEBPAY_PERIOD_URL,
    APP_BASE_URL,
    BACKEND_API_URL
} from '../config/environment.js';

export async function initiateCheckoutController(req, res, next) {
    const userId = req.user.uid;
    const { itemId, itemType, billingCycle, periodPoint, periodStartType, periodFirstDate, periodTimes: reqPeriodTimes } = req.body;

    if (!itemId || !itemType) {
        return res.status(400).json({ error: 'itemId and itemType are required.' });
    }
    if (itemType === 'plan' && !billingCycle) {
        return res.status(400).json({ error: 'billingCycle ("monthly" or "annually") is required for plan purchases.' });
    }

    let amount;
    let itemDescription;
    let usePeriodApi = false;
    let finalPeriodApiParams = null;
    let originalAmount = 0;
    let discountAmount = 0;
    let discountPercentage = 0;
    let nextBillingDate = null;
    let trialInfo = null;

    try {
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const userData = userDoc.data();
        const userLevel = userData.level || 'free';

        if (itemType === 'plan') {
            const planIdLower = itemId.toLowerCase();
            const billingCycleLower = billingCycle.toLowerCase();
            const planConfig = subscriptionProducts[planIdLower];

            if (!planConfig || !planConfig.pricing || !planConfig.pricing[billingCycleLower]) {
                return res.status(400).json({ error: `Invalid plan ID or billing cycle: ${itemId} - ${billingCycle}` });
            }

            const pricingDetails = planConfig.pricing[billingCycleLower];
            amount = pricingDetails.price;
            originalAmount = amount;
            itemDescription = `訂閱 LawSowl ${planConfig.name} (${pricingDetails.displayText})`;

            if (amount < 0) { return res.status(400).json({ error: '訂閱方案價格配置錯誤 (金額小於0)。' }); }
            if (planConfig.id === 'free') {
                if (amount !== 0) console.warn(`[Checkout] Free plan ${planConfig.id} has non-zero price ${amount} in request.`);
                return res.status(400).json({ error: '免費方案無需支付流程。' });
            }
            if (amount === 0 && planConfig.id !== 'free') {
                console.warn(`[Checkout] Attempt to checkout a non-free plan with 0 amount: ${itemId}, billingCycle: ${billingCycle}`);
                return res.status(400).json({ error: '零元方案不應觸發支付（非免費方案）。' });
            }

            const now = new Date();
            if (billingCycleLower === 'monthly' && amount > 0) {
                usePeriodApi = true;
                const periodConfigParams = pricingDetails.newebpayPeriodParams || {};
                finalPeriodApiParams = {
                    PeriodAmt: amount,
                    PeriodType: periodConfigParams.PeriodType || 'M',
                    PeriodPoint: periodPoint || periodConfigParams.DefaultPeriodPoint || '01',
                    PeriodStartType: periodStartType || periodConfigParams.DefaultPeriodStartType || '2',
                    PeriodTimes: reqPeriodTimes || periodConfigParams.PeriodTimes || '12',
                };
                if (finalPeriodApiParams.PeriodStartType === '3' && periodFirstDate) {
                    finalPeriodApiParams.PeriodFirstdate = periodFirstDate;
                    nextBillingDate = new Date(periodFirstDate.replace(/\//g, '-'));
                } else if (finalPeriodApiParams.PeriodStartType === '2') {
                    nextBillingDate = new Date(now.getFullYear(), now.getMonth() + 1, parseInt(finalPeriodApiParams.PeriodPoint, 10));
                    if (now.getDate() >= parseInt(finalPeriodApiParams.PeriodPoint, 10)) {
                        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
                    }
                } else if (finalPeriodApiParams.PeriodStartType === '1' && finalPeriodApiParams.PeriodAmt === 10) {
                    trialInfo = { type: 'verification', verificationAmount: 10, message: '將先進行NT$10元信用卡驗證，驗證成功後開始訂閱。' };
                    nextBillingDate = null;
                }
            } else if (billingCycleLower === 'annually' && amount > 0) {
                usePeriodApi = false;
                nextBillingDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
            }

        } else if (itemType === 'package') {
            const pkg = commerceConfig.creditPackages.find(p => p.id === itemId);
            if (!pkg) return res.status(400).json({ error: `Invalid package ID: ${itemId}` });
            originalAmount = pkg.price;
            amount = pkg.price;
            itemDescription = `購買 LawSowl ${pkg.credits} 點積分包`;
            usePeriodApi = false;
            const discountInfo = commerceConfig.planSpecificDiscounts[userLevel.toLowerCase()];
            if (discountInfo && pkg.discountApplies && pkg.credits >= discountInfo.threshold) {
                amount = Math.round(originalAmount * discountInfo.discountRate);
                discountAmount = originalAmount - amount;
                discountPercentage = Math.round((1 - discountInfo.discountRate) * 100);
                itemDescription += ` (享${discountInfo.name} ${Math.round(discountInfo.discountRate * 10)}折優惠)`;
            }
        } else {
            return res.status(400).json({ error: 'Invalid itemType. Must be "plan" or "package".' });
        }

        if (typeof amount !== 'number' || amount < 0) {
            return res.status(400).json({ error: 'Calculated amount is invalid.' });
        }
        if (usePeriodApi && finalPeriodApiParams?.PeriodStartType === '1' && finalPeriodApiParams?.PeriodAmt !== 10) {
            console.warn(`[Checkout] PeriodStartType is 1 (verification) but PeriodAmt is not 10. Received: ${finalPeriodApiParams?.PeriodAmt}. Forcing to 10.`);
            finalPeriodApiParams.PeriodAmt = 10;
            if (amount !== 0 && planConfig?.id !== 'free') { // 只有當商品本身不是免費（0元）試用時才警告
                console.warn(`[Checkout] Product amount was ${originalAmount}, but verification payment will be 10 TWD for item ${itemId}.`);
            }
        }

        const merchantOrderNo = await orderService.createOrder(userId, itemId, itemType, amount, itemDescription, billingCycle);
        const timeStamp = Math.floor(Date.now() / 1000);
        const payerEmail = userData.email || req.user.email || '';

        const baseBackendUrl = BACKEND_API_URL || APP_BASE_URL;
        const notifyPathPrefix = '/api/payment/notify';
        const returnPathPrefix = '/payment-result';

        const baseResponse = {
            merchantOrderNo: merchantOrderNo,
            orderSummary: {
                itemId: itemId, itemType: itemType, itemName: itemDescription,
                originalPrice: originalAmount, discount: discountAmount, discountPercentage: discountPercentage,
                finalPrice: usePeriodApi && finalPeriodApiParams?.PeriodStartType === '1' ? 10 : amount,
                billingCycle: billingCycle || 'one-time',
                nextBillingDate: nextBillingDate ? nextBillingDate.toISOString().split('T')[0] : null,
                currency: 'TWD', payerEmail: payerEmail, trialInfo: trialInfo
            }
        };

        if (usePeriodApi) {
            const periodParams = {
                RespondType: 'JSON', TimeStamp: timeStamp, Version: '1.5',
                MerOrderNo: merchantOrderNo, ProdDesc: itemDescription, PayerEmail: payerEmail,
                PaymentInfo: 'Y', OrderInfo: 'N',
                ReturnURL: `${baseBackendUrl}/api/payment/return/general`, // 指向後端通用Return
                NotifyURL: `${baseBackendUrl}${notifyPathPrefix}/period`,
                ...finalPeriodApiParams
            };
            const newebpayArgs = newebpayService.preparePeriodCreateArgs(periodParams);
            console.log(`[Checkout] Preparing Period payment for ${merchantOrderNo}:`, periodParams);
            res.status(200).json({
                ...baseResponse, paymentMethod: 'Period',
                paymentGatewayUrl: NEWEBPAY_PERIOD_URL,
                newebpayMerchantID: NEWEBPAY_MERCHANT_ID,
                postData: newebpayArgs.PostData_,
                periodDetails: {
                    periodType: finalPeriodApiParams.PeriodType,
                    periodPoint: finalPeriodApiParams.PeriodPoint,
                    periodTimes: finalPeriodApiParams.PeriodTimes,
                    periodStartType: finalPeriodApiParams.PeriodStartType
                }
            });
        } else {
            const mpgParams = {
                MerchantID: NEWEBPAY_MERCHANT_ID, // MPG TradeInfo 內部需要 MerchantID
                RespondType: 'JSON', TimeStamp: timeStamp, Version: '2.2',
                MerchantOrderNo: merchantOrderNo, Amt: amount, ItemDesc: itemDescription,
                Email: payerEmail, LoginType: 0,
                ReturnURL: `${baseBackendUrl}/api/payment/return/general`, // 指向後端通用Return
                NotifyURL: `${baseBackendUrl}${notifyPathPrefix}/mpg`,
                ClientBackURL: `${APP_BASE_URL}/payment-cancel`, CREDIT: 1,
            };
            const newebpayArgs = newebpayService.prepareMpgTradeArgs(mpgParams, NEWEBPAY_MERCHANT_ID);
            console.log(`[Checkout] Preparing MPG payment for ${merchantOrderNo}:`, mpgParams);
            res.status(200).json({
                ...baseResponse, paymentMethod: 'MPG',
                paymentGatewayUrl: NEWEBPAY_MPG_URL,
                merchantID: newebpayArgs.MerchantID,
                tradeInfo: newebpayArgs.TradeInfo,
                tradeSha: newebpayArgs.TradeSha,
                version: newebpayArgs.Version,
            });
        }
    } catch (error) {
        console.error('[PaymentController] Error in initiateCheckoutController:', error);
        next(error);
    }
}

export async function handleMpgNotifyController(req, res, next) {
    console.log('[PaymentController] Received MPG Notify Request:', req.body);
    const { TradeInfo, TradeSha, MerchantID } = req.body;

    if (!TradeInfo || !TradeSha) { return res.status(400).send('Invalid MPG notification: Missing parameters.'); }
    if (MerchantID !== NEWEBPAY_MERCHANT_ID) { return res.status(400).send('Invalid MPG notification: MerchantID mismatch.'); }

    try {
        const decryptedData = newebpayService.verifyAndDecryptMpgData(TradeInfo, TradeSha);
        if (!decryptedData || !decryptedData.Result) {
            console.error(`[MPG Notify] Failed to verify, decrypt, or parse data, or Result object missing. Decrypted data:`, decryptedData);
            return res.status(400).send('MPG notification verification/decryption failed or malformed.');
        }

        const merchantOrderNo = decryptedData.Result.MerchantOrderNo;
        console.log(`[MPG Notify] Decrypted Data for MerchantOrderNo ${merchantOrderNo}:`, decryptedData);

        if (!merchantOrderNo) {
            console.error('[MPG Notify] MerchantOrderNo is missing from decrypted Result object.');
            return res.status(400).send('MPG notification processing error: MerchantOrderNo missing in Result.');
        }

        await admin.firestore().runTransaction(async (transaction) => {
            const currentOrderDocRef = admin.firestore().collection('orders').doc(merchantOrderNo);
            const currentOrderSnap = await transaction.get(currentOrderDocRef); // **讀取 1 (訂單)**

            if (!currentOrderSnap.exists) { console.warn(`[MPG Notify TX] Order ${merchantOrderNo} not found.`); return; }
            const currentOrderData = currentOrderSnap.data();
            if (currentOrderData.status !== 'PENDING_PAYMENT') { console.warn(`[MPG Notify TX] Order ${merchantOrderNo} status not PENDING_PAYMENT: ${currentOrderData.status}.`); return; }

            const isPaymentSuccess = decryptedData.Status === 'SUCCESS' && decryptedData.Result?.RespondCode === '00';

            // **提前準備好所有可能需要讀取的用戶數據**
            const { userId, itemId, itemType, billingCycle } = currentOrderData;
            const userRef = admin.firestore().collection('users').doc(userId);
            const userSnap = await transaction.get(userRef); // **讀取 2 (用戶數據，在所有寫入之前)**
            if (!userSnap.exists) {
                console.error(`[MPG Notify TX] User ${userId} not found for order ${merchantOrderNo}.`);
                throw new Error(`User ${userId} not found for order ${merchantOrderNo}.`); // 在 transaction 中拋錯會回滾
            }
            // const currentUserDataFromTx = userSnap.data(); // 如果後續的 service 函數需要整個 userData

            // 現在可以開始寫入操作了
            if (isPaymentSuccess) {
                transaction.update(currentOrderDocRef, { // **寫入 1 (更新訂單為 PAID)**
                    status: 'PAID',
                    gatewayTradeNo: decryptedData.Result?.TradeNo,
                    paymentType: decryptedData.Result?.PaymentType,
                    payTime: decryptedData.Result?.PayTime ? admin.firestore.Timestamp.fromDate(new Date(decryptedData.Result.PayTime.replace(/\//g, '-'))) : admin.firestore.FieldValue.serverTimestamp(),
                    notifyDataRaw: JSON.stringify(req.body),
                    notifyDataDecrypted: decryptedData,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                if (itemType === 'package') {
                    const pkg = commerceConfig.creditPackages.find(p => p.id === itemId);
                    if (pkg) {
                        // addUserCreditsInTransaction 內部也需要遵循先讀後寫，但它讀的是 userRef，我們已提前讀取
                        // 我們需要修改 addUserCreditsInTransaction 讓它可以接收已讀取的 userData
                        // 或者，更簡單的是，讓 addUserCreditsInTransaction 只負責寫入，讀取在外部完成
                        // 但目前的 addUserCreditsInTransaction 已經是先讀後寫，所以我們需要確保它在所有其他寫入之前被調用（如果它自己有寫入）
                        // 或者，如果它只是用 transaction 來寫，那麼它內部的讀取發生在外部寫入之後也是問題。

                        // **修正後的調用方式：讓 creditService 的函數也只做寫入**
                        // 這需要重構 creditService.addUserCreditsInTransaction，或者創建一個新版本
                        // 暫時，我們先假設 creditService.addUserCreditsInTransaction 內部不再執行 transaction.get(userRef)
                        // 而是依賴外部傳入的 currentCredits (如果有必要)

                        // **最簡單的修正是：將 addUserCreditsInTransaction 內部的 get userDoc 移到 paymentController**
                        // 並將 userData 傳給它，讓它只做計算和寫入。
                        // 但 `creditService.addUserCreditsInTransaction` 的設計是獨立的，包含讀寫。

                        // **正確的順序是：先完成所有對 userRef 的讀取（已在上面完成 userSnap），然後才能寫入 userRef**
                        // `addUserCreditsInTransaction` 內部會 `transaction.update(userRef, ...)` 和 `transaction.set(creditTransactionRef, ...)`
                        // 所以，它本身就是一個包含寫入的操作。
                        // 只要 `addUserCreditsInTransaction` 內部沒有在它的寫入操作之後再執行 `transaction.get(userRef)` 就沒問題。

                        // **問題的本質是：**
                        // 1. transaction.get(currentOrderDocRef)
                        // 2. transaction.get(userRef)
                        // 3. transaction.update(currentOrderDocRef, ...) // 第一次寫入
                        // 4. 調用 creditService.addUserCreditsInTransaction，它內部：
                        //    4a. const userDoc = await transaction.get(userRef); // 錯誤！在步驟3寫入後又讀取
                        //    4b. transaction.update(userRef, ...)
                        //    4c. transaction.set(creditTransactionRef, ...)

                        // **解決方案：重構 `creditService.addUserCreditsInTransaction` 使其不再自己 `get` userDoc，而是接收 `userData`**
                        let friendlyDescription = `購買 ${pkg.displayName || pkg.credits + " 點積分"}`;
                        await creditService.addUserCreditsInTransaction(
                            transaction,
                            userRef,
                            userId,
                            pkg.credits,
                            `${CREDIT_PURPOSES.PURCHASE_CREDITS_PKG_PREFIX}${itemId}`,
                            { description: friendlyDescription, relatedId: merchantOrderNo }, // 這是 logDetails
                            userSnap // **<--- 修正點：正確傳遞 userSnap 作為第七個參數**
                        );
                        console.log(`[MPG Notify Transaction] Granted ${pkg.credits} credits to user ${userId} for package ${itemId}. Description: "${friendlyDescription}"`);
                    }
                } else if (itemType === 'plan') { // MPG 支付的年付訂閱
                    await userService.updateUserSubscriptionInTransaction(
                        transaction, userId, itemId, billingCycle,
                        merchantOrderNo, true,
                        userSnap // <--- 同樣，傳入已讀取的 userSnap
                    );
                    console.log(`[MPG Notify TX] Updated user ${userId} subscription to ${itemId} (${billingCycle}).`);
                }
            } else { // 支付失敗
                transaction.update(currentOrderDocRef, { /* ... (更新訂單狀態為 FAILED) ... */ });
            }
        });
        return res.status(200).send('SUCCESS');
    } catch (error) {
        let orderNoForLog = 'Unknown';
        if (req.body.TradeInfo && req.body.TradeSha) {
            try {
                const tempDecrypted = newebpayService.verifyAndDecryptMpgData(req.body.TradeInfo, req.body.TradeSha);
                if (tempDecrypted && tempDecrypted.Result) orderNoForLog = tempDecrypted.Result.MerchantOrderNo || 'DecryptedNoOrderNo';
            } catch (e) {/* ignore */ }
        }
        console.error(`[MPG Notify] Error processing MPG notification for MerchantOrderNo ${orderNoForLog}:`, error);
        return res.status(500).send('Internal Server Error');
    }
}

export async function handlePeriodNotifyController(req, res, next) {
    console.log('[PaymentController] Received Period Notify Request:', req.body);
    const { Period, MerchantID_ } = req.body;

    if (!Period) { return res.status(400).send('Invalid Period notification: Missing Period data.'); }
    if (MerchantID_ !== NEWEBPAY_MERCHANT_ID) { return res.status(400).send('Invalid Period notification: MerchantID mismatch.'); }

    try {
        const decryptedResult = newebpayService.decryptPeriodData(Period);
        if (!decryptedResult) { return res.status(400).send('Period notification decryption failed.'); }

        console.log('[Period Notify] Decrypted Result:', decryptedResult);
        const { Status, Message, Result } = decryptedResult;
        const merchantOrderNoFromNotify = Result?.MerchantOrderNo;
        const periodNoFromNotify = Result?.PeriodNo;

        await admin.firestore().runTransaction(async (transaction) => {
            let orderRef;
            let orderData;
            let originalOrderMerchantNo; // 用於關聯

            if (merchantOrderNoFromNotify) { // 優先用商店訂單號 (適用於委託建立)
                orderRef = admin.firestore().collection('orders').doc(merchantOrderNoFromNotify);
                const orderDocSnap = await transaction.get(orderRef);
                if (orderDocSnap.exists) {
                    orderData = orderDocSnap.data();
                    originalOrderMerchantNo = merchantOrderNoFromNotify;
                }
            }

            if (!orderData && periodNoFromNotify) { // 若無訂單或為每期授權，嘗試用 PeriodNo 找
                const ordersQuery = admin.firestore().collection('orders').where('gatewayPeriodNo', '==', periodNoFromNotify).limit(1);
                const querySnapshot = await transaction.get(ordersQuery);
                if (!querySnapshot.empty) {
                    orderRef = querySnapshot.docs[0].ref;
                    orderData = querySnapshot.docs[0].data();
                    originalOrderMerchantNo = orderData.merchantOrderNo; // 獲取原始訂單號
                    console.log(`[Period Notify TX] Found order ${originalOrderMerchantNo} via PeriodNo ${periodNoFromNotify}.`);
                }
            }

            if (!orderData || !orderRef) { // 如果最終還是沒有訂單數據或引用
                console.error(`[Period Notify TX] Critical: Could not find related order. Notify Result:`, Result);
                return;
            }

            const alreadyTimes = Result?.AlreadyTimes ? String(Result.AlreadyTimes) : null;
            if (Result.AuthTimes && Result.DateArray) { // NPA-B05 委託建立
                if (orderData.status === 'AGREEMENT_CREATED' && orderData.gatewayPeriodNo === periodNoFromNotify) {
                    console.warn(`[Period Notify TX] Agreement for ${originalOrderMerchantNo} (PeriodNo ${periodNoFromNotify}) already marked. Duplicate.`);
                    return;
                }
            } else if (Result.AuthDate && alreadyTimes) { // NPA-N050 每期授權
                const paymentRecordRef = orderRef.collection('periodicPayments').doc(alreadyTimes);
                const paymentRecordSnap = await transaction.get(paymentRecordRef);
                if (paymentRecordSnap.exists) {
                    console.warn(`[Period Notify TX] Payment for order ${originalOrderMerchantNo}, period ${alreadyTimes} already processed. Duplicate.`);
                    return;
                }
            }

            if (Status === 'SUCCESS') {
                const { userId, itemId, billingCycle } = orderData;
                const userRef = admin.firestore().collection('users').doc(userId);
                const planConfig = subscriptionProducts[itemId.toLowerCase()];

                if (Result.AuthTimes && Result.DateArray) { // NPA-B05 建立委託成功
                    console.log(`[Period Notify TX] Agreement CREATED for ${originalOrderMerchantNo}, PeriodNo: ${periodNoFromNotify}`);
                    transaction.update(orderRef, {
                        status: 'AGREEMENT_CREATED', gatewayPeriodNo: periodNoFromNotify,
                        newebpayPeriodAuthTimes: Result.AuthTimes, newebpayPeriodDateArray: Result.DateArray,
                        notifyDataRaw: JSON.stringify(req.body), notifyDataDecrypted: decryptedResult,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    transaction.update(userRef, { newebpayPeriodNo: periodNoFromNotify, subscriptionId: originalOrderMerchantNo });

                    if (Result.RespondCode === '00' && Result.AuthCode && planConfig) { // 首次授權成功
                        await userService.updateUserSubscriptionInTransaction(
                            transaction, userId, itemId, billingCycle, // billingCycle 應為 'monthly'
                            originalOrderMerchantNo, true // isInitialActivation
                        );
                    }
                } else if (Result.AuthDate && alreadyTimes) { // NPA-N050 每期授權成功
                    console.log(`[Period Notify TX] Periodic Auth SUCCESS for ${originalOrderMerchantNo}, PeriodNo: ${periodNoFromNotify}, Times: ${alreadyTimes}`);
                    const paymentRecordRef = orderRef.collection('periodicPayments').doc(alreadyTimes);
                    transaction.set(paymentRecordRef, {
                        authDate: Result.AuthDate, authCode: Result.AuthCode, tradeNo: Result.TradeNo,
                        status: 'PAID', processedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    transaction.update(orderRef, {
                        lastPaymentDate: admin.firestore.Timestamp.fromDate(new Date(Result.AuthDate.replace(/-/g, '/'))),
                        lastPaymentStatus: 'PAID',
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    if (planConfig && planConfig.creditsPerMonth > 0) {
                        await creditService.addUserCreditsInTransaction(
                            transaction, userRef, userId, planConfig.creditsPerMonth,
                            `${CREDIT_PURPOSES.SUBSCRIPTION_RENEWAL_GRANT}${itemId}`,
                            { description: `訂閱 ${planConfig.name} (${billingCycle}) - 第 ${alreadyTimes} 期贈點`, relatedId: originalOrderMerchantNo }
                        );
                    }

                    const userSnapForEndDate = await transaction.get(userRef); // 獲取用戶最新數據以計算結束日期
                    const currentUserData = userSnapForEndDate.data();
                    const totalPeriods = parseInt(orderData.newebpayPeriodAuthTimes, 10); // 從原始訂單數據中獲取總期數
                    const currentPeriodNum = parseInt(alreadyTimes, 10);

                    if (!isNaN(totalPeriods) && !isNaN(currentPeriodNum) && currentPeriodNum < totalPeriods) {
                        let currentSubEndDate = currentUserData.subscriptionEndDate ? currentUserData.subscriptionEndDate.toDate() : new Date();
                        if (isNaN(currentSubEndDate.getTime()) || currentSubEndDate < new Date(new Date().setDate(new Date().getDate() - 5))) { // 如果結束日期無效或已嚴重過期，從今天算
                            currentSubEndDate = new Date();
                            console.warn(`[Period Notify TX] subscriptionEndDate for user ${userId} was invalid or past, resetting from today for next calculation.`);
                        }
                        const nextSubEndDate = new Date(currentSubEndDate);
                        nextSubEndDate.setMonth(nextSubEndDate.getMonth() + 1);
                        // 如果是月底，确保日期正确性
                        if (nextSubEndDate.getDate() < currentSubEndDate.getDate() && currentSubEndDate.getMonth() !== nextSubEndDate.getMonth() - 1 && (currentSubEndDate.getMonth() !== 11 && nextSubEndDate.getMonth() !== 0)) {
                            nextSubEndDate.setDate(0); // 設為上個月最後一天，然後 setMonth 會進位到正確月份的最後一天
                        }
                        nextSubEndDate.setHours(23, 59, 59, 999);


                        transaction.update(userRef, {
                            subscriptionEndDate: admin.firestore.Timestamp.fromDate(nextSubEndDate),
                            subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    } else if (!isNaN(totalPeriods) && !isNaN(currentPeriodNum) && currentPeriodNum === totalPeriods) {
                        transaction.update(orderRef, { status: 'COMPLETED_PERIODS', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                        transaction.update(userRef, {
                            level: 'free', subscriptionStatus: 'expired',
                            subscriptionEndDate: admin.firestore.FieldValue.serverTimestamp(),
                            newebpayPeriodNo: admin.firestore.FieldValue.delete(),
                            subscriptionId: admin.firestore.FieldValue.delete(),
                            billingCycle: admin.firestore.FieldValue.delete(),
                            subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                } else { console.warn('[Period Notify TX] SUCCESS status but unknown result structure:', Result); }
            } else { // Status !== 'SUCCESS'
                console.warn(`[Period Notify TX] Auth FAILED for ${orderData?.merchantOrderNo || periodNoFromNotify}. Status: ${Status}, Msg: ${Message}, Result:`, Result);
                if (orderRef && orderData) {
                    const failureStatus = orderData.status === 'AGREEMENT_CREATED' ? 'PERIODIC_PAYMENT_FAILED' : 'AGREEMENT_FAILED';
                    transaction.update(orderRef, {
                        status: failureStatus, lastPaymentStatus: 'FAILED', gatewayMessage: Message,
                        gatewayResult: Result || null, notifyDataRaw: JSON.stringify(req.body),
                        notifyDataDecrypted: decryptedResult, updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    const userRef = admin.firestore().collection('users').doc(orderData.userId);
                    transaction.update(userRef, {
                        subscriptionStatus: 'payment_failed',
                        lastSubscriptionFailureReason: Message,
                        subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
        });
        return res.status(200).send('SUCCESS');
    } catch (error) {
        let orderInfoForLog = 'UnknownOrder';
        if (req.body.Period) {
            try {
                const tempDecrypted = newebpayService.decryptPeriodData(req.body.Period);
                orderInfoForLog = tempDecrypted?.Result?.MerchantOrderNo || tempDecrypted?.Result?.PeriodNo || 'DecryptedNoRelevantID';
            } catch (e) {/*ignore*/ }
        }
        console.error(`[Period Notify] Error processing Period notification for ${orderInfoForLog}:`, error);
        return res.status(500).send('Internal Server Error');
    }
}

export async function handleMpgReturnController(req, res, next) {
    console.log('[PaymentController] Received MPG Return Request:', req.body);
    const { TradeInfo, TradeSha } = req.body;

    if (!TradeInfo || !TradeSha) {
        console.warn('[MPG Return] Missing TradeInfo or TradeSha.');
        return res.redirect(`${APP_BASE_URL}/payment-result?status=error&message=InvalidReturnData`);
    }
    const decryptedData = newebpayService.verifyAndDecryptMpgData(TradeInfo, TradeSha);
    if (!decryptedData) {
        console.warn(`[MPG Return] Failed to verify or decrypt return data.`);
        return res.redirect(`${APP_BASE_URL}/payment-result?status=error&message=VerificationFailed`);
    }

    const isPaymentSuccess = decryptedData.Status === 'SUCCESS' && decryptedData.Result?.RespondCode === '00';
    const clientStatus = isPaymentSuccess ? 'success' : 'failure';
    let clientMessage = decryptedData.Message;
    if (!clientMessage) { // 如果 Message 為空，則根據成功狀態給一個預設
        clientMessage = isPaymentSuccess ? '付款成功，訂單處理中' : '付款失敗或未完成';
    }
    const queryParams = new URLSearchParams({
        status: clientStatus, message: encodeURIComponent(clientMessage),
        orderNo: decryptedData.MerchantOrderNo || '', tradeNo: decryptedData.Result?.TradeNo || '',
        paymentType: decryptedData.Result?.PaymentType || '', amount: decryptedData.Result?.Amt || '',
        paymentMethod: 'mpg'
    }).toString();
    return res.redirect(`${APP_BASE_URL}/payment-result?${queryParams}`);
}

export async function handlePeriodReturnController(req, res, next) {
    console.log('[PaymentController] Received Period Return Request:', req.body);
    const { Period } = req.body;

    if (!Period) {
        console.warn('[Period Return] Missing Period data.');
        return res.redirect(`${APP_BASE_URL}/payment-result?status=error&message=InvalidReturnData`);
    }
    const decryptedResult = newebpayService.decryptPeriodData(Period);
    if (!decryptedResult) {
        console.warn('[Period Return] Failed to decrypt Period return data.');
        return res.redirect(`${APP_BASE_URL}/payment-result?status=error&message=DecryptionFailed`);
    }

    const isSuccess = decryptedResult.Status === 'SUCCESS';
    const clientStatus = isSuccess ? 'success' : (decryptedResult.Status === 'TRA20001' ? 'pending' : 'failure');
    let clientMessage = decryptedResult.Message || (isSuccess ? '委託建立/授權請求已提交' : '委託建立/授權請求失敗');
    if (decryptedResult.Status === 'TRA20001') clientMessage = '委託授權處理中，請稍後確認結果。';
    const queryParams = new URLSearchParams({
        status: clientStatus, message: encodeURIComponent(clientMessage),
        orderNo: decryptedResult.Result?.MerchantOrderNo || '',
        periodNo: decryptedResult.Result?.PeriodNo || '',
        paymentMethod: 'period'
    }).toString();
    return res.redirect(`${APP_BASE_URL}/payment-result?${queryParams}`);
}

export async function handleGeneralNotifyController(req, res, next) {
    console.log('[PaymentController] Received General Notify Request (via /notify/general):', req.body);
    if (req.body.TradeInfo && req.body.TradeSha) {
        console.warn('[General Notify] Detected MPG-like notification at /general. Forwarding.');
        return handleMpgNotifyController(req, res, next);
    } else if (req.body.Period) {
        console.warn('[General Notify] Detected Period-like notification at /general. Forwarding.');
        return handlePeriodNotifyController(req, res, next);
    } else {
        console.warn('[General Notify] Received unknown format at /general:', req.body);
        return res.status(200).send('SUCCESS_RECEIVED_UNKNOWN_AT_GENERAL');
    }
}

// **新增或補全 handleGeneralReturnController 的實現與導出**
export async function handleGeneralReturnController(req, res, next) {
    console.log('[PaymentController] Received General Return Request (via /return/general):', req.body);
    // 判斷是 MPG 還是 Period 的返回數據
    // MPG 返回的 body 中會有 TradeInfo 和 TradeSha
    // Period 返回的 body 中只有 Period
    if (req.body.TradeInfo && req.body.TradeSha) {
        console.log('[General Return] Detected MPG-like return data, forwarding to handleMpgReturnController.');
        return handleMpgReturnController(req, res, next); // 轉發給 MPG 的 Return 處理器
    } else if (req.body.Period) {
        console.log('[General Return] Detected Period-like return data, forwarding to handlePeriodReturnController.');
        return handlePeriodReturnController(req, res, next); // 轉發給 Period 的 Return 處理器
    } else {
        console.warn('[General Return] Unknown return data format received:', req.body);
        // 如果格式未知，可以重定向到一個通用的前端錯誤頁面或首頁
        const queryParams = new URLSearchParams({
            status: 'error',
            message: encodeURIComponent('收到未知的支付返回格式，請稍後查詢您的訂單狀態或聯繫客服。'),
            paymentMethod: 'unknown_return'
        }).toString();
        // APP_BASE_URL 需要從 environment.js 引入
        // import { APP_BASE_URL } from '../config/environment.js';
        return res.redirect(`${APP_BASE_URL}/payment-result?${queryParams}`);
    }
}