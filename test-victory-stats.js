// test-victory-stats.js
// 測試獲勝比例計算修復

// 直接複製函數代碼進行測試，避免環境變數問題
function calculateVictoryStats(cases, position) {
    let majorVictoryCount = 0;
    let substantialVictoryCount = 0;
    let partialSuccessCount = 0;
    let minorVictoryCount = 0;
    let majorDefeatCount = 0;

    const totalCases = cases.length;

    const positionKey = position === 'plaintiff' ? 'plaintiff_perspective' :
                       position === 'defendant' ? 'defendant_perspective' :
                       position;

    for (const caseItem of cases) {
        const positionAnalysis = caseItem.position_based_analysis || caseItem.positionAnalysis;
        if (!positionAnalysis) continue;

        const positionData = positionAnalysis[positionKey];
        if (!positionData) continue;

        const overallResult = positionData.overall_result;
        if (!overallResult) continue;

        if (overallResult === 'major_victory') {
            majorVictoryCount++;
        } else if (overallResult === 'substantial_victory') {
            substantialVictoryCount++;
        } else if (overallResult === 'partial_success') {
            partialSuccessCount++;
        } else if (overallResult === 'minor_victory') {
            minorVictoryCount++;
        } else if (overallResult === 'major_defeat' || overallResult === 'substantial_defeat') {
            majorDefeatCount++;
        }
    }

    const majorVictoryRate = totalCases > 0 ? Math.round((majorVictoryCount / totalCases) * 100) : 0;
    const substantialVictoryRate = totalCases > 0 ? Math.round((substantialVictoryCount / totalCases) * 100) : 0;
    const partialSuccessRate = totalCases > 0 ? Math.round((partialSuccessCount / totalCases) * 100) : 0;
    const minorVictoryRate = totalCases > 0 ? Math.round((minorVictoryCount / totalCases) * 100) : 0;
    const majorDefeatRate = totalCases > 0 ? Math.round((majorDefeatCount / totalCases) * 100) : 0;

    return {
        majorVictoryCount,
        majorVictoryRate,
        substantialVictoryCount,
        substantialVictoryRate,
        partialSuccessCount,
        partialSuccessRate,
        minorVictoryCount,
        minorVictoryRate,
        majorDefeatCount,
        majorDefeatRate
    };
}

function generatePositionStats(similarCases, position) {
    const stats = calculateVictoryStats(similarCases, position);

    // 計算獲勝比例（明顯有利結果）
    const successCount = stats.majorVictoryCount + stats.substantialVictoryCount;
    const successRate = similarCases.length > 0 ? Math.round((successCount / similarCases.length) * 100) : 0;

    // 計算風險比例
    const riskRate = stats.majorDefeatRate;

    // 生成判決分布
    const positionLabel = position === 'plaintiff' ? '原告' : position === 'defendant' ? '被告' : '';
    const verdictDistribution = [];

    if (stats.majorVictoryCount > 0) {
        verdictDistribution.push({
            verdict: `${positionLabel}重大勝訴`,
            percentage: stats.majorVictoryRate,
            count: stats.majorVictoryCount
        });
    }

    if (stats.substantialVictoryCount > 0) {
        verdictDistribution.push({
            verdict: `${positionLabel}實質勝訴`,
            percentage: stats.substantialVictoryRate,
            count: stats.substantialVictoryCount
        });
    }

    if (stats.partialSuccessCount > 0) {
        verdictDistribution.push({
            verdict: `${positionLabel}部分勝訴`,
            percentage: stats.partialSuccessRate,
            count: stats.partialSuccessCount
        });
    }

    if (stats.minorVictoryCount > 0) {
        verdictDistribution.push({
            verdict: `${positionLabel}形式勝訴`,
            percentage: stats.minorVictoryRate,
            count: stats.minorVictoryCount
        });
    }

    if (stats.majorDefeatCount > 0) {
        verdictDistribution.push({
            verdict: `${positionLabel}重大敗訴`,
            percentage: stats.majorDefeatRate,
            count: stats.majorDefeatCount
        });
    }

    return {
        position: position,
        totalCases: similarCases.length,
        successRate: successRate,
        riskRate: riskRate,
        successCases: successCount,
        riskCases: stats.majorDefeatCount,
        verdictDistribution: verdictDistribution,
        ...stats
    };
}

console.log('🧪 測試獲勝比例計算修復\n');

// 模擬測試數據 - 使用實際的數據結構
const testCases = [
    {
        id: 'case1',
        position_based_analysis: {
            plaintiff_perspective: {
                overall_result: 'partial_success',
                successful_elements: ['策略1', '策略2'],
                critical_failures: ['失敗點1']
            },
            defendant_perspective: {
                overall_result: 'major_defeat',
                failed_strategies: ['失敗策略1']
            }
        }
    },
    {
        id: 'case2',
        position_based_analysis: {
            plaintiff_perspective: {
                overall_result: 'partial_success',
                successful_elements: ['策略3'],
                critical_failures: ['失敗點2']
            },
            defendant_perspective: {
                overall_result: 'substantial_defeat',
                failed_strategies: ['失敗策略2']
            }
        }
    },
    {
        id: 'case3',
        position_based_analysis: {
            plaintiff_perspective: {
                overall_result: 'substantial_victory',
                successful_elements: ['策略4', '策略5']
            },
            defendant_perspective: {
                overall_result: 'major_defeat'
            }
        }
    },
    {
        id: 'case4',
        position_based_analysis: {
            plaintiff_perspective: {
                overall_result: 'major_defeat',
                critical_failures: ['失敗點3', '失敗點4']
            },
            defendant_perspective: {
                overall_result: 'major_victory',
                successful_strategies: ['成功策略1']
            }
        }
    },
    {
        id: 'case5',
        position_based_analysis: {
            plaintiff_perspective: {
                overall_result: 'minor_victory',
                successful_elements: ['策略6']
            },
            defendant_perspective: {
                overall_result: 'substantial_defeat'
            }
        }
    }
];

