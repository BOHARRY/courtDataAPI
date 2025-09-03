// services/pleading/utils/contentCleaner.js

/**
 * 🧹 內容清理工具
 * 負責清理 AI 標記和格式化內容
 */

export class ContentCleaner {
    constructor() {
        this.markingPatterns = [
            /【AI補充-法條】(.*?)【\/AI補充-法條】/g,
            /【AI補充-事實】(.*?)【\/AI補充-事實】/g,
            /【AI補充-論述】(.*?)【\/AI補充-論述】/g,
            /【AI補充-程序】(.*?)【\/AI補充-程序】/g,
            /【AI補充-計算】(.*?)【\/AI補充-計算】/g
        ];
    }

    /**
     * 清理 AI 標記，返回乾淨的訴狀內容
     */
    cleanMarkers(pleadingContent) {
        let cleanContent = pleadingContent;
        
        // 移除所有 AI 標記，保留內容
        this.markingPatterns.forEach(pattern => {
            cleanContent = cleanContent.replace(pattern, '$1');
        });

        return cleanContent;
    }

    /**
     * 清理 Markdown 符號
     */
    cleanMarkdownSymbols(content) {
        return content
            .replace(/#{1,6}\s/g, '')           // 移除標題符號
            .replace(/\*\*(.*?)\*\*/g, '$1')   // 移除粗體符號
            .replace(/\*(.*?)\*/g, '$1')       // 移除斜體符號
            .replace(/`(.*?)`/g, '$1')         // 移除代碼符號
            .replace(/^\s*[-*+]\s/gm, '')      // 移除列表符號
            .replace(/^\s*\d+\.\s/gm, '');     // 保留數字列表但移除格式
    }

    /**
     * 標準化空行和縮排
     */
    normalizeWhitespace(content) {
        return content
            .replace(/\r\n/g, '\n')           // 統一換行符
            .replace(/\n{3,}/g, '\n\n')       // 限制連續空行
            .replace(/[ \t]+$/gm, '')         // 移除行尾空白
            .replace(/^[ \t]+/gm, '')         // 移除行首空白（保留必要縮排）
            .trim();                          // 移除首尾空白
    }

    /**
     * 修正法律文書格式
     */
    fixLegalDocumentFormat(content) {
        return content
            .replace(/^(.+狀)$/gm, '$1\n')                    // 標題後加空行
            .replace(/^(案號：.+)$/gm, '$1\n')                // 案號後加空行
            .replace(/^(當事人)$/gm, '$1\n')                  // 當事人標題後加空行
            .replace(/^([一二三四五六七八九十]+、.+)$/gm, '$1') // 保持條列格式
            .replace(/^(此致.+法院)$/gm, '\n$1')              // 此致前加空行
            .replace(/^(具狀人：.+)$/gm, '\n$1')              // 具狀人前加空行
            .replace(/^(中華民國.+年.+月.+日)$/gm, '\n$1');   // 日期前加空行
    }

    /**
     * 驗證清理結果
     */
    validateCleanedContent(originalContent, cleanedContent) {
        const validation = {
            hasMarkdownSymbols: this.hasMarkdownSymbols(cleanedContent),
            hasAIMarkers: this.hasAIMarkers(cleanedContent),
            contentLengthRatio: cleanedContent.length / originalContent.length,
            issues: []
        };

        // 檢查是否過度清理
        if (validation.contentLengthRatio < 0.8) {
            validation.issues.push({
                type: 'EXCESSIVE_CLEANING',
                message: '內容長度減少超過 20%，可能過度清理',
                severity: 'WARNING'
            });
        }

        // 檢查是否還有 Markdown 符號
        if (validation.hasMarkdownSymbols) {
            validation.issues.push({
                type: 'REMAINING_MARKDOWN',
                message: '仍有 Markdown 符號未清理',
                severity: 'WARNING'
            });
        }

        // 檢查是否還有 AI 標記
        if (validation.hasAIMarkers) {
            validation.issues.push({
                type: 'REMAINING_MARKERS',
                message: '仍有 AI 標記未清理',
                severity: 'ERROR'
            });
        }

        return validation;
    }

    /**
     * 檢查是否包含 Markdown 符號
     */
    hasMarkdownSymbols(content) {
        const markdownPatterns = [
            /#{1,6}\s/,                    // 標題
            /\*\*.*?\*\*/,                 // 粗體
            /\*.*?\*/,                     // 斜體
            /`.*?`/,                       // 代碼
            /^\s*[-*+]\s/m,                // 列表
            /\[.*?\]\(.*?\)/               // 連結
        ];

        return markdownPatterns.some(pattern => pattern.test(content));
    }

    /**
     * 檢查是否包含 AI 標記
     */
    hasAIMarkers(content) {
        return this.markingPatterns.some(pattern => pattern.test(content));
    }

    /**
     * 完整清理流程
     */
    fullClean(content) {
        let cleaned = content;
        
        // 1. 清理 AI 標記
        cleaned = this.cleanMarkers(cleaned);
        
        // 2. 清理 Markdown 符號
        cleaned = this.cleanMarkdownSymbols(cleaned);
        
        // 3. 標準化空白字符
        cleaned = this.normalizeWhitespace(cleaned);
        
        // 4. 修正法律文書格式
        cleaned = this.fixLegalDocumentFormat(cleaned);
        
        return cleaned;
    }

    /**
     * 獲取清理統計
     */
    getCleaningStats(originalContent, cleanedContent) {
        return {
            originalLength: originalContent.length,
            cleanedLength: cleanedContent.length,
            reductionRatio: (originalContent.length - cleanedContent.length) / originalContent.length,
            markersRemoved: this.countRemovedMarkers(originalContent),
            markdownRemoved: this.countRemovedMarkdown(originalContent, cleanedContent)
        };
    }

    /**
     * 計算移除的標記數量
     */
    countRemovedMarkers(content) {
        let count = 0;
        this.markingPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) count += matches.length;
        });
        return count;
    }

    /**
     * 計算移除的 Markdown 符號數量
     */
    countRemovedMarkdown(originalContent, cleanedContent) {
        const originalMarkdown = (originalContent.match(/[#*`\[\]]/g) || []).length;
        const cleanedMarkdown = (cleanedContent.match(/[#*`\[\]]/g) || []).length;
        return originalMarkdown - cleanedMarkdown;
    }
}
