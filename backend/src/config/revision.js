/**
 * Revision Suggestions — configurable thresholds.
 * Change DEFAULT_WRONG_THRESHOLD here to adjust classification globally.
 * Teachers can also override per-request via ?threshold=60
 */
export const DEFAULT_WRONG_THRESHOLD = 50

/** Minimum wrong count to classify as "Provide notes" (avoids noise on tiny classes) */
export const MIN_WRONG_FOR_NOTES = 1
