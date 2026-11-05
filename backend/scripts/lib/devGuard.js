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
