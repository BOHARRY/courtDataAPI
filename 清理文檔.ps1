# 文檔清理腳本
# 用途：刪除過渡性文檔，保留重要文檔

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  文檔清理腳本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 設置工作目錄
$workDir = "d:\court_data\courtDataAPI"
Set-Location $workDir

Write-Host "工作目錄: $workDir" -ForegroundColor Yellow
Write-Host ""

# 要刪除的文檔列表
$filesToDelete = @(
    "原告方94%勝訴率問題分析.md",
    "原告97%勝訴率問題根源分析.md",
    "重大判決分析BUG修復.md",
    "AI提示詞修復_Tab內容空白問題.md",
    "選項B修復總結.md",
    "數據結構不匹配修復總結.md",
    "判決分布UI優化總結.md",
    "調試日誌說明.md",
    "Phase1_錯誤修復總結.md",
    "主流對決歸納V2數據流分析.md",
    "主流對決歸納功能深度分析與優化建議.md"
)

Write-Host "準備刪除以下文檔：" -ForegroundColor Yellow
Write-Host ""

foreach ($file in $filesToDelete) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file (不存在)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 詢問用戶確認
$confirmation = Read-Host "確定要刪除這些文檔嗎？(Y/N)"

if ($confirmation -eq 'Y' -or $confirmation -eq 'y') {
    Write-Host ""
    Write-Host "開始刪除文檔..." -ForegroundColor Yellow
    Write-Host ""
    
    $deletedCount = 0
    $notFoundCount = 0
    
    foreach ($file in $filesToDelete) {
        if (Test-Path $file) {
            Remove-Item $file -Force
            Write-Host "  ✓ 已刪除: $file" -ForegroundColor Green
            $deletedCount++
        } else {
            Write-Host "  ✗ 文件不存在: $file" -ForegroundColor Red
            $notFoundCount++
        }
    }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  刪除完成！" -ForegroundColor Green
    Write-Host "  已刪除: $deletedCount 個文檔" -ForegroundColor Green
    Write-Host "  未找到: $notFoundCount 個文檔" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # 顯示保留的文檔
    Write-Host "保留的重要文檔：" -ForegroundColor Yellow
    Write-Host ""
    
    $importantDocs = @(
        "README.md",
        "AI_AGENT_GUIDE.md",
        "DOCUMENTATION_SUMMARY.md",
        "交付給下一位工程師.md",
        "案件判決分析服務重構計劃.md",
        "Phase1_重構完成報告.md",
        "重構復盤總結.md",
        "重大判決分析功能_完整文檔.md",
        "AI潤飾案件描述功能實現報告.md",
        "ES查詢驗證報告.md"
    )
    
    foreach ($doc in $importantDocs) {
        if (Test-Path $doc) {
            Write-Host "  ✓ $doc" -ForegroundColor Green
        } else {
            Write-Host "  ✗ $doc (不存在)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    
} else {
    Write-Host ""
    Write-Host "已取消刪除操作。" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "按任意鍵退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

