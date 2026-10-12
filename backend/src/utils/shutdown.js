// Centralized graceful shutdown coordinator for Spandan backend services.
// Coordinates async flushes (responseBuffer, chatService, etc.) concurrently via
// Promise.allSettled and ensures only ONE single process.exit(0) is executed after
// all registered cleanup tasks finish, avoiding hook collisions.

const shutdownTasks = new Map() // name -> async function
let shutdownInitiated = false
let signalRegistered = false

export function registerShutdownTask(name, fn) {
  shutdownTasks.set(name, fn)
  ensureSignalListeners()
}

function ensureSignalListeners() {
  if (signalRegistered) return
  signalRegistered = true

  const graceful = async (signal) => {
    if (shutdownInitiated) return
    shutdownInitiated = true

    // Safety timeout: never hang shutdown longer than 2000ms
    const force = setTimeout(() => {
      console.error(`[shutdown] Force exit timeout reached after ${signal}`)
      process.exit(0)
    }, 2000)

    try {
      const promises = Array.from(shutdownTasks.entries()).map(async ([taskName, taskFn]) => {
        try {
          await taskFn()
        } catch (e) {
          console.error(`[shutdown] Error in task "${taskName}":`, e?.message)
        }
      })
      await Promise.allSettled(promises)
    } finally {
      clearTimeout(force)
      process.exit(0)
    }
  }

  process.once('SIGTERM', () => graceful('SIGTERM'))
  process.once('SIGINT', () => graceful('SIGINT'))
}
