import RoomRoster from '../models/RoomRoster.js'

// ── Email regex (same pattern as User.js schema) ──────────────────────────────
const EMAIL_RE = /^\S+@\S+\.\S+$/

// ── Built-in CSV parser ────────────────────────────────────────────────────────
// Handles: quoted fields, commas inside quotes, CRLF + LF, UTF-8 BOM.
// No external dependencies.

/**
 * Parse a single CSV line into an array of field strings.
 * Respects double-quoted fields (RFC 4180 compliant for basic quoting).
 */
function parseCsvLine(line) {
  const fields = []
  let i = 0
  const len = line.length

  while (i <= len) {
    // End of line — push whatever we have (handles trailing commas)
    if (i === len) {
      fields.push('')
      break
    }

    if (line[i] === '"') {
      // Quoted field
      i++ // skip opening quote
      let field = ''
      while (i < len) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            // Escaped quote ""
            field += '"'
            i += 2
          } else {
            // Closing quote
            i++
            break
          }
        } else {
          field += line[i++]
        }
      }
      fields.push(field)
      // Skip comma separator
      if (i < len && line[i] === ',') i++
    } else {
      // Unquoted field — read until comma or end
      let start = i
      while (i < len && line[i] !== ',') i++
      fields.push(line.slice(start, i))
      if (i < len) i++ // skip comma
    }
  }

  return fields
}

/**
 * Parse raw CSV text into an array of plain objects keyed by lowercased headers.
 * Strips UTF-8 BOM, handles CRLF and LF, skips empty lines.
 */
function parseCsv(csvText) {
  // Strip UTF-8 BOM if present
  const text = csvText.replace(/^\uFEFF/, '')

  // Normalise line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  // Filter empty lines
  const nonEmpty = lines.filter(l => l.trim() !== '')
  if (nonEmpty.length === 0) return []

  // First row is the header
  const headers = parseCsvLine(nonEmpty[0]).map(h => h.trim().toLowerCase())

  const records = []
  for (let i = 1; i < nonEmpty.length; i++) {
    const values = parseCsvLine(nonEmpty[i])
    const record = {}
    headers.forEach((header, idx) => {
      record[header] = (values[idx] || '').trim()
    })
    records.push(record)
  }

  return records
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse raw CSV text into roster entry objects.
 * Expected columns (case-insensitive): name, email
 * Returns { entries: [{name, email}], errors: [{row, reason}] }
 */
export function parseCsvText(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    throw new Error('csvText must be a non-empty string')
  }

  let records
  try {
    records = parseCsv(csvText)
  } catch (err) {
    throw new Error(`CSV parse error: ${err.message}`)
  }

  if (records.length === 0) {
    throw new Error('CSV file is empty or has no data rows')
  }

  const entries = []
  const errors = []

  records.forEach((record, index) => {
    const rowNum = index + 2 // row 1 is header

    const name = (record['name'] || '').trim()
    const email = (record['email'] || '').trim().toLowerCase()

    if (!name) {
      errors.push({ row: rowNum, reason: 'Missing name' })
      return
    }
    if (!email) {
      errors.push({ row: rowNum, reason: 'Missing email' })
      return
    }
    if (!EMAIL_RE.test(email)) {
      errors.push({ row: rowNum, reason: `Invalid email format: ${email}` })
      return
    }

    entries.push({ name, email })
  })

  return { entries, errors }
}

/**
 * Deduplicate entries by email (case-insensitive).
 * First occurrence wins; subsequent duplicates are returned as errors.
 */
export function deduplicateEntries(entries) {
  const seen = new Map()
  const unique = []
  const duplicates = []

  for (const entry of entries) {
    const key = entry.email.toLowerCase()
    if (seen.has(key)) {
      duplicates.push({ email: entry.email, reason: `Duplicate email: ${entry.email}` })
    } else {
      seen.set(key, true)
      unique.push(entry)
    }
  }

  return { unique, duplicates }
}

/**
 * Upload (upsert) a roster for a room.
 * Replaces the entire entry list with the validated unique entries.
 * Returns { saved: [{name, email, invited}], skipped: [{row?, reason}] }
 */
export async function uploadRoster(roomId, csvText) {
  const { entries, errors } = parseCsvText(csvText)
  const { unique, duplicates } = deduplicateEntries(entries)

  const allSkipped = [
    ...errors,
    ...duplicates.map(d => ({ reason: d.reason }))
  ]

  const rosterEntries = unique.map(e => ({
    name: e.name,
    email: e.email,
    invited: false
  }))

  // Upsert: one RoomRoster document per room
  const roster = await RoomRoster.findOneAndUpdate(
    { roomId },
    { roomId, entries: rosterEntries },
    { upsert: true, new: true }
  )

  return { saved: roster.entries, skipped: allSkipped }
}

/**
 * Fetch the roster for a room (returns null if none uploaded yet).
 */
export async function getRoster(roomId) {
  return RoomRoster.findOne({ roomId })
}

/**
 * Mark all entries as invited for a given room.
 */
export async function markAllInvited(roomId) {
  const roster = await RoomRoster.findOne({ roomId })
  if (!roster) throw new Error('No roster found for this room')

  roster.entries = roster.entries.map(entry => ({
    ...entry.toObject(),
    invited: true
  }))
  await roster.save()
  return roster
}
