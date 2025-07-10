import React from 'react';
import { Icon } from '@iconify/react';
import './CitationAnalysisProgress.css';

/**
 * 🎯 援引分析進度顯示組件
 * 混合方案：進度圓圈 + 實時統計 + 品質標章 + 時間估算
 */
const CitationAnalysisProgress = ({ progressData }) => {
    // 解構進度數據
    const {
        stage = 0,
        stageName = "正在初始化...",
        progress = 0,
        stats = {
            totalCitations: 0,
            processed: 0,
            qualified: 0,
            verified: 0
        },
        estimatedRemaining = 0,
        currentAction = "準備中...",
        timestamp
    } = progressData || {};

    // 階段定義（與後端保持一致）
    const analysisStages = [
        { id: 0, name: "收集援引判例", icon: "📊", color: "#3b82f6" },
        { id: 1, name: "上下文深度分析", icon: "🔍", color: "#8b5cf6" },
        { id: 2, name: "智能相關性評估", icon: "⚡", color: "#f59e0b" },
        { id: 3, name: "專家級品質驗證", icon: "🛡️", color: "#10b981" },
        { id: 4, name: "個案化建議生成", icon: "🧠", color: "#ef4444" },
        { id: 5, name: "整合最終結果", icon: "✨", color: "#6366f1" }
    ];

    // 品質保證標章
    const qualityBadges = [
        {
            id: "triple_validation",
            text: "三重智能驗證",
            icon: "🎯",
            description: "Mini初篩 → 專家驗證 → 深度分析"
        },
        {
            id: "context_analysis", 
            text: "完整上下文分析",
            icon: "📊",
            description: "提取判例在原判決中的實際使用情境"
        },
        {
            id: "professional_advice",
            text: "專業級法律建議", 
            icon: "⚖️",
            description: "基於實際案例生成具體使用策略"
        }
    ];

    // 獲取當前階段信息
    const currentStage = analysisStages[stage] || analysisStages[0];

    // 格式化時間
    const formatTime = (seconds) => {
        if (seconds <= 0) return "即將完成";
        if (seconds < 60) return `${seconds} 秒`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    // 計算進度圓圈的樣式
    const circleStyle = {
        background: `conic-gradient(${currentStage.color} ${progress * 3.6}deg, #e5e7eb 0deg)`
    };

    return (
        <div className="citation-analysis-progress">
            {/* 🎯 主要進度指示器 */}
            <div className="main-progress">
                <div className="progress-circle" style={circleStyle}>
                    <div className="progress-inner">
                        <span className="stage-icon">{currentStage.icon}</span>
                        <span className="progress-text">{progress}%</span>
                    </div>
                </div>
                
                <div className="stage-info">
                    <h4 className="stage-name">{currentStage.name}</h4>
                    <p className="stage-description">{currentAction}</p>
                    <div className="time-estimate">
                        <Icon icon="mdi:clock-outline" />
                        <span>預計還需 {formatTime(estimatedRemaining)}</span>
                    </div>
                </div>
            </div>

            {/* 📊 實時統計 */}
            <div className="analysis-stats">
                <div className="stat-card">
                    <span className="stat-number">{stats.totalCitations}</span>
                    <span className="stat-label">發現判例</span>
                </div>
                <div className="stat-card">
                    <span className="stat-number">{stats.processed}</span>
                    <span className="stat-label">已分析</span>
                </div>
                <div className="stat-card">
                    <span className="stat-number">{stats.qualified}</span>
                    <span className="stat-label">通過驗證</span>
                    {/* 🚀 新增：階段3的逐個進度顯示 */}
                    {stage === 3 && stats.currentProcessing && stats.totalToProcess && (
                        <span className="stat-progress">{stats.currentProcessing}/{stats.totalToProcess} 進行中</span>
                    )}
                </div>
                <div className="stat-card">
                    <span className="stat-number">{stats.verified}</span>
                    <span className="stat-label">專家驗證</span>
                    {/* 🚀 新增：階段4的並行進度顯示 */}
                    {stage === 4 && stats.totalToProcess && (
                        <div className="parallel-progress">
                            {stats.parallelWorkers && stats.parallelWorkers.length > 0 ? (
                                <span className="stat-progress">
                                    {stats.completedInParallel || 0}/{stats.totalToProcess} 完成
                                    <br />
                                    {stats.currentProcessing || 0} 並行中
                                </span>
                            ) : (
                                <span className="stat-progress">
                                    {stats.currentProcessing || 0}/{stats.totalToProcess} 進行中
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ⭐ 品質保證標章 */}
            <div className="quality-badges">
                {qualityBadges.map(badge => (
                    <div key={badge.id} className="quality-badge" title={badge.description}>
                        <span className="badge-icon">{badge.icon}</span>
                        <span className="badge-text">{badge.text}</span>
                    </div>
                ))}
            </div>

            {/* 🚀 新增：並行處理狀態顯示 */}
            {stage === 4 && stats.parallelWorkers && stats.parallelWorkers.length > 0 && (
                <div className="parallel-status">
                    <div className="parallel-header">
                        <Icon icon="mdi:lightning-bolt" className="parallel-icon" />
                        <span className="parallel-title">並行處理狀態</span>
                    </div>
                    <div className="parallel-workers">
                        {stats.parallelWorkers.map((worker, index) => (
                            <div key={worker.workerId || index} className={`worker-status ${worker.status}`}>
                                <span className="worker-id">Worker {worker.workerId}</span>
                                <span className="worker-task">
                                    {worker.status === 'analyzing' ? (
                                        <>
                                            <Icon icon="mdi:cog" className="worker-icon spinning" />
                                            {worker.citation || '分析中...'}
                                        </>
                                    ) : (
                                        <>
                                            <Icon icon="mdi:check-circle" className="worker-icon" />
                                            待命中
                                        </>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 🔄 階段進度條 */}
            <div className="stage-progress">
                {analysisStages.map((stageItem, index) => (
                    <div 
                        key={stageItem.id} 
                        className={`stage-item ${
                            index < stage ? 'completed' : 
                            index === stage ? 'active' : 'pending'
                        }`}
                    >
                        <div className="stage-dot" style={{
                            backgroundColor: index <= stage ? stageItem.color : '#e5e7eb'
                        }}>
                            {index < stage ? (
                                <Icon icon="mdi:check" className="check-icon" />
                            ) : index === stage ? (
                                <div className="pulse-dot" />
                            ) : (
                                <span className="stage-number">{index + 1}</span>
                            )}
                        </div>
                        <span className="stage-label">{stageItem.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CitationAnalysisProgress;
