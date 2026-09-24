const MIN_ANSWERS_FOR_ACCURACY = 100

export function checkRule(rule, stats) {
  if (!rule || !stats) return false
  switch (rule.type) {
    case 'correct_answers':
      return Number(stats.correctAnswers || 0) >= rule.threshold
    case 'correct_streak':
      return Number(stats.maxStreak || 0) >= rule.threshold
    case 'accuracy':
      return Number(stats.accuracy || 0) >= rule.threshold &&
        Number(stats.totalAnswers || 0) >= Number(rule.minAnswers || MIN_ANSWERS_FOR_ACCURACY)
    case 'section_accuracy':
      return Number(stats.accuracy || 0) >= rule.threshold &&
        Number(stats.totalAnswers || 0) >= Number(rule.minAnswers || 20)
    case 'questions_answered':
      return Number(stats.totalAnswers || 0) >= rule.threshold
    case 'fast_response':
      return stats.fastestResponse !== null &&
        stats.fastestResponse !== undefined &&
        Number(stats.fastestResponse) <= rule.threshold
    case 'fast_answers':
      return Number(stats.fastAnswers5 || 0) >= rule.threshold
    case 'fast_answers_10':
      return Number(stats.fastAnswers10 || 0) >= rule.threshold
    case 'perfect_start':
      return Number(stats.totalAnswers || 0) >= rule.threshold &&
        Number(stats.firstAnswersCorrect || 0) >= rule.threshold
    default:
      return false
  }
}

export { MIN_ANSWERS_FOR_ACCURACY }
