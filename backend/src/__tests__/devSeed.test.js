// Development seed (backend/scripts/seed_dev_users.js): which password each account gets and the
// guards before connecting. Pure functions: nothing here touches a database.
import {
  DEV_ACCOUNTS, DEFAULT_SEED_PASSWORD, SEED_COMMAND, passwordFor, checkDevSeedTarget
} from '../../scripts/lib/devSeed.js'

const LOCAL = 'mongodb://localhost:27017/spandan'
const REMOTE = 'mongodb://admin:secret@dev-db.example.com:27017/spandan_dev'
const PRIVATE = 'A-private-seed-pw'
const FIXED = ['Teacher@123', 'Teacher@456', 'Student@123', 'Student@456']

describe('dev seed accounts', () => {
  it('keeps the 4 teachers and 10 students, four of them with the documented fixed passwords', () => {
    expect(DEV_ACCOUNTS).toHaveLength(14)
    expect(DEV_ACCOUNTS.filter(a => a.role === 'teacher')).toHaveLength(4)
    expect(DEV_ACCOUNTS.filter(a => a.password).map(a => a.password).sort()).toEqual([...FIXED].sort())
    expect(Object.isFrozen(DEV_ACCOUNTS) && DEV_ACCOUNTS.every(Object.isFrozen)).toBe(true)
  })
})

describe('passwordFor', () => {
  it('locally: fixed passwords unchanged, the rest use SEED_PASSWORD (or its default)', () => {
    const local = DEV_ACCOUNTS.map(a => passwordFor(a, { remote: false, seedPassword: DEFAULT_SEED_PASSWORD }))
    expect(local.slice(0, 2)).toEqual(['Teacher@123', 'Teacher@456'])
    expect(local[2]).toBe(DEFAULT_SEED_PASSWORD)
    expect(local.slice(4, 6)).toEqual(['Student@123', 'Student@456'])
    expect(passwordFor(DEV_ACCOUNTS[9], { remote: false, seedPassword: PRIVATE })).toBe(PRIVATE)
  })

  it('remote: EVERY account uses SEED_PASSWORD; no fixed password is ever used', () => {
    const remote = DEV_ACCOUNTS.map(a => passwordFor(a, { remote: true, seedPassword: PRIVATE }))
    expect(new Set(remote)).toEqual(new Set([PRIVATE]))
    for (const p of FIXED) expect(remote).not.toContain(p)
  })
})

describe('checkDevSeedTarget', () => {
  const check = (over = {}) => () => checkDevSeedTarget({ uri: REMOTE, allowRemote: true, confirmed: true, seedPassword: PRIVATE, ...over })

  it('local: allowed exactly as before (no flags, default password)', () => {
    expect(checkDevSeedTarget({ uri: LOCAL, seedPassword: DEFAULT_SEED_PASSWORD }))
      .toEqual({ remote: false, target: 'hosts localhost; database "spandan"  [local]' })
  })

  it('refuses NODE_ENV=production, locally too', () => {
    expect(() => checkDevSeedTarget({ uri: LOCAL, nodeEnv: 'production', seedPassword: PRIVATE })).toThrow(/production/)
  })

  it('remote needs --allow-remote', () => {
    expect(check({ allowRemote: false })).toThrow(/non-local host[\s\S]*npm run seed:dev -- --allow-remote/)
  })

  it('remote needs --yes, naming the target and the full command', () => {
    expect(check({ confirmed: false })).toThrow(/without explicit confirmation[\s\S]*"spandan_dev"[\s\S]*npm run seed:dev -- --allow-remote --yes/)
    expect(SEED_COMMAND).toBe('npm run seed:dev')
  })

  it('remote needs a non-default SEED_PASSWORD', () => {
    expect(check({ seedPassword: DEFAULT_SEED_PASSWORD })).toThrow(/default load-test password[\s\S]*SEED_PASSWORD/)
    expect(check({ seedPassword: '' })).toThrow(/SEED_PASSWORD/)
  })

  it('remote refuses production-looking databases and hosts, even when fully confirmed', () => {
    expect(check({ uri: 'mongodb://dev-db.example.com/spandan_prod' })).toThrow(/looks like a production/)
    expect(check({ uri: 'mongodb://live-db.example.com/spandan' })).toThrow(/looks like a production/)
  })

  it('remote with every requirement met is allowed, and the target never shows credentials', () => {
    const out = check()()
    expect(out).toEqual({ remote: true, target: 'hosts dev-db.example.com; database "spandan_dev"  [REMOTE]' })
    expect(out.target).not.toContain('secret')
  })
})
