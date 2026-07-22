const { spawnSync } = require('child_process')
const path = require('path')

process.env.NODE_ENV = process.env.NODE_ENV || 'test'

// These are read by mongodb-memory-server before it tries to download binaries.
// Tests no longer start memory-server by default, but keeping these defaults
// makes opt-in integration runs deterministic in restricted environments.
process.env.MONGOMS_DISABLE_POSTINSTALL = process.env.MONGOMS_DISABLE_POSTINSTALL || '1'
process.env.MONGOMS_RUNTIME_DOWNLOAD = process.env.MONGOMS_RUNTIME_DOWNLOAD || 'false'

if (process.env.npm_lifecycle_event === 'test:localdb') {
  process.env.TEST_MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/spandan_test'
}

if (process.env.MONGOMS_SYSTEM_BINARY) {
  process.env.MONGOMS_SYSTEM_BINARY = path.resolve(process.env.MONGOMS_SYSTEM_BINARY)
}

const jestBin = require.resolve('jest/bin/jest')
const nodeArgs = ['--experimental-vm-modules', jestBin, ...process.argv.slice(2)]
const result = spawnSync(process.execPath, nodeArgs, {
  stdio: 'inherit',
  env: process.env
})

process.exit(result.status ?? 1)