console.log('📊 測試數據:');
console.log(`   - 總案例數: ${testCases.length}`);
console.log(`   - 原告立場:`);
console.log(`     * partial_success: 2 件 (40%)`);
console.log(`     * substantial_victory: 1 件 (20%)`);
console.log(`     * major_defeat: 1 件 (20%)`);
console.log(`     * minor_victory: 1 件 (20%)`);
console.log('');

// 測試原告立場統計
console.log('🔍 測試原告立場統計...');
const plaintiffStats = generatePositionStats(testCases, 'plaintiff');

console.log('\n✅ 原告立場統計結果:');
console.log(JSON.stringify(plaintiffStats, null, 2));

// 驗證結果
console.log('\n📋 驗證結果:');
console.log(`   - 總案例數: ${plaintiffStats.totalCases} (預期: 5) ${plaintiffStats.totalCases === 5 ? '✅' : '❌'}`);
console.log(`   - 🎯 獲勝比例 (successRate): ${plaintiffStats.successRate}% (預期: 20%) ${plaintiffStats.successRate === 20 ? '✅' : '❌'}`);
console.log(`   - 🎯 風險比例 (riskRate): ${plaintiffStats.riskRate}% (預期: 20%) ${plaintiffStats.riskRate === 20 ? '✅' : '❌'}`);
console.log(`   - 重大勝訴: ${plaintiffStats.majorVictoryCount} 件, ${plaintiffStats.majorVictoryRate}% (預期: 0 件, 0%) ${plaintiffStats.majorVictoryCount === 0 ? '✅' : '❌'}`);
console.log(`   - 實質勝訴: ${plaintiffStats.substantialVictoryCount} 件, ${plaintiffStats.substantialVictoryRate}% (預期: 1 件, 20%) ${plaintiffStats.substantialVictoryCount === 1 ? '✅' : '❌'}`);
console.log(`   - 部分勝訴: ${plaintiffStats.partialSuccessCount} 件, ${plaintiffStats.partialSuccessRate}% (預期: 2 件, 40%) ${plaintiffStats.partialSuccessCount === 2 ? '✅' : '❌'}`);
console.log(`   - 形式勝訴: ${plaintiffStats.minorVictoryCount} 件, ${plaintiffStats.minorVictoryRate}% (預期: 1 件, 20%) ${plaintiffStats.minorVictoryCount === 1 ? '✅' : '❌'}`);
console.log(`   - 重大敗訴: ${plaintiffStats.majorDefeatCount} 件, ${plaintiffStats.majorDefeatRate}% (預期: 1 件, 20%) ${plaintiffStats.majorDefeatCount === 1 ? '✅' : '❌'}`);

console.log('\n📊 判決分布:');
plaintiffStats.verdictDistribution.forEach(item => {
    console.log(`   - ${item.verdict}: ${item.percentage}% (${item.count} 件)`);
});

// 測試被告立場統計
console.log('\n🔍 測試被告立場統計...');
const defendantStats = generatePositionStats(testCases, 'defendant');

console.log('\n✅ 被告立場統計結果:');
console.log(JSON.stringify(defendantStats, null, 2));

console.log('\n📋 驗證結果:');
console.log(`   - 總案例數: ${defendantStats.totalCases} (預期: 5) ${defendantStats.totalCases === 5 ? '✅' : '❌'}`);
console.log(`   - 重大勝訴: ${defendantStats.majorVictoryCount} 件, ${defendantStats.majorVictoryRate}% (預期: 1 件, 20%) ${defendantStats.majorVictoryCount === 1 ? '✅' : '❌'}`);
console.log(`   - 重大敗訴: ${defendantStats.majorDefeatCount} 件, ${defendantStats.majorDefeatRate}% (預期: 3 件, 60%) ${defendantStats.majorDefeatCount === 3 ? '✅' : '❌'}`);

// 總結
const allTestsPassed =
    plaintiffStats.totalCases === 5 &&
    plaintiffStats.successRate === 20 &&  // 🎯 關鍵測試：獲勝比例
    plaintiffStats.riskRate === 20 &&
    plaintiffStats.substantialVictoryCount === 1 &&
    plaintiffStats.partialSuccessCount === 2 &&
    plaintiffStats.minorVictoryCount === 1 &&
    plaintiffStats.majorDefeatCount === 1 &&
    defendantStats.majorVictoryCount === 1 &&
    defendantStats.majorDefeatCount === 4;  // 修正：包含 substantial_defeat

console.log('\n' + '='.repeat(50));
if (allTestsPassed) {
    console.log('✅ 所有測試通過！獲勝比例計算已修復！');
} else {
    console.log('❌ 部分測試失敗，請檢查代碼');
}
console.log('='.repeat(50));

