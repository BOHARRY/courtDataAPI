// controllers/search-controller.js
import * as searchService from '../services/search.js';


export async function searchJudgmentsController(req, res, next) {
  const searchFilters = req.query;
  const { page = 1, pageSize = 10 } = searchFilters;

  try {
    const searchResponseData = await searchService.performSearch(
      searchFilters,
      parseInt(page, 10),
      parseInt(pageSize, 10)
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