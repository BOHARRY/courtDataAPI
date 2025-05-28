// controllers/paymentController.js
import * as newebpayService from '../services/newebpayService.js';
import * as orderService from '../services/orderService.js';
import * as userService from '../services/user.js';
import * as creditService from '../services/credit.js';
import { subscriptionProducts } from '../config/subscriptionProducts.js'; // 假設您已創建此文件
import { commerceConfig } from '../config/commerceConfig.js';
import { CREDIT_PURPOSES } from '../config/creditCosts.js';
import admin from 'firebase-admin';
import {
    NEWEBPAY_MERCHANT_ID,
    NEWEBPAY_MPG_URL,
    NEWEBPAY_PERIOD_URL,
    APP_BASE_URL,
    BACKEND_API_URL // 確保這個環境變數已定義並指向您的後端 URL
} from '../config/environment.js';

/**
 * 前端發起結帳請求的控制器
 */
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
    
    // 新增變數來追蹤價格資訊
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
            const planConfig = subscriptionProducts[itemId.toLowerCase()];
            if (!planConfig || !planConfig.pricing || !planConfig.pricing[billingCycle.toLowerCase()]) {
                return res.status(400).json({ error: `Invalid plan ID or billing cycle: ${itemId} - ${billingCycle}` });
            }

            const pricingDetails = planConfig.pricing[billingCycle.toLowerCase()];
            amount = pricingDetails.price;
            originalAmount = amount; // 訂閱方案通常沒有折扣，原價等於實際價格
            itemDescription = `訂閱 LawSowl ${planConfig.name} (${pricingDetails.displayText})`;

            if (amount < 0) {
                return res.status(400).json({ error: '訂閱方案價格配置錯誤 (金額小於0)。' });
            }
            if (amount === 0 && planConfig.id === 'free') {
                return res.status(400).json({ error: '免費方案無需支付流程。' });
            }

            // 計算下次扣款日期
            const now = new Date();
            if (billingCycle.toLowerCase() === 'monthly' && amount > 0) {
                usePeriodApi = true;
                const periodConfig = pricingDetails.newebpayPeriodParams || {};
                finalPeriodApiParams = {
                    PeriodAmt: amount,
                    PeriodType: periodConfig.PeriodType || 'M',
                    PeriodPoint: periodPoint || periodConfig.DefaultPeriodPoint || '01',
                    PeriodStartType: periodStartType || periodConfig.DefaultPeriodStartType || '2',
                    PeriodTimes: reqPeriodTimes || periodConfig.PeriodTimes || '12',
                };
                
                // 計算月付的下次扣款日期
                if (finalPeriodApiParams.PeriodStartType === '3' && periodFirstDate) {
                    finalPeriodApiParams.PeriodFirstdate = periodFirstDate;
                    nextBillingDate = new Date(periodFirstDate.replace(/\//g, '-'));
                } else if (finalPeriodApiParams.PeriodStartType === '2') {
                    // 立即執行，下次扣款是下個月
                    nextBillingDate = new Date(now.getFullYear(), now.getMonth() + 1, parseInt(finalPeriodApiParams.PeriodPoint));
                } else if (finalPeriodApiParams.PeriodStartType === '1') {
                    // 10元驗證，驗證成功後才開始計費
                    nextBillingDate = null; // 待驗證完成後確定
                    trialInfo = {
                        type: 'verification',
                        verificationAmount: 10,
                        message: '將先進行NT$10元信用卡驗證，驗證成功後開始訂閱'
                    };
                }
            } else if (billingCycle.toLowerCase() === 'annually' && amount > 0) {
                usePeriodApi = false;
                // 年付的下次續訂日期是一年後
                nextBillingDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
            }

        } else if (itemType === 'package') {
            const pkg = commerceConfig.creditPackages.find(p => p.id === itemId);
            if (!pkg) {
                return res.status(400).json({ error: `Invalid package ID: ${itemId}` });
            }
            
            originalAmount = pkg.price;
            amount = pkg.price;
            itemDescription = `購買 LawSowl ${pkg.credits} 點積分包`;
            usePeriodApi = false;

            // 檢查是否有折扣
            const discountInfo = commerceConfig.planSpecificDiscounts[userLevel.toLowerCase()];
            if (discountInfo && pkg.discountApplies && pkg.credits >= discountInfo.threshold) {
                amount = Math.round(amount * discountInfo.discountRate);
                discountAmount = originalAmount - amount;
                discountPercentage = Math.round((1 - discountInfo.discountRate) * 100);
                itemDescription += ` (享${discountInfo.name} ${Math.round(discountInfo.discountRate * 10)}折優惠)`;
                console.log(`[Checkout] User ${userId} (Level: ${userLevel}) applied discount for package ${itemId}. Original: ${pkg.price}, Discounted: ${amount}`);
            }
        } else {
            return res.status(400).json({ error: 'Invalid itemType. Must be "plan" or "package".' });
        }

        if (typeof amount !== 'number' || amount < 0) {
            return res.status(400).json({ error: 'Calculated amount is invalid.' });
        }

        const merchantOrderNo = await orderService.createOrder(userId, itemId, itemType, amount, itemDescription, billingCycle);
        const timeStamp = Math.floor(Date.now() / 1000);
        const payerEmail = userData.email || req.user.email || '';

        const baseBackendUrl = BACKEND_API_URL || APP_BASE_URL;
        const notifyPathPrefix = '/api/payment/notify';
        const returnPathPrefix = '/payment-result';

        // 組裝基本回應資料
        const baseResponse = {
            paymentMethod: usePeriodApi ? 'Period' : 'MPG',
            merchantOrderNo: merchantOrderNo,
            orderSummary: {
                itemId: itemId,
                itemType: itemType,
                itemName: itemDescription,
                originalPrice: originalAmount,
                discount: discountAmount,
                discountPercentage: discountPercentage,
                finalPrice: amount,
                billingCycle: billingCycle || 'one-time',
                nextBillingDate: nextBillingDate ? nextBillingDate.toISOString() : null,
                currency: 'TWD',
                payerEmail: payerEmail,
                trialInfo: trialInfo
            }
        };

        if (usePeriodApi) {
            // 月付訂閱：使用藍新信用卡定期定額 API
            const periodParams = {
                RespondType: 'JSON',
                TimeStamp: timeStamp,
                Version: '1.5',
                MerOrderNo: merchantOrderNo,
                ProdDesc: itemDescription,
                PayerEmail: payerEmail,
                PaymentInfo: 'Y',
                OrderInfo: 'N',
                ReturnURL: `${APP_BASE_URL}${returnPathPrefix}/period`,
                NotifyURL: `${baseBackendUrl}${notifyPathPrefix}/period`,
                ...finalPeriodApiParams
            };

            const newebpayArgs = newebpayService.preparePeriodCreateArgs(periodParams);
            console.log(`[Checkout] Preparing Period payment for ${merchantOrderNo}:`, periodParams);
            
            res.status(200).json({
                ...baseResponse,
                paymentGatewayUrl: NEWEBPAY_PERIOD_URL,
                merchantID: NEWEBPAY_MERCHANT_ID,
                postData: newebpayArgs.PostData_,
                periodDetails: {
                    periodType: finalPeriodApiParams.PeriodType,
                    periodPoint: finalPeriodApiParams.PeriodPoint,
                    periodTimes: finalPeriodApiParams.PeriodTimes,
                    periodStartType: finalPeriodApiParams.PeriodStartType
                }
            });

        } else {
            // 積分包購買或年付訂閱：使用藍新 MPG API
            const mpgParams = {
                RespondType: 'JSON',
                TimeStamp: timeStamp,
                Version: '2.2',
                MerchantOrderNo: merchantOrderNo,
                Amt: amount,
                ItemDesc: itemDescription,
                Email: payerEmail,
                LoginType: 0,
                ReturnURL: `${APP_BASE_URL}${returnPathPrefix}/mpg`,
                NotifyURL: `${baseBackendUrl}${notifyPathPrefix}/mpg`,
                ClientBackURL: `${APP_BASE_URL}/payment-cancel`,
                CREDIT: 1,
            };

            const newebpayArgs = newebpayService.prepareMpgTradeArgs(mpgParams, NEWEBPAY_MERCHANT_ID);
            console.log(`[Checkout] Preparing MPG payment for ${merchantOrderNo}:`, mpgParams);
            
            res.status(200).json({
                ...baseResponse,
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


/**
 * 處理藍新 MPG (幕前支付) 的背景通知 (NotifyURL)
 */
export async function handleMpgNotifyController(req, res, next) {
    console.log('[PaymentController] Received MPG Notify Request:', req.body);
    const { TradeInfo, TradeSha, MerchantID } = req.body; // MerchantOrderNo 在 TradeInfo 內

    if (!TradeInfo || !TradeSha) {
        console.error('[MPG Notify] Missing TradeInfo or TradeSha.');
        return res.status(400).send('Invalid MPG notification: Missing parameters.');
    }
    if (MerchantID !== NEWEBPAY_MERCHANT_ID) {
        console.error(`[MPG Notify] MerchantID mismatch. Expected: ${NEWEBPAY_MERCHANT_ID}, Received: ${MerchantID}`);
        return res.status(400).send('Invalid MPG notification: MerchantID mismatch.');
    }

    try {
        const decryptedData = newebpayService.verifyAndDecryptMpgData(TradeInfo, TradeSha);

        if (!decryptedData) {
            console.error(`[MPG Notify] Failed to verify or decrypt data.`);
            return res.status(400).send('MPG notification verification/decryption failed.');
        }

        const merchantOrderNo = decryptedData.MerchantOrderNo;
        console.log(`[MPG Notify] Decrypted Data for ${merchantOrderNo}:`, decryptedData);

        const orderDoc = await orderService.getOrderByMerchantOrderNo(merchantOrderNo);
        if (!orderDoc || !orderDoc.exists) {
            console.warn(`[MPG Notify] Order not found: ${merchantOrderNo}. Ignoring notification or potential issue.`);
            return res.status(200).send('SUCCESS'); // 告知藍新已收到，避免重試，但內部記錄問題
        }

        const orderData = orderDoc.data();
        if (orderData.status === 'PAID' || orderData.status === 'FAILED') { // 已經是終態
            console.warn(`[MPG Notify] Order ${merchantOrderNo} already in final state: ${orderData.status}. Assuming duplicate notification.`);
            return res.status(200).send('SUCCESS');
        }
        if (orderData.status !== 'PENDING_PAYMENT') {
            console.warn(`[MPG Notify] Order ${merchantOrderNo} status is not PENDING_PAYMENT, current: ${orderData.status}. Processing cautiously.`);
            // 可能需要更複雜的邏輯來處理非 PENDING_PAYMENT 狀態的通知
        }


        const isPaymentSuccess = decryptedData.Status === 'SUCCESS' && decryptedData.Result?.TradeStatus === '1';

        // 使用 Firestore Transaction 確保原子性
        await admin.firestore().runTransaction(async (transaction) => {
            const currentOrderDocRef = admin.firestore().collection('orders').doc(merchantOrderNo);
            // 在 transaction 中重新獲取 orderDoc，以獲取最新數據並鎖定文檔
            const currentOrderSnap = await transaction.get(currentOrderDocRef);

            if (!currentOrderSnap.exists) {
                console.warn(`[MPG Notify Transaction] Order ${merchantOrderNo} not found.`);
                // 可能被惡意攻擊或藍新傳送了不存在的訂單號，不拋錯，讓請求成功結束
                return;
            }
            const currentOrderData = currentOrderSnap.data();
            if (currentOrderData.status !== 'PENDING_PAYMENT') {
                console.warn(`[MPG Notify Transaction] Order ${merchantOrderNo} status is not PENDING_PAYMENT: ${currentOrderData.status}. Assuming duplicate.`);
                return;
            }

            const isPaymentSuccess = decryptedData.Status === 'SUCCESS' && decryptedData.Result?.TradeStatus === '1';
            if (isPaymentSuccess) {
                const updatePayload = {
                    status: 'PAID',
                    gatewayTradeNo: decryptedData.Result?.TradeNo,
                    paymentType: decryptedData.Result?.PaymentType,
                    payTime: decryptedData.Result?.PayTime ? admin.firestore.Timestamp.fromDate(new Date(decryptedData.Result.PayTime.replace(/\//g, '-'))) : admin.firestore.FieldValue.serverTimestamp(),
                    notifyDataRaw: JSON.stringify(req.body),
                    notifyDataDecrypted: decryptedData,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };
                transaction.update(currentOrderDocRef, updatePayload);

                const { userId, itemId, itemType, billingCycle } = currentOrderData;
                const userRef = admin.firestore().collection('users').doc(userId);

                if (itemType === 'package') {
                    const pkg = commerceConfig.creditPackages.find(p => p.id === itemId);
                    if (pkg) {
                        await creditService.addUserCreditsInTransaction(
                            transaction, userRef, userId, pkg.credits,
                            `${CREDIT_PURPOSES.PURCHASE_CREDITS_PKG_PREFIX}${itemId}`,
                            { description: `購買 ${pkg.credits} 點積分包 (${itemId})`, relatedId: merchantOrderNo }
                        );
                    }
                } else if (itemType === 'plan') { // MPG 支付的年付訂閱
                    const planConfig = subscriptionProducts[itemId.toLowerCase()];
                    if (planConfig) {
                        // **修正點 1：直接調用 updateUserSubscriptionInTransaction**
                        await userService.updateUserSubscriptionInTransaction(
                            transaction, // 傳入當前 transaction
                            userId,
                            itemId,      // planId
                            billingCycle,// 'annually'
                            merchantOrderNo, // relatedOrderId
                            true         // isInitialActivation
                        );
                        console.log(`[MPG Notify Transaction] Updated user ${userId} subscription to ${itemId} (${billingCycle}) via InTransaction call.`);
                    }
                }
            } else {
                transaction.update(currentOrderDocRef, {
                    status: 'FAILED',
                    gatewayMessage: decryptedData.Message,
                    gatewayResult: decryptedData.Result || null,
                    notifyDataRaw: JSON.stringify(req.body),
                    notifyDataDecrypted: decryptedData,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        }); // End of Firestore Transaction
        return res.status(200).send('SUCCESS');
    } catch (error) {
        console.error(`[MPG Notify] Error processing MPG notification for MerchantOrderNo ${req.body.MerchantOrderNo || (newebpayService.verifyAndDecryptMpgData(TradeInfo, TradeSha))?.MerchantOrderNo || 'Unknown'}:`, error);
        // 不建議直接將 error.message 回傳給藍新
        return res.status(500).send('Internal Server Error'); // 讓藍新重試，或我們手動查日誌
    }
}


/**
 * 處理藍新信用卡定期定額的背景通知 (NotifyURL)
 */
export async function handlePeriodNotifyController(req, res, next) {
    console.log('[PaymentController] Received Period Notify Request:', req.body);
    const { Period, MerchantID_ } = req.body;

    if (!Period) {
        console.error('[Period Notify] Missing Period data.');
        return res.status(400).send('Invalid Period notification: Missing Period data.');
    }
    if (MerchantID_ !== NEWEBPAY_MERCHANT_ID) {
        console.error(`[Period Notify] MerchantID_ mismatch. Expected: ${NEWEBPAY_MERCHANT_ID}, Received: ${MerchantID_}`);
        return res.status(400).send('Invalid Period notification: MerchantID mismatch.');
    }

    try {
        const decryptedResult = newebpayService.decryptPeriodData(Period);
        if (!decryptedResult) {
            console.error('[Period Notify] Failed to decrypt Period data.');
            return res.status(400).send('Period notification decryption failed.');
        }

        console.log('[Period Notify] Decrypted Result:', decryptedResult);
        const { Status, Message, Result } = decryptedResult;
        const merchantOrderNoFromNotify = Result?.MerchantOrderNo;
        const periodNoFromNotify = Result?.PeriodNo;

        // 使用 Firestore Transaction
        await admin.firestore().runTransaction(async (transaction) => {
            let orderRef;
            let orderData;

            if (merchantOrderNoFromNotify) { // 優先用商店訂單號 (適用於委託建立)
                orderRef = admin.firestore().collection('orders').doc(merchantOrderNoFromNotify);
                const orderDocSnap = await transaction.get(orderRef);
                if (orderDocSnap.exists) orderData = orderDocSnap.data();
            }

            if (!orderData && periodNoFromNotify) { // 若無訂單或為每期授權，嘗試用 PeriodNo 找
                const ordersQuery = admin.firestore().collection('orders')
                    .where('gatewayPeriodNo', '==', periodNoFromNotify)
                    .limit(1);
                const querySnapshot = await transaction.get(ordersQuery);
                if (!querySnapshot.empty) {
                    orderRef = querySnapshot.docs[0].ref;
                    orderData = querySnapshot.docs[0].data();
                    console.log(`[Period Notify TX] Found order ${orderData.merchantOrderNo} via PeriodNo ${periodNoFromNotify}.`);
                }
            }

            if (!orderData) {
                console.error(`[Period Notify TX] Critical: Could not find related order. Notify Result:`, Result);
                return; // 跳出 transaction，回應SUCCESS避免重試，但內部記錄問題
            }

            // 冪等性檢查
            const alreadyTimes = Result?.AlreadyTimes ? String(Result.AlreadyTimes) : null;
            if (Result.AuthTimes && Result.DateArray) { // NPA-B05 委託建立
                if (orderData.status === 'AGREEMENT_CREATED' && orderData.gatewayPeriodNo === periodNoFromNotify) {
                    console.warn(`[Period Notify TX] Agreement for ${orderData.merchantOrderNo} (PeriodNo ${periodNoFromNotify}) already marked. Duplicate.`);
                    return;
                }
            } else if (Result.AuthDate && alreadyTimes) { // NPA-N050 每期授權
                const paymentRecordRef = orderRef.collection('periodicPayments').doc(alreadyTimes);
                const paymentRecordSnap = await transaction.get(paymentRecordRef);
                if (paymentRecordSnap.exists) {
                    console.warn(`[Period Notify TX] Payment for order ${orderData.merchantOrderNo}, period ${alreadyTimes} already processed. Duplicate.`);
                    return;
                }
            }

            if (Status === 'SUCCESS') {
                const { userId, itemId, billingCycle, merchantOrderNo: originalMerchantOrderNo } = orderData; // 使用 orderData 中的 merchantOrderNo
                const userRef = admin.firestore().collection('users').doc(userId);
                const planConfig = subscriptionProducts[itemId.toLowerCase()];

                if (Result.AuthTimes && Result.DateArray) { // NPA-B05 建立委託成功
                    console.log(`[Period Notify TX] Agreement CREATED for ${originalMerchantOrderNo}, PeriodNo: ${periodNoFromNotify}`);
                    transaction.update(orderRef, {
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
                        // **修正點 1：直接調用 updateUserSubscriptionInTransaction**
                        await userService.updateUserSubscriptionInTransaction(
                            transaction, userId, itemId, billingCycle,
                            originalMerchantOrderNo, true
                        );
                        console.log(`[Period Notify TX] Initial subscription for ${itemId} (${billingCycle}) activated for user ${userId}.`);
                    }
                } else if (Result.AuthDate && alreadyTimes) { // NPA-N050 每期授權成功
                    console.log(`[Period Notify TX] Periodic Auth SUCCESS for ${originalMerchantOrderNo}, PeriodNo: ${periodNoFromNotify}, Times: ${alreadyTimes}`);
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
                            { description: `訂閱 ${planConfig.name} (${billingCycle}) - 第 ${alreadyTimes} 期贈點`, relatedId: originalMerchantOrderNo }
                        );
                    }

                    // **修正點 2：更新用戶的 subscriptionEndDate**
                    const userSnapForEndDate = await transaction.get(userRef); // 獲取最新的用戶數據
                    const currentUserData = userSnapForEndDate.data();
                    const currentSubEndDate = currentUserData.subscriptionEndDate ? currentUserData.subscriptionEndDate.toDate() : new Date();
                    const nextSubEndDate = new Date(currentSubEndDate);
                    nextSubEndDate.setMonth(nextSubEndDate.getMonth() + 1); // 直接加一個月
                    // 為確保是月底，可以再做調整，但簡單加一個月通常也夠用，或根據 PeriodTimes 決定
                    // 如果是最後一期，則不應再延長。 (Result.AlreadyTimes === Result.TotalTimes from NPA-B05)
                    // Result.TotalTimes 是在 Result.AuthTimes 中，我們叫 newebpayPeriodAuthTimes
                    if (parseInt(alreadyTimes, 10) < parseInt(orderData.newebpayPeriodAuthTimes, 10)) {
                        transaction.update(userRef, {
                            subscriptionEndDate: admin.firestore.Timestamp.fromDate(nextSubEndDate),
                            subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`[Period Notify TX] User ${userId} subscriptionEndDate extended to ${nextSubEndDate.toISOString()}`);
                    } else {
                        console.log(`[Period Notify TX] User ${userId} subscription for ${originalMerchantOrderNo} reached final period (${alreadyTimes}/${orderData.newebpayPeriodAuthTimes}). Not extending further.`);
                        // 此處可以考慮標記訂閱為 "COMPLETED" 或 "EXPIRED_PENDING_RENEWAL"
                        transaction.update(orderRef, { status: 'COMPLETED_PERIODS', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

                    }

                } else {
                    console.warn('[Period Notify TX] SUCCESS status but unknown result structure:', Result);
                }
            } else { // Status !== 'SUCCESS'
                console.warn(`[Period Notify TX] Auth FAILED for ${orderData?.merchantOrderNo || periodNoFromNotify}. Status: ${Status}, Msg: ${Message}, Result:`, Result);
                if (orderRef && orderData) {
                    const failureStatus = orderData.status === 'AGREEMENT_CREATED' ? 'PERIODIC_PAYMENT_FAILED' : 'AGREEMENT_FAILED';
                    transaction.update(orderRef, {
                        status: failureStatus, lastPaymentStatus: 'FAILED', gatewayMessage: Message,
                        gatewayResult: Result || null, notifyDataRaw: JSON.stringify(req.body),
                        notifyDataDecrypted: decryptedResult, updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    // TODO: 更新用戶訂閱狀態 (例如，active: false, status: 'payment_failed')
                    const userRef = admin.firestore().collection('users').doc(orderData.userId);
                    transaction.update(userRef, {
                        subscriptionStatus: 'payment_failed', // 或其他您定義的狀態
                        lastSubscriptionFailureReason: Message,
                        subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
        }); // End of Firestore Transaction
        return res.status(200).send('SUCCESS');
    } catch (error) {
        console.error(`[Period Notify] Error processing Period notification for ${req.body.Period?.Result?.MerchantOrderNo || req.body.Period?.Result?.PeriodNo || 'Unknown'}:`, error);
        return res.status(500).send('Internal Server Error');
    }
}


/**
 * 處理藍新 MPG 的前景跳轉 (ReturnURL)
 */
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

/**
 * 處理藍新信用卡定期定額的前景跳轉 (ReturnURL)
 */
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
    const clientStatus = isSuccess ? 'success' : (decryptedResult.Status === 'TRA20001' ? 'pending' : 'failure'); // TRA20001代表批次處理中
    let clientMessage = decryptedResult.Message || (isSuccess ? '委託建立/授權請求已提交' : '委託建立/授權請求失敗');
    if (decryptedResult.Status === 'TRA20001') clientMessage = '委託授權處理中，請稍後確認結果。';


    const queryParams = new URLSearchParams({
        status: clientStatus,
        message: encodeURIComponent(clientMessage),
        orderNo: decryptedResult.Result?.MerchantOrderNo || '',
        periodNo: decryptedResult.Result?.PeriodNo || '',
        paymentMethod: 'period' // 標記來源
    }).toString();

    return res.redirect(`${APP_BASE_URL}/payment-result?${queryParams}`);
}