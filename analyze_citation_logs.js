// analyze_citation_logs.js
// 分析援引分析日誌的腳本

/**
 * 分析日誌中的匹配成功率
 */
function analyzeCitationLogs(logText) {
    const lines = logText.split('\n');
    
    const stats = {
        totalMatches: 0,
        successfulMatches: 0,
        failedMatches: 0,
        exactMatches: 0,
        variantMatches: 0,
        fuzzyMatches: 0,
        dataFetchErrors: 0,
        analysisErrors: 0,
        failureReasons: {},
        successStrategies: {},
        problematicCitations: new Set()
    };
    
    for (const line of lines) {
        // 統計匹配成功
        if (line.includes('[Citation:MatchOK]')) {
            stats.totalMatches++;
            stats.successfulMatches++;
            
            if (line.includes('(exact)')) {
                stats.exactMatches++;
                stats.successStrategies.exact = (stats.successStrategies.exact || 0) + 1;
            } else if (line.includes('(variant)')) {
                stats.variantMatches++;
                stats.successStrategies.variant = (stats.successStrategies.variant || 0) + 1;
            } else if (line.includes('(fuzzy)')) {
                stats.fuzzyMatches++;
                stats.successStrategies.fuzzy = (stats.successStrategies.fuzzy || 0) + 1;
            }
        }
        
        // 統計匹配失敗
        if (line.includes('[Citation:MatchFail]')) {
            stats.totalMatches++;
            stats.failedMatches++;
            
            // 提取失敗原因
            const reasonMatch = line.match(/- (\w+)/);
            if (reasonMatch) {
                const reason = reasonMatch[1];
                stats.failureReasons[reason] = (stats.failureReasons[reason] || 0) + 1;
            }
            
            // 提取問題判例
            const citationMatch = line.match(/"([^"]+)"/);
            if (citationMatch) {
                stats.problematicCitations.add(citationMatch[1]);
            }
        }
        
        // 統計數據獲取錯誤
        if (line.includes('[Citation:DataFetch]')) {
            stats.dataFetchErrors++;
        }
        
        // 統計分析錯誤
        if (line.includes('[Citation:SingleAnalysis]') && line.includes('未找到任何上下文')) {
            stats.analysisErrors++;
        }
    }
    
    return stats;
}

/**
 * 生成分析報告
 */
function generateReport(stats) {
    const successRate = stats.totalMatches > 0 ? 
        (stats.successfulMatches / stats.totalMatches * 100).toFixed(1) : 0;
    
    console.log('🔍 援引分析日誌分析報告');
    console.log('=' * 50);
    
    console.log('\n📊 總體統計:');
    console.log(`總匹配嘗試: ${stats.totalMatches}`);
    console.log(`成功匹配: ${stats.successfulMatches}`);
    console.log(`失敗匹配: ${stats.failedMatches}`);
    console.log(`成功率: ${successRate}%`);
    
    console.log('\n✅ 成功匹配策略分布:');
    console.log(`精確匹配: ${stats.exactMatches} (${(stats.exactMatches/stats.successfulMatches*100).toFixed(1)}%)`);
    console.log(`變體匹配: ${stats.variantMatches} (${(stats.variantMatches/stats.successfulMatches*100).toFixed(1)}%)`);
    console.log(`模糊匹配: ${stats.fuzzyMatches} (${(stats.fuzzyMatches/stats.successfulMatches*100).toFixed(1)}%)`);
    
    console.log('\n❌ 失敗原因分析:');
    for (const [reason, count] of Object.entries(stats.failureReasons)) {
        console.log(`${reason}: ${count} 次`);
    }
    
    console.log('\n🚨 系統錯誤:');
    console.log(`數據獲取錯誤: ${stats.dataFetchErrors}`);
    console.log(`分析錯誤: ${stats.analysisErrors}`);
    
    console.log('\n🔧 問題判例 (前10個):');
    const problematicArray = Array.from(stats.problematicCitations).slice(0, 10);
    problematicArray.forEach((citation, index) => {
        console.log(`${index + 1}. ${citation}`);
    });
    
    console.log('\n💡 改進建議:');
    if (stats.failureReasons.no_text_match > stats.failureReasons.no_variant_match) {
        console.log('- 主要問題是文本匹配失敗，建議改進文本清理算法');
    }
    if (stats.failureReasons.no_variant_match > 0) {
        console.log('- 需要擴展數字格式變體生成算法');
    }
    if (stats.dataFetchErrors > 0) {
        console.log('- 存在數據獲取問題，檢查ES連接和數據完整性');
    }
    if (successRate < 80) {
        console.log('- 整體成功率偏低，需要進一步優化匹配策略');
    } else if (successRate > 90) {
        console.log('- 成功率良好，系統運行正常');
    }
}

/**
 * 從日誌文件分析
 */
function analyzeLogFile(filePath) {
    try {
        const fs = require('fs');
        const logContent = fs.readFileSync(filePath, 'utf8');
        const stats = analyzeCitationLogs(logContent);
        generateReport(stats);
    } catch (error) {
        console.error('讀取日誌文件失敗:', error.message);
    }
}

/**
 * 從日誌文本分析
 */
function analyzeLogText(logText) {
    const stats = analyzeCitationLogs(logText);
    generateReport(stats);
    return stats;
}

// 測試用的日誌樣本
const sampleLog = `
[Citation:MatchOK] "最高法院77年度第9次民事庭會議決議" in "JFULL" (exact)
[Citation:MatchOK] "最高法院51年台上字第223號判決" in "JFULL" (exact)
[Citation:MatchFail] "最高法院77年度第9次民事庭會議決議(一)" in "損害賠償(交通)" - no_variant_match
[Citation:SingleAnalysis] 未找到任何上下文: 最高法院77年度第9次民事庭會議決議(一)
[Citation:MatchFail] "司法院釋字第548號" in "侵權行為損害賠償(交通)" - no_variant_match
[Citation:SingleAnalysis] 未找到任何上下文: 司法院釋字第548號
[Citation:MatchOK] "最高法院108年度台上字第1080號民事判決" in "JFULL" (exact)
`;

// 如果直接運行此腳本
if (require.main === module) {
    const filePath = process.argv[2];
    if (filePath) {
        analyzeLogFile(filePath);
    } else {
        console.log('使用方法: node analyze_citation_logs.js <log-file-path>');
        console.log('或者在代碼中調用 analyzeLogText(logText)');
        console.log('\n測試樣本分析:');
        analyzeLogText(sampleLog);
    }
}

module.exports = { analyzeCitationLogs, generateReport, analyzeLogFile, analyzeLogText };
