/**
 * Shared safety checks for development-only scripts that write to the database
 * (seed_dev_users.js, seed_loadtest.js).
 *
 * A script must refuse to run when:
 *   - NODE_ENV is "production", or
 *   - MONGODB_URI points at any non-local host, unless the caller passes --allow-remote, or
 *   - MONGODB_URI cannot be parsed (fail closed rather than guess).
 *
 * Pure functions with no side effects, so they are unit-tested directly.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

// Hostnames from a mongodb:// or mongodb+srv:// URI (credentials and port stripped), or null.
export const uriHosts = (uri) => {
  const m = String(uri || '').match(/^mongodb(\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/)
  if (!m) return null
  if (m[1]) return [m[2].toLowerCase()] // +srv is always a DNS name, never local
  return m[2].split(',').map(h => h.replace(/:\d+$/, '').toLowerCase())
}

// Credentials are never printed.
export const redact = (uri) => String(uri || '').replace(/\/\/[^@/]*@/, '//***@')

/** The hosts in the URI that are not this machine ([] when every host is local or it cannot be parsed). */
export const remoteHosts = (uri) => (uriHosts(uri) || []).filter(h => !LOCAL_HOSTS.has(h))

/**
 * Database name from the URI path, as the driver would use it: "test" when the URI names none.
 * null when the name cannot be decoded (fail closed).
 */
export const uriDbName = (uri) => {
  const m = String(uri || '').match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?[^/?]+\/?([^?]*)/)
  if (!m) return null
  try {
    return decodeURIComponent(m[1]) || 'test'
  } catch {
    return null
  }
}

// Words that mark a production deployment, matched as whole tokens of a database or host name
// (split on punctuation and camelCase), so "spandan-prod", "prodDb", "live.cluster" match but
// "product" or "delivery" do not.
const PRODUCTION_WORDS = new Set(['prod', 'production', 'prd', 'live'])
export const looksLikeProduction = (name) =>
  String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some(t => PRODUCTION_WORDS.has(t))

/** One line naming the target, for printing BEFORE anything is written. Never includes credentials. */
export function describeTarget(uri) {
  const hosts = uriHosts(uri)
  const remote = remoteHosts(uri)
  return `hosts ${hosts ? hosts.join(', ') : '(unparseable)'}; database "${uriDbName(uri) ?? '(unparseable)'}"` +
    (remote.length ? '  [REMOTE]' : '  [local]')
}

/**
 * Extra checks before WRITING to a non-local database (reached only after assertDevDatabase passed
 * with --allow-remote). A no-op for a local URI. Throws, before any connection is made, when:
 *   - the database or a host name looks like production (no override: rename a dev database instead),
 *   - requirePassword is set and the password is missing or the publicly documented default,
 *   - the caller did not confirm with --yes.
 */
export function assertRemoteWriteAllowed({
  uri, confirmed = false, action = 'seed', command = '',
  requirePassword = false, password = '', defaultPassword = '', passwordEnv = 'the password env var'
}) {
  const remote = remoteHosts(uri)
  if (!remote.length) return
  const db = uriDbName(uri)
  if (!db) throw new Error(`Refusing to ${action}: cannot read the database name from MONGODB_URI (${redact(uri)}).`)
  const prodLike = [db, ...remote].filter(looksLikeProduction)
  if (prodLike.length) {
    throw new Error(
      `Refusing to ${action}: ${prodLike.map(n => `"${n}"`).join(', ')} looks like a production database or host.\n` +
      'Load-test data must only go to a development database.'
    )
  }
  if (requirePassword && (!password || password === defaultPassword)) {
    throw new Error(
      `Refusing to ${action} a remote database with the default load-test password (it is published in the README).\n` +
      `Set ${passwordEnv} to a different, private value first.`
    )
  }
  if (!confirmed) {
    throw new Error(
      `Refusing to ${action} a remote database without explicit confirmation.\n` +
      `Target: ${describeTarget(uri)}\n` +
      `If this is definitely a development database, re-run with: ${command ? `${command} -- ` : ''}--allow-remote --yes`
    )
  }
}

/**
 * After connecting, before any write: the database actually selected must be exactly the one the URI
 * names (the one every earlier check judged), and must not look like production. Fail closed: if the
 * expected name is unknown or the names differ, refuse.
 */
export function assertConnectedDbAllowed(dbName, { action = 'seed', expected } = {}) {
  if (typeof expected !== 'string' || !expected) {
    throw new Error(`Refusing to ${action}: cannot verify the connected database (no expected database name from MONGODB_URI).`)
  }
  if (dbName !== expected) {
    throw new Error(`Refusing to ${action}: connected to database "${dbName}", but MONGODB_URI names "${expected}".`)
  }
  if (looksLikeProduction(dbName)) {
    throw new Error(`Refusing to ${action}: the connected database "${dbName}" looks like production.`)
  }
}

/**
 * Throws an Error describing why the script must not run; returns nothing when it is safe.
 * @param {object} opts
 * @param {string} opts.uri          MONGODB_URI the script will connect to
 * @param {boolean} opts.allowRemote true when the caller passed --allow-remote
 * @param {string} [opts.nodeEnv]    process.env.NODE_ENV
 * @param {string} [opts.action]     verb used in messages, e.g. "seed" or "clean"
 * @param {string} [opts.command]    command to suggest for --allow-remote
 */
export function assertDevDatabase({ uri, allowRemote = false, nodeEnv = '', action = 'seed', command = '' }) {
  if (String(nodeEnv || '').toLowerCase() === 'production') {
    throw new Error(`Refusing to ${action}: NODE_ENV is "production". This script is for development only.`)
  }
  const hosts = uriHosts(uri)
  if (!hosts) throw new Error(`Refusing to ${action}: cannot parse MONGODB_URI (${redact(uri)}).`)
  const remote = hosts.filter(h => !LOCAL_HOSTS.has(h))
  if (remote.length && !allowRemote) {
    throw new Error(
      `Refusing to ${action}: MONGODB_URI points at a non-local host (${remote.join(', ')}).\n` +
      'If this is definitely a development database, re-run with: ' +
      (command ? `${command} -- --allow-remote` : '--allow-remote')
    )
  }
}
