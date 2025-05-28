// config/subscriptionProducts.js
export const subscriptionProducts = {
    basic: {
        id: 'basic',
        name: '基本',
        creditsPerMonth: 250, // 每月基礎贈點 (用於月付和計算年付總贈點)
        // 升級到此方案的獎勵 (示例，您可以根據業務調整)
        upgradeBonus: {
            fromFree: 100 // 從免費版升級到基本版獎勵 100 點
        },
        features: [
            "每月贈送 250 點積分",
            "收藏庫上限 30 篇",
            "搜尋紀錄 100 則"
        ],
        pricing: {
            monthly: {
                price: 299,
                billingCycleDescription: '月繳',
                displayText: 'NT$ 299 / 月',
                // 藍新定期定額相關參數 (用於 isSubscriptionPayment = true)
                newebpayPeriodParams: {
                    PeriodType: 'M',
                    PeriodTimes: 12, // 假設月繳方案預設簽約12期 (一年)
                    DefaultPeriodPoint: '01', // 預設每月1號扣款
                    DefaultPeriodStartType: '2' // 預設立即執行首期金額授權
                }
            },
            annually: { // 年付走 MPG 一次性支付
                price: 2990,
                creditsForYear: 3000, // 250 * 12 = 3000，年付總贈點
                billingCycleDescription: '年繳',
                displayText: 'NT$ 2,990 / 年',
                savingText: '約 NT$ 249 / 月，年省 NT$ 598' // 前端顯示用
            }
        }
    },
    advanced: {
        id: 'advanced',
        name: '進階',
        creditsPerMonth: 2500,
        creditsForYear: 30000, // 2500 * 12
        upgradeBonus: { // 升級到進階版的獎勵
            fromFree: 1000,
            fromBasic: 500
        },
        features: [
            "每月贈送 2,500 點積分",
            "收藏庫上限 100 篇",
            "搜尋紀錄 1,000 則",
            "1000點積分購買享 8 折"
        ],
        pricing: {
            monthly: {
                price: 999,
                billingCycleDescription: '月繳',
                displayText: 'NT$ 999 / 月',
                newebpayPeriodParams: {
                    PeriodType: 'M',
                    PeriodTimes: 12,
                    DefaultPeriodPoint: '01',
                    DefaultPeriodStartType: '2'
                }
            },
            annually: {
                price: 9990,
                creditsForYear: 30000, // 保持與月贈點*12一致，或可設更高作為年付獎勵
                billingCycleDescription: '年繳',
                displayText: 'NT$ 9,990 / 年',
                savingText: '約 NT$ 833 / 月，年省 NT$ 1,998'
            }
        },
        recommended: true
    },
    premium_plus: {
        id: 'premium_plus',
        name: '尊榮客製版',
        creditsPerMonth: 5000,
        creditsForYear: 60000, // 5000 * 12
        upgradeBonus: { // 升級到尊榮客製版的獎勵
            fromFree: 2500,
            fromBasic: 2000,
            fromAdvanced: 1000
        },
        features: [
            "【包含所有進階版功能】",
            "每月贈 5,000 點積分",
            "1000點貼積分購買享 7 折",
            "自訂應用程式形式 Logo",
            "自選應用程式主題色調 (10+)"
        ],
        pricing: {
            monthly: {
                price: 3000,
                billingCycleDescription: '月繳',
                displayText: 'NT$ 3,000 / 月',
                newebpayPeriodParams: {
                    PeriodType: 'M',
                    PeriodTimes: 12,
                    DefaultPeriodPoint: '01',
                    DefaultPeriodStartType: '2'
                }
            },
            annually: {
                price: 30000,
                creditsForYear: 60000,
                billingCycleDescription: '年繳',
                displayText: 'NT$ 30,000 / 年',
                savingText: '約 NT$ 2,500 / 月，年省 NT$ 6,000'
            }
        },
        topLevel: true
    },
    free: {
        id: 'free',
        name: '免費',
        creditsPerMonth: 0, // 免費方案沒有每月贈點
        // 免費方案通常沒有升級到它的獎勵
        features: [
            "永久免費",
            "收藏庫上限 5 篇",
            "搜尋紀錄 20 則"
        ],
        pricing: {
            monthly: { // 免費方案只有一種“週期”
                price: 0,
                billingCycleDescription: '免費使用',
                displayText: '永久免費',
                // 不需要 newebpayPeriodParams 因為價格為0
            }
        }
    }
};