const SEGMENT_MIN_RESPONSES = 5
const SEGMENT_EASY_ACCURACY = 70
const SEGMENT_MEDIUM_ACCURACY = 40

export function getSegmentDifficulty(
  responseCount,
  accuracyPct
) {
  if (responseCount < SEGMENT_MIN_RESPONSES) {
    return 'insufficient_data'
  }

  if (accuracyPct >= SEGMENT_EASY_ACCURACY) {
    return 'easy'
  }

  if (accuracyPct >= SEGMENT_MEDIUM_ACCURACY) {
    return 'medium'
  }

  return 'hard'
}