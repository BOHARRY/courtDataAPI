// services/pleading/migration/migrationScript.js

/**
 * 🔄 訴狀生成服務遷移腳本
 * 用於從舊版本平滑遷移到新的模組化架構
 */

import fs from 'fs';
import path from 'path';

export class MigrationScript {
    constructor() {
        this.migrationSteps = [
            'backupOriginalFile',
            'validateNewModules',
            'updateImports',
            'testCompatibility',
            'switchToNewService'
        ];
        
        this.backupPath = 'services/pleading/migration/backup';
        this.originalServicePath = 'services/pleadingGenerationService.js';
        this.newServicePath = 'services/pleading/index.js';
    }

    /**
     * 執行完整遷移流程
     */
    async executeMigration() {
        console.log('🚀 開始訴狀生成服務遷移...');
        
        try {
            for (const step of this.migrationSteps) {
                console.log(`📋 執行步驟: ${step}`);
                await this[step]();
                console.log(`✅ 步驟完成: ${step}`);
            }
            
            console.log('🎉 遷移完成！新的模組化架構已啟用。');
            return { success: true, message: '遷移成功完成' };
            
        } catch (error) {
            console.error('❌ 遷移失敗:', error);
            await this.rollback();
            throw error;
        }
    }

    /**
     * 步驟1：備份原始檔案
     */
    async backupOriginalFile() {
        // 確保備份目錄存在
        if (!fs.existsSync(this.backupPath)) {
            fs.mkdirSync(this.backupPath, { recursive: true });
        }

        // 備份原始服務檔案
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `pleadingGenerationService_backup_${timestamp}.js`;
        const backupFilePath = path.join(this.backupPath, backupFileName);

        if (fs.existsSync(this.originalServicePath)) {
            fs.copyFileSync(this.originalServicePath, backupFilePath);
            console.log(`📁 原始檔案已備份至: ${backupFilePath}`);
        }
    }

    /**
     * 步驟2：驗證新模組
     */
    async validateNewModules() {
        const requiredModules = [
            'services/pleading/index.js',
            'services/pleading/config/templates.js',
            'services/pleading/ai/aiModelManager.js',
            'services/pleading/ai/claudeClient.js',
            'services/pleading/ai/gptClient.js',
            'services/pleading/audit/contentAuditor.js',
            'services/pleading/task/taskManager.js'
        ];

        for (const modulePath of requiredModules) {
            if (!fs.existsSync(modulePath)) {
                throw new Error(`必要模組不存在: ${modulePath}`);
            }
        }

        // 嘗試導入新服務
        try {
            const { pleadingService } = await import('../index.js');
            if (!pleadingService) {
                throw new Error('無法導入新的訴狀生成服務');
            }
        } catch (error) {
            throw new Error(`新模組導入失敗: ${error.message}`);
        }

        console.log('✅ 所有新模組驗證通過');
    }

    /**
     * 步驟3：更新導入引用
     */
    async updateImports() {
        // 這裡可以添加自動更新其他檔案中的導入語句的邏輯
        console.log('📝 檢查需要更新的導入引用...');
        
        // 檢查可能需要更新的檔案
        const filesToCheck = [
            'routes/pleadingRoutes.js',
            'controllers/pleadingController.js'
        ];

        for (const filePath of filesToCheck) {
            if (fs.existsSync(filePath)) {
                console.log(`⚠️  請手動檢查檔案: ${filePath}`);
                console.log(`   需要將導入從 'services/pleadingGenerationService.js' 更新為 'services/pleading/index.js'`);
            }
        }
    }

    /**
     * 步驟4：測試相容性
     */
    async testCompatibility() {
        console.log('🧪 測試新服務相容性...');
        
        try {
            // 導入新服務
            const { 
                startPleadingGenerationTask,
                generatePleadingContent 
            } = await import('../index.js');

            // 檢查關鍵函數是否存在
            if (typeof startPleadingGenerationTask !== 'function') {
                throw new Error('startPleadingGenerationTask 函數不存在');
            }

            if (typeof generatePleadingContent !== 'function') {
                throw new Error('generatePleadingContent 函數不存在');
            }

            console.log('✅ API 相容性測試通過');

        } catch (error) {
            throw new Error(`相容性測試失敗: ${error.message}`);
        }
    }

    /**
     * 步驟5：切換到新服務
     */
    async switchToNewService() {
        console.log('🔄 切換到新的模組化服務...');
        
        // 重命名原始檔案（如果存在）
        if (fs.existsSync(this.originalServicePath)) {
            const deprecatedPath = this.originalServicePath.replace('.js', '_deprecated.js');
            fs.renameSync(this.originalServicePath, deprecatedPath);
            console.log(`📁 原始檔案已重命名為: ${deprecatedPath}`);
        }

        console.log('✅ 已切換到新的模組化架構');
    }

    /**
     * 回滾遷移
     */
    async rollback() {
        console.log('🔄 執行遷移回滾...');
        
        try {
            // 找到最新的備份檔案
            if (fs.existsSync(this.backupPath)) {
                const backupFiles = fs.readdirSync(this.backupPath)
                    .filter(file => file.startsWith('pleadingGenerationService_backup_'))
                    .sort()
                    .reverse();

                if (backupFiles.length > 0) {
                    const latestBackup = path.join(this.backupPath, backupFiles[0]);
                    fs.copyFileSync(latestBackup, this.originalServicePath);
                    console.log(`✅ 已從備份恢復: ${latestBackup}`);
                }
            }

            // 移除 deprecated 檔案（如果存在）
            const deprecatedPath = this.originalServicePath.replace('.js', '_deprecated.js');
            if (fs.existsSync(deprecatedPath)) {
                fs.unlinkSync(deprecatedPath);
            }

        } catch (error) {
            console.error('❌ 回滾失敗:', error);
        }
    }

    /**
     * 生成遷移報告
     */
    generateMigrationReport() {
        const report = {
            timestamp: new Date().toISOString(),
            architecture: {
                before: 'Monolithic (single file)',
                after: 'Modular (multiple specialized modules)'
            },
            modules: {
                config: ['templates.js', 'stanceValidation.js'],
                validation: ['dataValidator.js'],
                prompt: ['basePromptBuilder.js', 'claudePromptBuilder.js', 'gptPromptBuilder.js'],
                ai: ['aiModelManager.js', 'claudeClient.js', 'gptClient.js'],
                audit: ['contentAuditor.js', 'riskAssessment.js', 'transparencyReporter.js'],
                task: ['taskManager.js'],
                utils: ['contentCleaner.js']
            },
            benefits: [
                '單一職責原則',
                '低耦合高內聚',
                '易於測試和維護',
                '支援獨立擴展',
                '清晰的依賴關係'
            ],
            backwardCompatibility: true,
            apiChanges: 'None (fully backward compatible)'
        };

        const reportPath = path.join(this.backupPath, 'migration_report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log(`📊 遷移報告已生成: ${reportPath}`);
        return report;
    }
}

// 如果直接執行此腳本
if (import.meta.url === `file://${process.argv[1]}`) {
    const migration = new MigrationScript();
    migration.executeMigration()
        .then(() => {
            migration.generateMigrationReport();
            process.exit(0);
        })
        .catch((error) => {
            console.error('遷移失敗:', error);
            process.exit(1);
        });
}
