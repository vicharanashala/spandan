/**
 * Calculates the score for a correct answer based on Time-To-Answer (TTA).
 * @param {number} remainingTimeMs - The exact remaining time when answer was locked
 * @param {number} allottedTimeMs - The total time allotted for this question category
 * @param {number} basePoints - Base point value (e.g., 1000)
 * @param {number} editCount - Number of times answer was edited (default 0)
 * @returns {number} The calculated score
 */
export function calculateTTAScore(remainingTimeMs, allottedTimeMs, basePoints = 1000, editCount = 0) {
  // If time expired or invalid inputs, score is 0
  if (remainingTimeMs <= 0 || allottedTimeMs <= 0) return 0;
  if (remainingTimeMs > allottedTimeMs) remainingTimeMs = allottedTimeMs;
  
  // Calculate raw time multiplier (0.0 to 1.0)
  const timeRatio = remainingTimeMs / allottedTimeMs;
  
  // Calculate raw score
  let score = basePoints * timeRatio;
  
  // Apply edit penalty if the product allows edits (e.g., 20% penalty per edit)
  if (editCount > 0) {
    score = score * Math.pow(0.8, editCount);
  }
  
  // Apply bounds (cap at basePoints, floor at 10% of basePoints)
  const minFloor = basePoints * 0.1;
  
  return Math.max(minFloor, Math.min(basePoints, Math.round(score)));
}
