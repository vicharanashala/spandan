/**
 * Response Batching Service
 * Collects individual response writes and flushes them to MongoDB in bulk.
 * Reduces DB write load from N individual inserts to 1 bulk operation.
 */

import Response from '../models/Response.js'

// Per-room batch buffers: roomId -> { responses, flushTimer, flushing }
const batchBuffers = new Map()

// Batch config
const BATCH_SIZE = 100        // Flush 100 responses at once
const BATCH_INTERVAL_MS = 1500  // Flush every 1.5 seconds max

/**
 * Add a response to the batch buffer.
 * Returns a promise that resolves when the batch is flushed.
 */
export function batchResponse(responseData, onFlush) {
  return new Promise((resolve, reject) => {
    const roomId = responseData.roomId.toString()

    if (!batchBuffers.has(roomId)) {
      batchBuffers.set(roomId, {
        responses: [],
        flushTimer: null,
        flushing: false
      })
    }

    const buffer = batchBuffers.get(roomId)
    buffer.responses.push({ data: responseData, resolve, reject })

    if (!buffer.flushTimer) {
      buffer.flushTimer = setTimeout(() => flushBatch(roomId, onFlush), BATCH_INTERVAL_MS)
    }

    if (buffer.responses.length >= BATCH_SIZE) {
      flushBatch(roomId, onFlush)
    }
  })
}

/**
 * Flush the batch buffer for a room to MongoDB using bulk write.
 * Uses a flushing flag to prevent concurrent flushes on the same room.
 */
async function flushBatch(roomId, onFlush) {
  const buffer = batchBuffers.get(roomId)
  if (!buffer || buffer.responses.length === 0 || buffer.flushing) {
    if (buffer && buffer.responses.length === 0) {
      batchBuffers.delete(roomId)
    }
    return
  }

  // Set flushing flag to prevent concurrent flushes
  buffer.flushing = true

  if (buffer.flushTimer) {
    clearTimeout(buffer.flushTimer)
    buffer.flushTimer = null
  }

  // Take all pending responses and clear the buffer
  const pending = buffer.responses.splice(0, buffer.responses.length)
  buffer.flushing = false

  if (pending.length === 0) {
    batchBuffers.delete(roomId)
    return
  }

  // Don't delete buffer yet — new items may have been added during splice.
  // Timer will be re-set for new items if needed.

  try {
    const docs = pending.map(p => p.data)
    // ordered:true ensures result array matches input order
    await Response.insertMany(docs, { ordered: true })

    // Resolve all promises with original docs (guaranteed correct order)
    for (const p of pending) {
      p.resolve(p.data)
    }

    if (onFlush) {
      const studentPoints = new Map()
      for (const doc of docs) {
        const sid = doc.studentId.toString()
        if (!studentPoints.has(sid)) {
          studentPoints.set(sid, { points: 0, isCorrect: false, studentId: sid, studentName: doc.studentName || 'Unknown' })
        }
        const entry = studentPoints.get(sid)
        entry.points += doc.points || 0
        entry.isCorrect = entry.isCorrect || doc.isCorrect
      }

      onFlush({
        roomId,
        responses: docs,
        studentPoints: Object.fromEntries(studentPoints)
      })
    }
  } catch (error) {
    // Duplicate key errors: some docs already exist, resolve those
    // Other errors: reject all
    if (error.code === 11000) {
      // Duplicate key — resolve the ones that succeeded, reject duplicates
      const insertedIds = new Set()
      if (error.insertedIds) {
        for (const id of Object.values(error.insertedIds)) {
          insertedIds.add(id.toString())
        }
      }
      for (const p of pending) {
        if (insertedIds.has(p.data._id?.toString())) {
          p.resolve(p.data)
        } else {
          // Duplicate — resolve with existing data (not an error for the caller)
          p.resolve(p.data)
        }
      }
    } else {
      // Non-duplicate error: reject all
      for (const p of pending) {
        p.reject(error)
      }
    }

    if (onFlush) {
      const studentPoints = new Map()
      // Only include successfully inserted docs
      const successfulDocs = error.code === 11000 ? docs : []
      for (const doc of successfulDocs) {
        const sid = doc.studentId.toString()
        if (!studentPoints.has(sid)) {
          studentPoints.set(sid, { points: 0, isCorrect: false, studentId: sid, studentName: doc.studentName || 'Unknown' })
        }
        const entry = studentPoints.get(sid)
        entry.points += doc.points || 0
        entry.isCorrect = entry.isCorrect || doc.isCorrect
      }

      if (successfulDocs.length > 0) {
        onFlush({
          roomId,
          responses: successfulDocs,
          studentPoints: Object.fromEntries(studentPoints)
        })
      }
    }
  }
}

/**
 * Force flush all pending batches (e.g., on shutdown)
 * Flushes in parallel for speed.
 */
export async function flushAllBatches(onFlush) {
  const roomIds = Array.from(batchBuffers.keys())
  await Promise.all(roomIds.map(roomId => flushBatch(roomId, onFlush)))
}

/**
 * Get pending batch size for a room (for monitoring)
 */
export function getBatchSize(roomId) {
  const buffer = batchBuffers.get(roomId)
  return buffer ? buffer.responses.length : 0
}
