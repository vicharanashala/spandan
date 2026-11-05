// Run configuration: defaults, CLI flags (--name value) and environment overrides, validated.
// Pure (no I/O), so it is unit-tested.

export const DEFAULTS = Object.freeze({
  baseUrl: 'http://localhost:3001', // backend directly (no nginx); the prod proxy adds /spandan
  apiPrefix: '',                    // set to /spandan only when testing through the proxy
  students: 50,                     // safe default
  rampSeconds: 10,                  // spread student arrivals over this long
  polls: 3,                         // poll cycles the teacher launches
  durationSeconds: 0,               // 0 = run exactly `polls` cycles; >0 = keep cycling until this long
  answerSeconds: 15,                // each question's timeToAnswer
  gapSeconds: 5,                    // pause between one poll closing and the next launch
  answerRate: 1,                    // fraction of students who answer each poll
  settleSeconds: 25,                // after the last poll, wait this long for the leaderboard push
  password: 'LoadTest@123',         // seeded load-test password (backend LOADTEST_PASSWORD)
  serverMetrics: 'auto',            // read backend /internal/metrics if enabled: auto | require | off
  allowRemote: false,               // refuse non-local targets unless set
  confirmLarge: false               // required above LARGE_STUDENT_THRESHOLD
})

export const LIMITS = Object.freeze({ maxStudents: 5000, largeThreshold: 200 })

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

// name -> [env var, kind]
const OPTIONS = {
  baseUrl: ['LOADTEST_BASE_URL', 'string'],
  apiPrefix: ['LOADTEST_API_PREFIX', 'string'],
  students: ['LOADTEST_STUDENTS', 'int'],
  rampSeconds: ['LOADTEST_RAMP_SECONDS', 'number'],
  polls: ['LOADTEST_POLLS', 'int'],
  durationSeconds: ['LOADTEST_DURATION_SECONDS', 'number'],
  answerSeconds: ['LOADTEST_ANSWER_SECONDS', 'int'],
  gapSeconds: ['LOADTEST_GAP_SECONDS', 'number'],
  answerRate: ['LOADTEST_ANSWER_RATE', 'number'],
  settleSeconds: ['LOADTEST_SETTLE_SECONDS', 'number'],
  password: ['LOADTEST_PASSWORD', 'string'],
  serverMetrics: ['LOADTEST_SERVER_METRICS', 'string'],
  allowRemote: [null, 'flag'],
  confirmLarge: [null, 'flag']
}

const kebab = (s) => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase())
// CLI aliases so `--students 50 --ramp 10 --duration 120 --answer-time 15 --gap 5` all work.
const ALIASES = {
  ramp: 'rampSeconds', duration: 'durationSeconds', 'answer-time': 'answerSeconds',
  gap: 'gapSeconds', settle: 'settleSeconds', 'base-url': 'baseUrl', 'api-prefix': 'apiPrefix'
}

export function parseArgs(argv) {
  const out = {}
  const byFlag = {}
  for (const name of Object.keys(OPTIONS)) byFlag[kebab(name)] = name
  for (const [alias, name] of Object.entries(ALIASES)) byFlag[alias] = name

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') { out.help = true; continue }
    if (!a.startsWith('--')) throw new Error(`Unexpected argument "${a}". Use --help for options.`)
    const [flag, inline] = a.slice(2).split(/=(.*)/s)
    const name = byFlag[flag]
    if (!name) throw new Error(`Unknown option --${flag}. Use --help for options.`)
    if (OPTIONS[name][1] === 'flag') { out[name] = true; continue }
    const value = inline !== undefined ? inline : argv[++i]
    if (value === undefined || (inline === undefined && value.startsWith('--'))) {
      throw new Error(`--${flag} needs a value.`)
    }
    out[name] = value
  }
  return out
}

function coerce(name, raw, kind) {
  if (kind === 'string') return String(raw)
  if (kind === 'flag') return raw === true || raw === 'true' || raw === '1'
  const n = Number(raw)
  if (!Number.isFinite(n) || (kind === 'int' && !Number.isInteger(n))) {
    throw new Error(`--${kebab(name)} must be a ${kind === 'int' ? 'whole number' : 'number'} (got "${raw}").`)
  }
  return n
}

export function isLocalUrl(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname.toLowerCase())
  } catch {
    return false
  }
}

