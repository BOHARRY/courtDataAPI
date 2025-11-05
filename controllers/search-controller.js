// controllers/search-controller.js
import * as searchService from '../services/search.js';
import logger from '../utils/logger.js';


export async function searchJudgmentsController(req, res, next) {
  const searchFilters = req.query;
  const { page = 1, pageSize = 10 } = searchFilters;
  const userId = req.user?.uid;

  // 🔍 調試日誌：檢查接收到的參數
  logger.debug('🔍 Controller 接收到的查詢參數', {
    operation: 'search_controller_debug',
    userId,
    rawQuery: req.query,
    searchFilters,
    queryParam: searchFilters.query,
    keywordParam: searchFilters.keyword,
    allParams: Object.keys(req.query)
  });

  try {
    const searchResponseData = await searchService.performSearch(
      searchFilters,
      parseInt(page, 10),
      parseInt(pageSize, 10),
      userId
    );

    // 加入實際扣除的積分資訊
    searchResponseData.creditsDeducted = req.creditDeducted || 1;
    searchResponseData.userCreditsRemaining = req.userCreditsAfter;

    res.status(200).json(searchResponseData);
  } catch (error) {
    next(error);
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