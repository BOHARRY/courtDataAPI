// services/pleading/config/stanceValidation.js

import { VALID_STANCE_COMBINATIONS } from './templates.js';

/**
 * 🎯 立場驗證模組
 * 負責驗證立場與書狀類型的一致性
 */

/**
 * 驗證立場與書狀類型的一致性
 */
export function validateStanceCombination(litigationStage, actualStance) {
    const validStances = VALID_STANCE_COMBINATIONS[litigationStage] || [];
    
    const isValid = !actualStance || validStances.includes(actualStance);
    
    if (!isValid) {
        console.warn(`[StanceValidation] ⚠️ 立場與書狀類型不匹配: ${actualStance} + ${litigationStage}`);
    }
    
    return {
        isValid,
        actualStance,
        validStances,
        litigationStage,
        warningMessage: isValid ? null : `立場 ${actualStance} 與書狀類型 ${litigationStage} 不匹配`
    };
}

/**
 * 確定文書類型和配置，並驗證立場一致性
 */
export function determineDocumentConfig(litigationStage, actualStance, templateConfig) {
    // 立場驗證
    const stanceValidation = validateStanceCombination(litigationStage, actualStance);
    
    return {
        ...templateConfig,
        stanceValidation
    };
}