/** Build and validate the run config from CLI args (already parsed) and env. Throws on bad input. */
export function resolveConfig(cli = {}, env = {}) {
  const cfg = { ...DEFAULTS }
  for (const [name, [envName, kind]] of Object.entries(OPTIONS)) {
    if (cli[name] !== undefined) cfg[name] = coerce(name, cli[name], kind)
    else if (envName && env[envName] !== undefined && env[envName] !== '') cfg[name] = coerce(name, env[envName], kind)
  }

  cfg.baseUrl = cfg.baseUrl.replace(/\/+$/, '')
  cfg.apiPrefix = cfg.apiPrefix ? '/' + cfg.apiPrefix.replace(/^\/+|\/+$/g, '') : ''
  try { new URL(cfg.baseUrl) } catch { throw new Error(`--base-url is not a valid URL ("${cfg.baseUrl}").`) }

  const errs = []
  if (cfg.students < 1 || cfg.students > LIMITS.maxStudents) errs.push(`--students must be 1..${LIMITS.maxStudents}.`)
  if (cfg.rampSeconds < 0 || cfg.rampSeconds > 600) errs.push('--ramp must be 0..600 seconds.')
  if (cfg.polls < 1 || cfg.polls > 100) errs.push('--polls must be 1..100.')
  if (cfg.durationSeconds < 0 || cfg.durationSeconds > 3600) errs.push('--duration must be 0..3600 seconds.')
  // Server validates timeToAnswer per room setting as 0..300; a simulated student needs >= 5s to
  // think + jitter + submit inside the window.
  if (cfg.answerSeconds < 5 || cfg.answerSeconds > 300) errs.push('--answer-time must be 5..300 seconds.')
  if (cfg.gapSeconds < 0 || cfg.gapSeconds > 300) errs.push('--gap must be 0..300 seconds.')
  if (cfg.answerRate < 0 || cfg.answerRate > 1) errs.push('--answer-rate must be between 0 and 1.')
  if (cfg.settleSeconds < 0 || cfg.settleSeconds > 120) errs.push('--settle must be 0..120 seconds.')
  if (String(cfg.password).length < 6) errs.push('Password must be at least 6 characters.')
  if (!['auto', 'require', 'off'].includes(cfg.serverMetrics)) errs.push('--server-metrics must be auto, require or off.')
  if (errs.length) throw new Error(errs.join('\n'))

  if (!cfg.allowRemote && !isLocalUrl(cfg.baseUrl)) {
    throw new Error(
      `Refusing to load-test ${cfg.baseUrl}: only localhost targets are allowed by default.\n` +
      'Never point this at production. For an AUTHORIZED test server, pass --allow-remote.'
    )
  }
  if (cfg.students > LIMITS.largeThreshold && !cfg.confirmLarge) {
    throw new Error(
      `${cfg.students} students is above ${LIMITS.largeThreshold}. Larger runs can saturate this machine ` +
      'and the local server; re-run with --confirm-large if you mean it.'
    )
  }

  // With --duration and no explicit --polls, keep cycling polls until the duration is used up.
  cfg.pollsExplicit = cli.polls !== undefined || (env.LOADTEST_POLLS !== undefined && env.LOADTEST_POLLS !== '')
  cfg.maxPolls = cfg.durationSeconds > 0 && !cfg.pollsExplicit ? 100 : cfg.polls

  cfg.api = `${cfg.baseUrl}${cfg.apiPrefix}/api`
  cfg.socketPath = `${cfg.apiPrefix}/socket.io`
  return cfg
}

export const HELP = `Spandan load simulator (local / authorized test environments only)

Usage: npm start -- [options]

  --students N         simulated students (default ${DEFAULTS.students}; >${LIMITS.largeThreshold} needs --confirm-large)
  --ramp S             spread student arrivals over S seconds (default ${DEFAULTS.rampSeconds})
  --polls N            poll cycles to run (default ${DEFAULTS.polls})
  --duration S         keep cycling polls until S seconds have passed (default off)
  --answer-time S      each poll's time to answer, 5..300 (default ${DEFAULTS.answerSeconds})
  --gap S              pause between polls (default ${DEFAULTS.gapSeconds})
  --answer-rate F      fraction of students answering each poll, 0..1 (default ${DEFAULTS.answerRate})
  --settle S           wait after the last poll for the leaderboard push (default ${DEFAULTS.settleSeconds})
  --base-url URL       backend URL (default ${DEFAULTS.baseUrl})
  --api-prefix P       path prefix, e.g. /spandan behind the nginx proxy (default none)
  --password P         seeded load-test password (default ${DEFAULTS.password})
  --server-metrics M   read backend /internal/metrics (needs SERVER_METRICS=on): auto | require | off (default auto)
  --allow-remote       allow a non-localhost target (authorized test servers only, never production)
  --confirm-large      allow more than ${LIMITS.largeThreshold} students

Every option also reads an env var: LOADTEST_STUDENTS, LOADTEST_RAMP_SECONDS, LOADTEST_POLLS, ...
Seed accounts first: (cd ../backend && npm run seed:loadtest -- --students N)
`
