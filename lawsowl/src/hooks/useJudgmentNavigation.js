// src/hooks/useJudgmentNavigation.js

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTabs } from '../contexts/TabsContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useAuth } from '../AuthContext';
import { log } from '../utils/SmartLogger';

/**
 * 判決導航 Hook
 * 
 * 提供從法官搜索頁面直接跳轉到判決詳情的功能
 * 自動處理工作區切換、分頁創建和路由導航
 */
export const useJudgmentNavigation = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { 
    workspaceList, 
    currentWorkspaceId, 
    switchWorkspace,
    createWorkspace 
  } = useWorkspace();
  const { openTab, setActiveTabId } = useTabs();

  /**
   * 導航到判決詳情頁面
   * @param {Object} judgmentData - 判決數據
   * @param {string} judgmentData.JID - 判決ID
   * @param {string} judgmentData.JTITLE - 判決標題
   * @param {string} judgmentData.JDATE - 判決日期
   * @param {string} judgmentData.court - 法院名稱
   * @param {Object} options - 導航選項
   * @param {boolean} options.createNewWorkspace - 是否創建新工作區
   * @param {string} options.targetWorkspaceId - 目標工作區ID
   */
  const navigateToJudgment = useCallback(async (judgmentData, options = {}) => {
    try {
      if (!currentUser) {
        log.warn('JudgmentNavigation', '用戶未登入，無法導航到判決');
        return;
      }

      if (!judgmentData?.JID) {
        log.error('JudgmentNavigation', '缺少判決ID，無法導航');
        return;
      }

      log.info('JudgmentNavigation', `開始導航到判決: ${judgmentData.JID}`);

      // 1. 確定目標工作區
      let targetWorkspaceId = options.targetWorkspaceId;
      
      if (options.createNewWorkspace) {
        // 創建新工作區
        log.info('JudgmentNavigation', '創建新工作區用於判決查看');
        const newWorkspace = await createWorkspace({
          name: `判決分析 - ${judgmentData.JTITLE?.substring(0, 20) || judgmentData.JID}`,
          description: `從法官搜索頁面創建，用於查看判決 ${judgmentData.JID}`
        });
        targetWorkspaceId = newWorkspace.id;
      } else if (!targetWorkspaceId) {
        // 使用最新的工作區
        targetWorkspaceId = getLatestWorkspaceId();
      }

      // 2. 確保有可用的工作區
      if (!targetWorkspaceId) {
        log.info('JudgmentNavigation', '沒有可用工作區，創建新工作區');
        const newWorkspace = await createWorkspace({
          name: '判決搜索工作區',
          description: '自動創建的判決搜索工作區'
        });
        targetWorkspaceId = newWorkspace.id;
      }

      // 3. 切換到目標工作區（如果需要）
      if (currentWorkspaceId !== targetWorkspaceId) {
        log.info('JudgmentNavigation', `切換到工作區: ${targetWorkspaceId}`);
        await switchWorkspace(targetWorkspaceId);
      }

      // 4. 創建判決分頁
      const judgmentTab = createJudgmentTab(judgmentData);
      
      log.info('JudgmentNavigation', `創建判決分頁: ${judgmentTab.id}`);
      openTab(judgmentTab);
      setActiveTabId(judgmentTab.id);

      // 5. 導航到工作區頁面
      log.info('JudgmentNavigation', '導航到工作區頁面');
      navigate('/search-judgement');

      log.info('JudgmentNavigation', `成功導航到判決: ${judgmentData.JID}`);

    } catch (error) {
      log.error('JudgmentNavigation', '導航到判決失敗:', error);
      
      // 錯誤處理：至少嘗試直接導航到判決頁面
      try {
        navigate(`/judgment/${judgmentData.JID}`);
      } catch (fallbackError) {
        log.error('JudgmentNavigation', '回退導航也失敗:', fallbackError);
      }
    }
  }, [currentUser, workspaceList, currentWorkspaceId, switchWorkspace, createWorkspace, openTab, setActiveTabId, navigate]);

  /**
   * 獲取最新的工作區ID
   */
  const getLatestWorkspaceId = useCallback(() => {
    if (!workspaceList || workspaceList.length === 0) {
      return null;
    }

    // 按最後訪問時間排序，獲取最新的工作區
    const sortedWorkspaces = [...workspaceList].sort((a, b) => {
      const aTime = new Date(a.lastAccessedAt || a.updatedAt || a.createdAt).getTime();
      const bTime = new Date(b.lastAccessedAt || b.updatedAt || b.createdAt).getTime();
      return bTime - aTime;
    });

    return sortedWorkspaces[0]?.id;
  }, [workspaceList]);

  /**
   * 創建判決分頁數據
   */
  const createJudgmentTab = useCallback((judgmentData) => {
    const tabId = `JUDGMENT_${judgmentData.JID}`;
    
    return {
      id: tabId,
      type: 'judgement', // 修正為與 TabsContext 一致的類型名稱
      title: judgmentData.JTITLE?.substring(0, 30) || `判決 ${judgmentData.JID}`,
      JID: judgmentData.JID, // TabsContext 期望的字段名
      JTITLE: judgmentData.JTITLE, // TabsContext 期望的字段名
      JDATE: judgmentData.JDATE,
      court: judgmentData.court,
      source: 'judge_search', // 標記來源
      openedAt: new Date().toISOString(),
      order: Date.now(), // 使用時間戳作為排序
      isClosable: true,
      icon: '📄'
    };
  }, []);

  /**
   * 快速導航到判決（使用最新工作區）
   */
  const quickNavigateToJudgment = useCallback((judgmentData) => {
    return navigateToJudgment(judgmentData, {
      createNewWorkspace: false
    });
  }, [navigateToJudgment]);

  /**
   * 在新工作區中打開判決
   */
  const openJudgmentInNewWorkspace = useCallback((judgmentData) => {
    return navigateToJudgment(judgmentData, {
      createNewWorkspace: true
    });
  }, [navigateToJudgment]);

  return {
    navigateToJudgment,
    quickNavigateToJudgment,
    openJudgmentInNewWorkspace,
    getLatestWorkspaceId
  };
};

export default useJudgmentNavigation;
