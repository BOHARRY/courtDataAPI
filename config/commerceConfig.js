// 後端: config/commerceConfig.js
export const creditPackages = [
    { id: 'credits_20', credits: 20, price: 60, unitPriceText: 'NT$3/點', popular: false, discountApplies: false , displayName: '20點積分包'},
    { id: 'credits_50', credits: 50, price: 100, unitPriceText: 'NT$2/點', popular: false, discountApplies: false , displayName: '50點積分包'},
    { id: 'credits_100', credits: 100, price: 180, unitPriceText: 'NT$1.8/點', popular: true, discountApplies: false , displayName: '100點積分包'},
    { id: 'credits_300', credits: 300, price: 510, unitPriceText: 'NT$1.7/點', popular: false, discountApplies: false , displayName: '300點積分包'},
    { id: 'credits_500', credits: 500, price: 850, unitPriceText: 'NT$1.7/點', popular: false, discountApplies: true , displayName: '500點積分包'}, // 讓500也參與，測試方便
    { id: 'credits_1000', credits: 1000, price: 1500, unitPriceText: 'NT$1.5/點', discountApplies: true, popular: true , displayName: '1000點積分包'},
    { id: 'credits_3000', credits: 3000, price: 4000, unitPriceText: 'NT$1.33/點', discountApplies: true, popular: false , displayName: '3000點積分包'},
];

export const planSpecificDiscounts = {
    advanced: {
        name: '進階版', // 添加方案名稱，方便前端顯示
        description: "進階會員購買 500 點(含)以上積分包享 8 折",
        threshold: 500,     // 購買 credits 數量達到此門檻的包
        discountRate: 0.8,
        // 如果想針對特定包，可以保留 creditPackages 結構，但門檻更通用
        // creditPackages: {
        //     'credits_1000': { discountRate: 0.8 },
        //     'credits_3000': { discountRate: 0.8 },
        // }
    },
    premium_plus: {
        name: '尊榮客製版',
        description: "尊榮會員購買 500 點(含)以上積分包享 7 折",
        threshold: 500,
        discountRate: 0.7,
        // creditPackages: {
        //     'credits_1000': { discountRate: 0.7 },
        //     'credits_3000': { discountRate: 0.7 },
        // }
    }
};

// 導出一個整合的配置物件
export const commerceConfig = {
    creditPackages,
    planSpecificDiscounts
};