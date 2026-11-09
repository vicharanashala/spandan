// Per-IP rate-limit maximums for the Express limiters in index.js.
//
// Each can be overridden from the environment; when the variable is unset or not a positive whole
// number, the built-in default below is used, so production behaviour is unchanged unless a value
// is explicitly configured. The main reason to override is local load testing, where every
// simulated student comes from ONE IP and would otherwise hit these caps (429) long before the
// server itself is under real strain. Never raise them in production without a reason.

export const DEFAULT_RATE_LIMITS = Object.freeze({
  api: 50000,         // general /api/ requests per 15 min
  authFailures: 5000, // FAILED auth attempts per hour (successful logins are not counted)
  responses: 5000,    // answer submissions per 15 min
  leaderboard: 10000  // leaderboard reads per 15 min
})

export const RATE_LIMIT_ENV = Object.freeze({
  api: 'API_RATE_LIMIT_MAX',
  authFailures: 'AUTH_RATE_LIMIT_MAX',
  responses: 'RESPONSE_RATE_LIMIT_MAX',
  leaderboard: 'LEADERBOARD_RATE_LIMIT_MAX'
})

// A positive whole number from the environment, or the default.
export const positiveIntOr = (raw, fallback) => {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : fallback
}

export function resolveRateLimits(env = process.env) {
  const out = {}
  for (const [key, name] of Object.entries(RATE_LIMIT_ENV)) {
    out[key] = positiveIntOr(env[name], DEFAULT_RATE_LIMITS[key])
  }
  return out
}
