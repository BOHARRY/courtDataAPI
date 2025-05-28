// controllers/paymentController.js
import * as newebpayService from '../services/newebpayService.js';
import * as orderService from '../services/orderService.js';
import * as userService from '../services/user.js';
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
    let nextBillingDate = null; // 主要用於 orderSummary
    let trialInfo = null; // 主要用於 orderSummary

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
            originalAmount = amount; // 訂閱方案原價即售價 (除非未來有針對訂閱本身的折扣)
            itemDescription = `訂閱 LawSowl ${planConfig.name} (${pricingDetails.displayText})`;

            if (amount < 0) {
                return res.status(400).json({ error: '訂閱方案價格配置錯誤 (金額小於0)。' });
            }
            if (planConfig.id === 'free') { // 免費方案價格應為0
                 if(amount !== 0) console.warn(`[Checkout] Free plan ${planConfig.id} has non-zero price ${amount} in request.`);
                 return res.status(400).json({ error: '免費方案無需支付流程。' });
            }
             if (amount === 0 && planConfig.id !== 'free') { // 非免費方案但價格為0，通常不允許
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
                    finalPeriodApiParams.PeriodFirstdate = periodFirstDate; // YYYY/MM/DD
                    nextBillingDate = new Date(periodFirstDate.replace(/\//g, '-')); // 假設首期在此日
                    // 嚴格來說，下次是 PeriodFirstdate 的下一個週期點
                } else if (finalPeriodApiParams.PeriodStartType === '2') { // 立即執行首期
                    nextBillingDate = new Date(now.getFullYear(), now.getMonth() + 1, parseInt(finalPeriodApiParams.PeriodPoint, 10));
                     if (now.getDate() >= parseInt(finalPeriodApiParams.PeriodPoint, 10)) { // 如果當前日期已過本月扣款點，則下次是再下個月
                        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
                    }
                } else if (finalPeriodApiParams.PeriodStartType === '1' && finalPeriodApiParams.PeriodAmt === 10) { // 10元驗證
                     trialInfo = { type: 'verification', verificationAmount: 10, message: '將先進行NT$10元信用卡驗證，驗證成功後開始訂閱。' };
                     // 下次扣款日在驗證成功後，由 NotifyURL 更新用戶訂閱時計算
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
        // 確保 PeriodStartType=1 時 PeriodAmt 為 10
        if (usePeriodApi && finalPeriodApiParams?.PeriodStartType === '1' && finalPeriodApiParams?.PeriodAmt !== 10) {
            console.warn(`[Checkout] PeriodStartType is 1 (verification) but PeriodAmt is not 10. Received: ${finalPeriodApiParams?.PeriodAmt}. Forcing to 10.`);
            finalPeriodApiParams.PeriodAmt = 10; // 強制設為10元
            if(amount !== 0) console.warn(`[Checkout] Product amount was ${amount}, but verification payment will be 10 TWD.`);
            // 注意：這裡的 amount 是商品價格，PeriodAmt 是實際支付金額。
            // 如果商品是0元試用，amount=0, PeriodAmt=10。
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
                finalPrice: usePeriodApi && finalPeriodApiParams?.PeriodStartType === '1' ? 10 : amount, // 驗證時顯示10元
                billingCycle: billingCycle || 'one-time',
                nextBillingDate: nextBillingDate ? nextBillingDate.toISOString().split('T')[0] : null, // YYYY-MM-DD
                currency: 'TWD', payerEmail: payerEmail, trialInfo: trialInfo
            }
        };

        if (usePeriodApi) {
            const periodParams = {
                RespondType: 'JSON', TimeStamp: timeStamp, Version: '1.5',
                MerOrderNo: merchantOrderNo, ProdDesc: itemDescription, PayerEmail: payerEmail,
                PaymentInfo: 'Y', OrderInfo: 'N',
                ReturnURL: `${APP_BASE_URL}${returnPathPrefix}/period`,
                NotifyURL: `${baseBackendUrl}${notifyPathPrefix}/period`,
                ...finalPeriodApiParams
            };
            const newebpayArgs = newebpayService.preparePeriodCreateArgs(periodParams);
            // --- DEBUG LOG ---
            console.log(`[DEBUG Checkout - Period] MerchantID being sent to NewebPay (should be in postData but for form it's MerchantID_): ${NEWEBPAY_MERCHANT_ID}`);
            console.log(`[DEBUG Checkout - Period] Full periodParams before encryption: `, periodParams);
            console.log(`[DEBUG Checkout - Period] Encrypted PostData_ to be sent to frontend: ${newebpayArgs.PostData_}`);
            // --- END DEBUG LOG ---
            res.status(200).json({
                ...baseResponse, paymentMethod: 'Period',
                paymentGatewayUrl: NEWEBPAY_PERIOD_URL,
                newebpayMerchantID: NEWEBPAY_MERCHANT_ID, // 前端 submitToNewebpay 會用此值和 MerchantID_ key
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
                MerchantID: NEWEBPAY_MERCHANT_ID,
                RespondType: 'JSON', TimeStamp: timeStamp, Version: '2.2',
                MerchantOrderNo: merchantOrderNo, Amt: amount, ItemDesc: itemDescription,
                Email: payerEmail, LoginType: 0,
                ReturnURL: `${APP_BASE_URL}${returnPathPrefix}/mpg`,
                NotifyURL: `${baseBackendUrl}${notifyPathPrefix}/mpg`,
                ClientBackURL: `${APP_BASE_URL}/payment-cancel`, CREDIT: 1,
            };
            const newebpayArgs = newebpayService.prepareMpgTradeArgs(mpgParams, NEWEBPAY_MERCHANT_ID);
             // --- DEBUG LOG ---
            console.log(`[DEBUG Checkout - MPG] MerchantID to be sent to frontend (for form field 'MerchantID'): ${newebpayArgs.MerchantID}`);
            console.log(`[DEBUG Checkout - MPG] Full mpgParams before encryption (inside TradeInfo): `, mpgParams);
            console.log(`[DEBUG Checkout - MPG] Encrypted TradeInfo to be sent to frontend: ${newebpayArgs.TradeInfo}`);
            console.log(`[DEBUG Checkout - MPG] TradeSha to be sent to frontend: ${newebpayArgs.TradeSha}`);
            // --- END DEBUG LOG ---
            res.status(200).json({
                ...baseResponse, paymentMethod: 'MPG',
                paymentGatewayUrl: NEWEBPAY_MPG_URL,
                merchantID: newebpayArgs.MerchantID, // MPG 直接用 merchantID
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

// handleMpgNotifyController - 修正調用 userService
export async function handleMpgNotifyController(req, res, next) {
    // ... (日誌和初步檢查不變)
    console.log('[PaymentController] Received MPG Notify Request:', req.body);
    const { TradeInfo, TradeSha, MerchantID } = req.body;

    if (!TradeInfo || !TradeSha) { return res.status(400).send('Invalid MPG notification: Missing parameters.'); }
    if (MerchantID !== NEWEBPAY_MERCHANT_ID) { return res.status(400).send('Invalid MPG notification: MerchantID mismatch.'); }

    try {
        const decryptedData = newebpayService.verifyAndDecryptMpgData(TradeInfo, TradeSha);
        if (!decryptedData) { return res.status(400).send('MPG notification verification/decryption failed.');}

        const merchantOrderNo = decryptedData.MerchantOrderNo;
        console.log(`[MPG Notify] Decrypted Data for ${merchantOrderNo}:`, decryptedData);

        await admin.firestore().runTransaction(async (transaction) => {
            const currentOrderDocRef = admin.firestore().collection('orders').doc(merchantOrderNo);
            const currentOrderSnap = await transaction.get(currentOrderDocRef);

            if (!currentOrderSnap.exists) { console.warn(`[MPG Notify TX] Order ${merchantOrderNo} not found.`); return; }
            const currentOrderData = currentOrderSnap.data();
            if (currentOrderData.status !== 'PENDING_PAYMENT') { console.warn(`[MPG Notify TX] Order ${merchantOrderNo} status not PENDING_PAYMENT: ${currentOrderData.status}.`); return; }

            const isPaymentSuccess = decryptedData.Status === 'SUCCESS' && decryptedData.Result?.TradeStatus === '1';
            if (isPaymentSuccess) {
                transaction.update(currentOrderDocRef, { /* ... (更新訂單狀態為 PAID) ... */
                    status: 'PAID',
                    gatewayTradeNo: decryptedData.Result?.TradeNo,
                    paymentType: decryptedData.Result?.PaymentType,
                    payTime: decryptedData.Result?.PayTime ? admin.firestore.Timestamp.fromDate(new Date(decryptedData.Result.PayTime.replace(/\//g, '-'))) : admin.firestore.FieldValue.serverTimestamp(),
                    notifyDataRaw: JSON.stringify(req.body),
                    notifyDataDecrypted: decryptedData,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                const { userId, itemId, itemType, billingCycle } = currentOrderData;
                const userRef = admin.firestore().collection('users').doc(userId);

                if (itemType === 'package') {
                    // ... (積分包邏輯不變)
                    const pkg = commerceConfig.creditPackages.find(p => p.id === itemId);
                    if (pkg) {
                        await creditService.addUserCreditsInTransaction(
                            transaction, userRef, userId, pkg.credits,
                            `${CREDIT_PURPOSES.PURCHASE_CREDITS_PKG_PREFIX}${itemId}`,
                            { description: `購買 ${pkg.credits} 點積分包 (${itemId})`, relatedId: merchantOrderNo }
                        );
                    }
                } else if (itemType === 'plan') { // MPG 支付的年付訂閱
                    await userService.updateUserSubscriptionInTransaction( // **調用已修正的 TX 版本**
                        transaction, userId, itemId, billingCycle, // billingCycle 應為 'annually'
                        merchantOrderNo, true
                    );
                    console.log(`[MPG Notify TX] Updated user ${userId} subscription to ${itemId} (${billingCycle}).`);
                }
            } else { // 支付失敗
                transaction.update(currentOrderDocRef, { /* ... (更新訂單狀態為 FAILED) ... */
                    status: 'FAILED',
                    gatewayMessage: decryptedData.Message,
                    gatewayResult: decryptedData.Result || null,
                    notifyDataRaw: JSON.stringify(req.body),
                    notifyDataDecrypted: decryptedData,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        });
        return res.status(200).send('SUCCESS');
    } catch (error) { /* ... (錯誤處理) ... */
        console.error(`[MPG Notify] Error processing MPG notification for MerchantOrderNo ${req.body.MerchantOrderNo || 'Unknown'}:`, error);
        return res.status(500).send('Internal Server Error');
    }
}

// handlePeriodNotifyController - 修正調用 userService 和 subscriptionEndDate 更新
export async function handlePeriodNotifyController(req, res, next) {
    // ... (日誌和初步檢查不變)
    console.log('[PaymentController] Received Period Notify Request:', req.body);
    const { Period, MerchantID_ } = req.body;

    if (!Period) { return res.status(400).send('Invalid Period notification: Missing Period data.');}
    if (MerchantID_ !== NEWEBPAY_MERCHANT_ID) { return res.status(400).send('Invalid Period notification: MerchantID mismatch.');}

    try {
        const decryptedResult = newebpayService.decryptPeriodData(Period);
        if (!decryptedResult) { return res.status(400).send('Period notification decryption failed.');}

        console.log('[Period Notify] Decrypted Result:', decryptedResult);
        const { Status, Message, Result } = decryptedResult;
        const merchantOrderNoFromNotify = Result?.MerchantOrderNo;
        const periodNoFromNotify = Result?.PeriodNo;

        await admin.firestore().runTransaction(async (transaction) => {
            let orderRef;
            let orderData;

            if (merchantOrderNoFromNotify) {
                orderRef = admin.firestore().collection('orders').doc(merchantOrderNoFromNotify);
                const orderDocSnap = await transaction.get(orderRef);
                if (orderDocSnap.exists) orderData = orderDocSnap.data();
            }
            if (!orderData && periodNoFromNotify) {
                const ordersQuery = admin.firestore().collection('orders').where('gatewayPeriodNo', '==', periodNoFromNotify).limit(1);
                const querySnapshot = await transaction.get(ordersQuery);
                if (!querySnapshot.empty) {
                    orderRef = querySnapshot.docs[0].ref;
                    orderData = querySnapshot.docs[0].data();
                }
            }
            if (!orderData) { console.error(`[Period Notify TX] Critical: Could not find related order. Result:`, Result); return; }

            const alreadyTimes = Result?.AlreadyTimes ? String(Result.AlreadyTimes) : null;
            if (Result.AuthTimes && Result.DateArray) { // NPA-B05
                if (orderData.status === 'AGREEMENT_CREATED' && orderData.gatewayPeriodNo === periodNoFromNotify) { return; }
            } else if (Result.AuthDate && alreadyTimes) { // NPA-N050
                const paymentRecordRef = orderRef.collection('periodicPayments').doc(alreadyTimes);
                const paymentRecordSnap = await transaction.get(paymentRecordRef);
                if (paymentRecordSnap.exists) { return; }
            }

            if (Status === 'SUCCESS') {
                const { userId, itemId, billingCycle, merchantOrderNo: originalMerchantOrderNo } = orderData;
                const userRef = admin.firestore().collection('users').doc(userId);
                const planConfig = subscriptionProducts[itemId.toLowerCase()];

                if (Result.AuthTimes && Result.DateArray) { // NPA-B05 建立委託成功
                    transaction.update(orderRef, { /* ... (更新訂單為 AGREEMENT_CREATED) ... */
                        status: 'AGREEMENT_CREATED',
                        gatewayPeriodNo: periodNoFromNotify,
                        newebpayPeriodAuthTimes: Result.AuthTimes,
                        newebpayPeriodDateArray: Result.DateArray,
                        notifyDataRaw: JSON.stringify(req.body),
                        notifyDataDecrypted: decryptedResult,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    transaction.update(userRef, { newebpayPeriodNo: periodNoFromNotify, subscriptionId: originalMerchantOrderNo });

                    if (Result.RespondCode === '00' && Result.AuthCode && planConfig) { // 首次授權成功
                        await userService.updateUserSubscriptionInTransaction( // **調用已修正的 TX 版本**
                            transaction, userId, itemId, billingCycle, // billingCycle 應為 'monthly'
                            originalMerchantOrderNo, true
                        );
                    }
                } else if (Result.AuthDate && alreadyTimes) { // NPA-N050 每期授權成功
                    const paymentRecordRef = orderRef.collection('periodicPayments').doc(alreadyTimes);
                    transaction.set(paymentRecordRef, { /* ... (記錄此期付款) ... */
                        authDate: Result.AuthDate, authCode: Result.AuthCode, tradeNo: Result.TradeNo,
                        status: 'PAID', processedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    transaction.update(orderRef, { /* ... (更新主訂單 lastPaymentDate) ... */
                        lastPaymentDate: admin.firestore.Timestamp.fromDate(new Date(Result.AuthDate.replace(/-/g, '/'))),
                        lastPaymentStatus: 'PAID',
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    if (planConfig && planConfig.creditsPerMonth > 0) { /* ... (授予點數) ... */
                        await creditService.addUserCreditsInTransaction(
                            transaction, userRef, userId, planConfig.creditsPerMonth,
                            `${CREDIT_PURPOSES.SUBSCRIPTION_RENEWAL_GRANT}${itemId}`,
                            { description: `訂閱 ${planConfig.name} (${billingCycle}) - 第 ${alreadyTimes} 期贈點`, relatedId: originalMerchantOrderNo }
                        );
                    }

                    // **更新用戶的 subscriptionEndDate**
                    const userSnapForEndDate = await transaction.get(userRef);
                    const currentUserData = userSnapForEndDate.data();
                    // 確保 orderData.newebpayPeriodAuthTimes 存在且是數字
                    const totalPeriods = parseInt(orderData.newebpayPeriodAuthTimes, 10);
                    const currentPeriodNum = parseInt(alreadyTimes, 10);

                    if (!isNaN(totalPeriods) && !isNaN(currentPeriodNum) && currentPeriodNum < totalPeriods) {
                        // 只有在不是最後一期時才延長
                        let currentSubEndDate = currentUserData.subscriptionEndDate ? currentUserData.subscriptionEndDate.toDate() : new Date();
                        // 如果 currentSubEndDate 無效 (例如首次同步問題)，則從當前時間開始計算
                        if (isNaN(currentSubEndDate.getTime())) currentSubEndDate = new Date();

                        const nextSubEndDate = new Date(currentSubEndDate);
                        nextSubEndDate.setMonth(nextSubEndDate.getMonth() + 1);
                        // 如果下個結束日在今天或之前 (表示之前的結束日已過期)，則從今天加一個月
                        if (nextSubEndDate <= new Date()){
                            const today = new Date();
                            nextSubEndDate.setFullYear(today.getFullYear(), today.getMonth() + 1, today.getDate() -1);
                            nextSubEndDate.setHours(23,59,59,999);
                        }

                        transaction.update(userRef, {
                            subscriptionEndDate: admin.firestore.Timestamp.fromDate(nextSubEndDate),
                            subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`[Period Notify TX] User ${userId} subscriptionEndDate extended to ${nextSubEndDate.toISOString()}`);
                    } else if (!isNaN(totalPeriods) && !isNaN(currentPeriodNum) && currentPeriodNum === totalPeriods) {
                        console.log(`[Period Notify TX] User ${userId} subscription for ${originalMerchantOrderNo} reached final period (${alreadyTimes}/${totalPeriods}).`);
                        transaction.update(orderRef, { status: 'COMPLETED_PERIODS', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                        // 可選：更新 user doc 中的訂閱狀態為已結束或待續約
                         transaction.update(userRef, {
                            level: 'free', // 或其他到期後的預設等級
                            subscriptionStatus: 'expired', // 標記訂閱狀態
                            subscriptionEndDate: admin.firestore.FieldValue.serverTimestamp(), // 記錄實際結束時間
                            newebpayPeriodNo: admin.firestore.FieldValue.delete(), // 清除委託號
                            subscriptionId: admin.firestore.FieldValue.delete(), // 清除訂閱ID
                            billingCycle: admin.firestore.FieldValue.delete(), // 清除週期
                            subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`[Period Notify TX] User ${userId} subscription for ${originalMerchantOrderNo} has ended. Level reverted/status updated.`);
                    }
                } else { 
                    console.warn('[Period Notify TX] SUCCESS status but unknown result structure:', Result);
                 }
            } else { // Status !== 'SUCCESS'
                // ... (處理失敗邏輯，更新訂單和用戶訂閱狀態)
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
    } catch (error) { /* ... (錯誤處理) ... */
        console.error(`[Period Notify] Error processing Period notification for ${req.body.Period?.Result?.MerchantOrderNo || req.body.Period?.Result?.PeriodNo || 'Unknown'}:`, error);
        return res.status(500).send('Internal Server Error');
    }
}

// handleMpgReturnController, handlePeriodReturnController, handleDefaultNotifyController 保持不變
export async function handleMpgReturnController(req, res, next) {
    // ... (之前的 handleMpgReturnController 完整代碼)
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

    const isPaymentSuccess = decryptedData.Status === 'SUCCESS' && decryptedData.Result?.TradeStatus === '1';
    const clientStatus = isPaymentSuccess ? 'success' : 'failure';
    const clientMessage = decryptedData.Message || (isPaymentSuccess ? '付款成功，訂單處理中' : '付款失敗或未完成');

    const queryParams = new URLSearchParams({
        status: clientStatus,
        message: encodeURIComponent(clientMessage),
        orderNo: decryptedData.MerchantOrderNo || '',
        tradeNo: decryptedData.Result?.TradeNo || '',
        paymentType: decryptedData.Result?.PaymentType || '',
        amount: decryptedData.Result?.Amt || '',
        paymentMethod: 'mpg' // 標記來源
    }).toString();

    return res.redirect(`${APP_BASE_URL}/payment-result?${queryParams}`);
}

export async function handlePeriodReturnController(req, res, next) {
    // ... (之前的 handlePeriodReturnController 完整代碼)
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
        status: clientStatus,
        message: encodeURIComponent(clientMessage),
        orderNo: decryptedResult.Result?.MerchantOrderNo || '',
        periodNo: decryptedResult.Result?.PeriodNo || '',
        paymentMethod: 'period'
    }).toString();

    return res.redirect(`${APP_BASE_URL}/payment-result?${queryParams}`);
}

export async function handleDefaultNotifyController(req, res, next) {
    // ... (之前的 handleDefaultNotifyController 完整代碼)
    console.log('[PaymentController] Received Default/Fallback Notify Request:', req.body);
    if (req.body.TradeInfo && req.body.TradeSha) {
        console.warn('[Default Notify] Detected MPG-like notification at default handler. API-specified NotifyURL might be failing. Forwarding for processing attempt.');
        return handleMpgNotifyController(req, res, next);
    } else if (req.body.Period) {
        console.warn('[Default Notify] Detected Period-like notification at default handler. API-specified NotifyURL might be failing. Forwarding for processing attempt.');
        return handlePeriodNotifyController(req, res, next);
    } else {
        console.warn('[Default Notify] Received unknown format notification at default handler:', req.body);
        return res.status(200).send('SUCCESS_RECEIVED_UNKNOWN_AT_DEFAULT');
    }
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