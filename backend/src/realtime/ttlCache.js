// Minimal generic TTL cache.
//
// The pattern this solves shows up repeatedly at classroom scale: a live
// quiz question is read-mostly for the ~30 seconds students are answering
// it, but without caching, every one of 3000 students answering fires its
// own identical `findById` for that question. A tiny TTL cache turns
// "3000 identical reads" into "1 read + 2999 memory hits" with no
// meaningful staleness risk, since the underlying data doesn't change on
// that timescale.
export class TTLCache {
  constructor(ttlMs) {
    this.ttlMs = ttlMs
    this.map = new Map()
  }

  get(key) {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key, value, ttlMs = this.ttlMs) {
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  delete(key) {
    this.map.delete(key)
  }

  clear() {
    this.map.clear()
  }

  sweep() {
    const now = Date.now()
    for (const [key, entry] of this.map) {
      if (entry.expiresAt < now) this.map.delete(key)
    }
  }
}
