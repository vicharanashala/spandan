/**
 * start-local-mongo.js
 * Starts a local MongoDB instance using mongodb-memory-server
 * and sets MONGODB_URI before launching the backend server.
 *
 * Usage: node start-local-mongo.js
 */

import { MongoMemoryServer } from 'mongodb-memory-server'
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Use a persistent data directory so data survives restarts
const dbPath = path.join(__dirname, '.local-mongo-data')
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true })
  console.log(`📁 Created local MongoDB data directory: ${dbPath}`)
}

console.log('🍃 Starting local MongoDB...')

const mongod = await MongoMemoryServer.create({
  instance: {
    port: 27017,
    dbName: 'spandan',
    dbPath: dbPath,
    storageEngine: 'wiredTiger',
  },
})

const uri = mongod.getUri()
console.log(`✅ Local MongoDB running at: ${uri}`)
console.log(`📂 Data stored at: ${dbPath}`)

// Set the env var for the child process
process.env.MONGODB_URI = uri

console.log('🚀 Starting Spandan backend...\n')

// Start the actual backend
const backend = spawn('node', ['--watch', 'src/index.js'], {
  cwd: __dirname,
  env: { ...process.env, MONGODB_URI: uri },
  stdio: 'inherit',
  shell: false,
})

backend.on('exit', async (code) => {
  console.log(`\nBackend exited with code ${code}. Stopping MongoDB...`)
  await mongod.stop()
  process.exit(code ?? 0)
})

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down...`)
  backend.kill('SIGTERM')
  await mongod.stop()
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
