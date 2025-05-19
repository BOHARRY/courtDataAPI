// controllers/search-controller.js
import * as searchService from '../services/search.js';


export async function searchJudgmentsController(req, res, next) {
  // userId 已經由 checkAndDeductCredits (如果掛載的話) 或 verifyToken 處理
  // const userId = req.user.uid; // 如果積分中介沒掛載，則需要 verifyToken
  const searchFilters = req.query;
  const { page = 1, pageSize = 10 } = searchFilters;

  // console.log(`[Search Controller] Filters:`, searchFilters);

  try {
    // 直接執行 Elasticsearch 搜尋
    const searchResponseData = await searchService.performSearch(
        searchFilters,
        parseInt(page, 10),
        parseInt(pageSize, 10)
    );

    // console.log(`[Search Controller Success] Sending results.`);
    res.status(200).json(searchResponseData);

  } catch (error) {
    // console.error(`[Search Controller Error] Error:`, error.message);
    // 這裡的錯誤主要是 searchService 可能拋出的錯誤
    next(error); // 交給全局錯誤處理器
  }
}

export async function getFiltersController(req, res, next) {
  try {
    const filtersData = await searchService.getAvailableFilters();
    res.status(200).json(filtersData);
  } catch (error) {
    // console.error('[Get Filters Controller Error]:', error);
    next(error);
  }
}