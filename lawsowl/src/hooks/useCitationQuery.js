// hooks/useCitationQuery.js
import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { buildApiUrl } from '../utils/api';

/**
 * 引用判決查詢 Hook
 * 
 * 功能：
 * - 查詢引用判決的 URL
 * - 自動判斷案件類型（民事/刑事/行政）
 * - 在新視窗中打開判決書
 * 
 * @param {string} judgementId - 當前判決書 ID
 * @returns {Object} { queryCitation, isQuerying, error }
 */
export function useCitationQuery(judgementId) {
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState(null);
  const { getIdToken } = useAuth();

  /**
   * 查詢引用判決
   * @param {string} citationText - 引用判決文本（如「最高法院109年台上字第2908號判決」）
   */
  const queryCitation = useCallback(async (citationText) => {
    if (!citationText) {
      console.error('[Citation Query] 引用判決文本為空');
      return;
    }

    if (!judgementId) {
      console.error('[Citation Query] 當前判決書 ID 為空');
      alert('無法查詢引用判決：缺少當前判決書信息');
      return;
    }

    setIsQuerying(true);
    setError(null);

    console.log('[Citation Query] 開始查詢:', citationText);
    console.log('[Citation Query] 當前判決書 ID:', judgementId);

    try {
      const token = await getIdToken();
      
      const response = await fetch(buildApiUrl('/citation/query'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          citation_text: citationText,
          judgement_id: judgementId  // 🔥 傳入當前判決書 ID
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[Citation Query] 查詢結果:', result);

      if (result.success && result.url) {
        console.log('[Citation Query] 查詢成功，打開新視窗:', result.url);
        
        // 在新視窗中打開判決書
        const newWindow = window.open(result.url, '_blank', 'noopener,noreferrer');
        
        if (!newWindow) {
          throw new Error('無法打開新視窗，請檢查瀏覽器彈出視窗設定');
        }

        // 可選：顯示成功提示
        // alert(`已打開引用判決：${result.citation_info.court} ${result.citation_info.year}年${result.citation_info.category}字第${result.citation_info.number}號`);
        
      } else {
        throw new Error(result.error || '查詢失敗');
      }

    } catch (err) {
      console.error('[Citation Query] 查詢失敗:', err);
      setError(err.message);
      
      // 顯示友好的錯誤提示
      alert(`查詢引用判決失敗：${err.message}\n\n請稍後再試，或手動前往司法院網站查詢。`);
      
    } finally {
      setIsQuerying(false);
    }
  }, [getIdToken, judgementId]);

  return {
    queryCitation,
    isQuerying,
    error
  };
}

