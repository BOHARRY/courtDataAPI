import React, { useState, useEffect } from 'react';
import CitationAnalysisProgress from './CitationAnalysisProgress';

/**
 * 🧪 援引分析進度組件測試頁面
 * 用於測試不同階段的進度顯示效果
 */
const ProgressTest = () => {
    const [currentStage, setCurrentStage] = useState(0);
    const [isRunning, setIsRunning] = useState(false);

    // 測試數據
    const testProgressData = [
        {
            stage: 0,
            stageName: "收集援引判例",
            progress: 15,
            stats: { totalCitations: 0, processed: 0, qualified: 0, verified: 0 },
            estimatedRemaining: 145,
            currentAction: "案例池載入完成，開始援引分析...",
            timestamp: Date.now()
        },
        {
            stage: 1,
            stageName: "上下文深度分析",
            progress: 30,
            stats: { totalCitations: 73, processed: 73, qualified: 0, verified: 0 },
            estimatedRemaining: 130,
            currentAction: "發現 73 個援引判例，正在計算價值評估...",
            timestamp: Date.now()
        },
        {
            stage: 2,
            stageName: "智能相關性評估",
            progress: 55,
            stats: { totalCitations: 73, processed: 73, qualified: 15, verified: 0 },
            estimatedRemaining: 105,
            currentAction: "Mini AI 正在快速評估援引相關性...",
            timestamp: Date.now()
        },
        {
            stage: 3,
            stageName: "專家級品質驗證",
            progress: 80,
            stats: { totalCitations: 73, processed: 73, qualified: 15, verified: 9 },
            estimatedRemaining: 75,
            currentAction: "專家級 AI 正在嚴格驗證推薦品質...",
            timestamp: Date.now()
        },
        {
            stage: 4,
            stageName: "個案化建議生成",
            progress: 95,
            stats: { totalCitations: 73, processed: 73, qualified: 15, verified: 9 },
            estimatedRemaining: 15,
            currentAction: "正在為每個援引生成個案化使用建議...",
            timestamp: Date.now()
        },
        {
            stage: 5,
            stageName: "整合最終結果",
            progress: 100,
            stats: { totalCitations: 73, processed: 73, qualified: 15, verified: 9 },
            estimatedRemaining: 0,
            currentAction: "援引分析完成！",
            timestamp: Date.now()
        }
    ];

    // 自動播放進度
    useEffect(() => {
        if (isRunning) {
            const interval = setInterval(() => {
                setCurrentStage(prev => {
                    if (prev >= testProgressData.length - 1) {
                        setIsRunning(false);
                        return prev;
                    }
                    return prev + 1;
                });
            }, 3000); // 每3秒切換一個階段

            return () => clearInterval(interval);
        }
    }, [isRunning, testProgressData.length]);

    const handleStart = () => {
        setCurrentStage(0);
        setIsRunning(true);
    };

    const handleStop = () => {
        setIsRunning(false);
    };

    const handleReset = () => {
        setCurrentStage(0);
        setIsRunning(false);
    };

    return (
        <div style={{ 
            padding: '40px', 
            backgroundColor: '#f8fafc', 
            minHeight: '100vh',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                <h1 style={{ 
                    textAlign: 'center', 
                    color: '#1f2937', 
                    marginBottom: '40px',
                    fontSize: '28px',
                    fontWeight: '600'
                }}>
                    🧪 援引分析進度組件測試
                </h1>

                {/* 控制按鈕 */}
                <div style={{ 
                    textAlign: 'center', 
                    marginBottom: '40px',
                    display: 'flex',
                    gap: '12px',
                    justifyContent: 'center'
                }}>
                    <button 
                        onClick={handleStart}
                        disabled={isRunning}
                        style={{
                            padding: '12px 24px',
                            backgroundColor: isRunning ? '#9ca3af' : '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: isRunning ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                        }}
                    >
                        {isRunning ? '運行中...' : '開始測試'}
                    </button>
                    
                    <button 
                        onClick={handleStop}
                        disabled={!isRunning}
                        style={{
                            padding: '12px 24px',
                            backgroundColor: !isRunning ? '#9ca3af' : '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: !isRunning ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                        }}
                    >
                        暫停
                    </button>
                    
                    <button 
                        onClick={handleReset}
                        style={{
                            padding: '12px 24px',
                            backgroundColor: '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                        }}
                    >
                        重置
                    </button>
                </div>

                {/* 階段選擇器 */}
                <div style={{ 
                    textAlign: 'center', 
                    marginBottom: '40px'
                }}>
                    <p style={{ color: '#6b7280', marginBottom: '16px' }}>
                        手動選擇階段：
                    </p>
                    <div style={{ 
                        display: 'flex', 
                        gap: '8px', 
                        justifyContent: 'center',
                        flexWrap: 'wrap'
                    }}>
                        {testProgressData.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => {
                                    setCurrentStage(index);
                                    setIsRunning(false);
                                }}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: currentStage === index ? '#8b5cf6' : '#e5e7eb',
                                    color: currentStage === index ? 'white' : '#374151',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: '500'
                                }}
                            >
                                階段 {index}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 進度組件 */}
                <div style={{ 
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    padding: '20px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}>
                    <CitationAnalysisProgress 
                        progressData={testProgressData[currentStage]} 
                    />
                </div>

                {/* 當前數據顯示 */}
                <div style={{ 
                    marginTop: '40px',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '12px',
                    padding: '20px'
                }}>
                    <h3 style={{ 
                        color: '#374151', 
                        marginBottom: '16px',
                        fontSize: '16px',
                        fontWeight: '600'
                    }}>
                        當前進度數據：
                    </h3>
                    <pre style={{ 
                        backgroundColor: '#1f2937',
                        color: '#f9fafb',
                        padding: '16px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        overflow: 'auto'
                    }}>
                        {JSON.stringify(testProgressData[currentStage], null, 2)}
                    </pre>
                </div>
            </div>
        </div>
    );
};

export default ProgressTest;
