// 🎯 多角度分析結果展示組件
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '@iconify/react';
import './MultiAngleAnalysisResults.css';

const MultiAngleAnalysisResults = ({ analysisResult }) => {
  const [expandedCase, setExpandedCase] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  if (!analysisResult?.casePrecedentData) {
    return null;
  }

  const { casePrecedentData } = analysisResult;
  const { multiAngleData, representativeCases } = casePrecedentData;

  // 🎯 多角度搜尋效果統計
  const renderSearchEffectiveness = () => (
    <div className="search-effectiveness">
      <h3>🎯 多角度搜尋效果</h3>
      <div className="effectiveness-grid">
        <div className="stat-card highlight">
          <div className="stat-value">{multiAngleData.intersectionCases}</div>
          <div className="stat-label">高度相關案例</div>
          <div className="stat-desc">多角度命中</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{casePrecedentData.totalSimilarCases}</div>
          <div className="stat-label">總相關案例</div>
          <div className="stat-desc">去重後結果</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{multiAngleData.coverageStats.coverageImprovement}%</div>
          <div className="stat-label">覆蓋提升</div>
          <div className="stat-desc">vs 單一搜尋</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{multiAngleData.totalProcessedResults}</div>
          <div className="stat-label">處理結果</div>
          <div className="stat-desc">四角度總計</div>
        </div>
      </div>
    </div>
  );

  // 🔍 搜尋角度分析
  const renderAngleAnalysis = () => (
    <div className="angle-analysis">
      <h3>🔍 搜尋角度分析</h3>
      <div className="angles-grid">
        {multiAngleData.angleResults.map((angle, index) => (
          <motion.div
            key={angle.angleName}
            className="angle-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className="angle-header">
              <span className="angle-name">{angle.displayName}</span>
              <span className="result-count">{angle.resultCount}筆</span>
            </div>
            <div className="angle-query">
              <Icon icon="mdi:magnify" />
              <span>"{angle.query}"</span>
            </div>
            <div className="angle-status">
              {angle.success ? (
                <span className="success">✅ 搜尋成功</span>
              ) : (
                <span className="failed">❌ 搜尋失敗</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );

  // 📊 案例詳細分析
  const renderCaseDetails = (caseItem, index) => {
    const multiAngle = caseItem.multiAngleInfo;
    if (!multiAngle) return null;

    return (
      <motion.div
        key={caseItem.id}
        className="case-detail-card"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.1 }}
      >
        <div className="case-header">
          <div className="case-title-section">
            <h4 className="case-title">{caseItem.title}</h4>
            <div className="case-meta">
              <span className="case-court">{caseItem.summary}</span>
              <span className="case-verdict">{caseItem.verdictType}</span>
            </div>
          </div>
          <div className="case-scores">
            <div className="similarity-score">
              <span className="score-label">相似度</span>
              <span className="score-value">{caseItem.similarity}%</span>
            </div>
            <div className="total-score">
              <span className="score-label">綜合分</span>
              <span className="score-value">{multiAngle.totalScore}%</span>
            </div>
          </div>
        </div>

        <div className="case-analysis">
          {/* 🎯 發現方式 */}
          <div className="discovery-info">
            <div className="discovery-badges">
              {multiAngle.sourceAngles.map(angle => (
                <span key={angle} className={`angle-badge ${angle}`}>
                  {getAngleDisplayName(angle)}
                </span>
              ))}
              {multiAngle.isIntersection && (
                <span className="intersection-badge">🎯 多角度命中</span>
              )}
            </div>
          </div>

          {/* 🔍 推薦理由 */}
          <div className="recommendation-reason">
            <Icon icon="mdi:lightbulb-outline" />
            <span>推薦理由：{multiAngle.recommendationReason || '基礎相關'}</span>
          </div>

          {/* 📊 律師價值分析 */}
          <div className="lawyer-value-analysis">
            <button
              className="expand-btn"
              onClick={() => setExpandedCase(expandedCase === caseItem.id ? null : caseItem.id)}
            >
              <Icon icon={expandedCase === caseItem.id ? "mdi:chevron-up" : "mdi:chevron-down"} />
              詳細分析
            </button>
          </div>
        </div>

        <AnimatePresence>
          {expandedCase === caseItem.id && (
            <motion.div
              className="expanded-analysis"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="value-breakdown">
                <h5>💡 律師價值分析</h5>
                <div className="value-metrics">
                  <div className="metric">
                    <span className="metric-label">相關性評分：</span>
                    <span className="metric-value">{(multiAngle.lawyerValue?.relevanceScore * 100 || 0).toFixed(1)}%</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">多樣性加分：</span>
                    <span className="metric-value">{(multiAngle.lawyerValue?.diversityBonus * 100 || 0).toFixed(1)}%</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">實務價值：</span>
                    <span className="metric-value">{(multiAngle.lawyerValue?.practicalValue * 100 || 0).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="usage-suggestion">
                  <h6>📋 使用建議</h6>
                  <p>{generateUsageSuggestion(caseItem, multiAngle)}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  // 🎯 智能推薦顯示
  const renderSmartRecommendations = () => {
    const recommendations = multiAngleData.smartRecommendations;
    if (!recommendations) return null;

    return (
      <div className="smart-recommendations">
        <h3>🎯 AI 智能推薦</h3>

        {/* 核心推薦 */}
        <div className="top-recommendation">
          <div className="recommendation-header">
            <Icon icon="mdi:star" />
            <h4>核心建議</h4>
          </div>
          <p className="recommendation-text">{recommendations.topRecommendation}</p>
        </div>

        {/* 下一步建議 */}
        {recommendations.nextSteps && recommendations.nextSteps.length > 0 && (
          <div className="next-steps">
            <div className="section-header">
              <Icon icon="mdi:format-list-checks" />
              <h4>下一步行動</h4>
            </div>
            <ul className="steps-list">
              {recommendations.nextSteps.map((step, index) => (
                <li key={index} className="step-item">
                  <Icon icon="mdi:chevron-right" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 策略洞察 */}
        {recommendations.strategicInsights && recommendations.strategicInsights.length > 0 && (
          <div className="strategic-insights">
            <div className="section-header">
              <Icon icon="mdi:brain" />
              <h4>策略洞察</h4>
            </div>
            <div className="insights-grid">
              {recommendations.strategicInsights.map((insight, index) => (
                <div key={index} className="insight-card">
                  <Icon icon="mdi:lightbulb-outline" />
                  <span>{insight}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 風險警示 */}
        {recommendations.riskWarnings && recommendations.riskWarnings.length > 0 && (
          <div className="risk-warnings">
            <div className="section-header warning">
              <Icon icon="mdi:alert-circle" />
              <h4>風險提醒</h4>
            </div>
            <div className="warnings-list">
              {recommendations.riskWarnings.map((warning, index) => (
                <div key={index} className="warning-item">
                  <Icon icon="mdi:alert-outline" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // 🎨 主要渲染
  return (
    <div className="multi-angle-analysis-results">
      {/* 📊 標籤導航 */}
      <div className="results-tabs">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Icon icon="mdi:chart-line" />
          搜尋效果
        </button>
        <button
          className={`tab-btn ${activeTab === 'angles' ? 'active' : ''}`}
          onClick={() => setActiveTab('angles')}
        >
          <Icon icon="mdi:target" />
          角度分析
        </button>
        <button
          className={`tab-btn ${activeTab === 'cases' ? 'active' : ''}`}
          onClick={() => setActiveTab('cases')}
        >
          <Icon icon="mdi:gavel" />
          案例詳情
        </button>
        <button
          className={`tab-btn ${activeTab === 'recommendations' ? 'active' : ''}`}
          onClick={() => setActiveTab('recommendations')}
        >
          <Icon icon="mdi:lightbulb" />
          智能推薦
        </button>
      </div>

      {/* 📋 內容區域 */}
      <div className="results-content">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {renderSearchEffectiveness()}
            </motion.div>
          )}

          {activeTab === 'angles' && (
            <motion.div
              key="angles"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {renderAngleAnalysis()}
            </motion.div>
          )}

          {activeTab === 'cases' && (
            <motion.div
              key="cases"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="cases-analysis">
                <h3>🎯 高價值案例分析</h3>
                <div className="cases-list">
                  {representativeCases.map((caseItem, index) =>
                    renderCaseDetails(caseItem, index)
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'recommendations' && (
            <motion.div
              key="recommendations"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {renderSmartRecommendations()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// 🔧 輔助函數
const getAngleDisplayName = (angleName) => {
  const displayNames = {
    '核心概念': '核心',
    '法律術語': '術語',
    '實務用詞': '實務',
    '爭點導向': '爭點'
  };
  return displayNames[angleName] || angleName;
};

const generateUsageSuggestion = (caseItem, multiAngle) => {
  if (multiAngle.isIntersection) {
    return '此案例在多個角度都被發現，建議作為核心參考案例，深入研究其判決理由和法律適用。';
  } else if (caseItem.similarity >= 85) {
    return '此案例與您的案件高度相似，建議重點分析其事實認定和法律論述。';
  } else if (caseItem.verdictType?.includes('勝訴')) {
    return '此為勝訴案例，建議參考其成功的論證策略和證據組織方式。';
  } else {
    return '此案例可作為補充參考，建議了解其判決要點和可能的風險因素。';
  }
};

export default MultiAngleAnalysisResults;
