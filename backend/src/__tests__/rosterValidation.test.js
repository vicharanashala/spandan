// Unit tests for roster CSV validation logic
// Pure-logic tests — no DB, no Mongoose, matching the existing test convention.

// We copy the pure functions under test directly here so tests have
// zero import-side-effects (same pattern as passwordService.test.js).

// ── Inline the pure helpers ───────────────────────────────────────────────────

const EMAIL_RE = /^\S+@\S+\.\S+$/

function parseCsvLine(line) {
  const fields = []
  let i = 0
  const len = line.length
  while (i <= len) {
    if (i === len) { fields.push(''); break }
    if (line[i] === '"') {
      i++
      let field = ''
      while (i < len) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') { field += '"'; i += 2 }
          else { i++; break }
        } else { field += line[i++] }
      }
      fields.push(field)
      if (i < len && line[i] === ',') i++
    } else {
      const start = i
      while (i < len && line[i] !== ',') i++
      fields.push(line.slice(start, i))
      if (i < len) i++
    }
  }
  return fields
}

function parseCsv(csvText) {
  const text = csvText.replace(/^\uFEFF/, '')
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const nonEmpty = lines.filter(l => l.trim() !== '')
  if (nonEmpty.length === 0) return []
  const headers = parseCsvLine(nonEmpty[0]).map(h => h.trim().toLowerCase())
  const records = []
  for (let i = 1; i < nonEmpty.length; i++) {
    const values = parseCsvLine(nonEmpty[i])
    const record = {}
    headers.forEach((header, idx) => { record[header] = (values[idx] || '').trim() })
    records.push(record)
  }
  return records
}

function parseCsvText(csvText) {
  if (!csvText || typeof csvText !== 'string') throw new Error('csvText must be a non-empty string')
  const records = parseCsv(csvText)
  if (records.length === 0) throw new Error('CSV file is empty or has no data rows')
  const entries = []
  const errors = []
  records.forEach((record, index) => {
    const rowNum = index + 2
    const name = (record['name'] || '').trim()
    const email = (record['email'] || '').trim().toLowerCase()
    if (!name) { errors.push({ row: rowNum, reason: 'Missing name' }); return }
    if (!email) { errors.push({ row: rowNum, reason: 'Missing email' }); return }
    if (!EMAIL_RE.test(email)) { errors.push({ row: rowNum, reason: `Invalid email format: ${email}` }); return }
    entries.push({ name, email })
  })
  return { entries, errors }
}

function deduplicateEntries(entries) {
  const seen = new Map()
  const unique = []
  const duplicates = []
  for (const entry of entries) {
    const key = entry.email.toLowerCase()
    if (seen.has(key)) { duplicates.push({ email: entry.email, reason: `Duplicate email: ${entry.email}` }) }
    else { seen.set(key, true); unique.push(entry) }
  }
  return { unique, duplicates }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Roster CSV Parsing', () => {
  describe('parseCsvText — happy path', () => {
    it('parses a minimal valid CSV', () => {
      const csv = 'name,email\nAlice,alice@example.com\nBob,bob@example.com'
      const { entries, errors } = parseCsvText(csv)
      expect(entries).toHaveLength(2)
      expect(errors).toHaveLength(0)
      expect(entries[0]).toEqual({ name: 'Alice', email: 'alice@example.com' })
      expect(entries[1]).toEqual({ name: 'Bob', email: 'bob@example.com' })
    })

    it('strips UTF-8 BOM from the start of the file', () => {
      const csv = '\uFEFFname,email\nAlice,alice@example.com'
      const { entries } = parseCsvText(csv)
      expect(entries).toHaveLength(1)
    })

    it('handles CRLF line endings', () => {
      const csv = 'name,email\r\nAlice,alice@example.com\r\nBob,bob@example.com'
      const { entries } = parseCsvText(csv)
      expect(entries).toHaveLength(2)
    })

    it('normalises email to lowercase', () => {
      const csv = 'name,email\nAlice,Alice@EXAMPLE.COM'
      const { entries } = parseCsvText(csv)
      expect(entries[0].email).toBe('alice@example.com')
    })

    it('handles case-insensitive column headers (Name, Email)', () => {
      const csv = 'Name,Email\nAlice,alice@example.com'
      const { entries } = parseCsvText(csv)
      expect(entries).toHaveLength(1)
    })

    it('trims whitespace from name and email fields', () => {
      const csv = 'name,email\n  Alice  ,  alice@example.com  '
      const { entries } = parseCsvText(csv)
      expect(entries[0].name).toBe('Alice')
      expect(entries[0].email).toBe('alice@example.com')
    })

    it('handles quoted fields containing commas', () => {
      const csv = 'name,email\n"Doe, John",john@example.com'
      const { entries } = parseCsvText(csv)
      expect(entries[0].name).toBe('Doe, John')
      expect(entries[0].email).toBe('john@example.com')
    })

    it('handles escaped double-quotes inside quoted fields', () => {
      const csv = 'name,email\n"Alice ""The Cat""",alice@example.com'
      const { entries } = parseCsvText(csv)
      expect(entries[0].name).toBe('Alice "The Cat"')
    })

    it('skips empty lines', () => {
      const csv = 'name,email\nAlice,alice@example.com\n\nBob,bob@example.com\n'
      const { entries } = parseCsvText(csv)
      expect(entries).toHaveLength(2)
    })
  })

  describe('parseCsvText — validation errors', () => {
    it('throws when csvText is empty', () => {
      expect(() => parseCsvText('')).toThrow()
    })

    it('throws when csvText is not a string', () => {
      expect(() => parseCsvText(null)).toThrow()
    })

    it('throws when CSV has only a header and no data rows', () => {
      expect(() => parseCsvText('name,email')).toThrow('empty or has no data rows')
    })

    it('reports missing name as an error', () => {
      const csv = 'name,email\n,alice@example.com'
      const { entries, errors } = parseCsvText(csv)
      expect(entries).toHaveLength(0)
      expect(errors[0].reason).toBe('Missing name')
      expect(errors[0].row).toBe(2)
    })

    it('reports missing email as an error', () => {
      const csv = 'name,email\nAlice,'
      const { entries, errors } = parseCsvText(csv)
      expect(entries).toHaveLength(0)
      expect(errors[0].reason).toBe('Missing email')
    })

    it('reports invalid email format as an error', () => {
      const csv = 'name,email\nAlice,not-an-email'
      const { entries, errors } = parseCsvText(csv)
      expect(entries).toHaveLength(0)
      expect(errors[0].reason).toContain('Invalid email format')
    })

    it('collects multiple row errors without stopping', () => {
      const csv = [
        'name,email',
        ',alice@example.com',   // missing name
        'Bob,not-an-email',     // bad email
        'Carol,carol@ok.com'    // valid
      ].join('\n')
      const { entries, errors } = parseCsvText(csv)
      expect(entries).toHaveLength(1)
      expect(entries[0].name).toBe('Carol')
      expect(errors).toHaveLength(2)
    })

    it('assigns correct 1-based row numbers in errors', () => {
      const csv = 'name,email\n,bad@email\nGood,good@email.com\n,also-bad@email'
      const { errors } = parseCsvText(csv)
      expect(errors.map(e => e.row)).toEqual([2, 4])
    })
  })
})

describe('Roster Deduplication', () => {
  it('passes through unique entries unchanged', () => {
    const entries = [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' }
    ]
    const { unique, duplicates } = deduplicateEntries(entries)
    expect(unique).toHaveLength(2)
    expect(duplicates).toHaveLength(0)
  })

  it('keeps first occurrence and flags subsequent duplicates', () => {
    const entries = [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Alice Again', email: 'alice@example.com' }
    ]
    const { unique, duplicates } = deduplicateEntries(entries)
    expect(unique).toHaveLength(1)
    expect(unique[0].name).toBe('Alice')
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].reason).toContain('Duplicate email')
  })

  it('treats emails as case-insensitive when deduplicating', () => {
    const entries = [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'ALICE', email: 'ALICE@EXAMPLE.COM' }
    ]
    const { unique, duplicates } = deduplicateEntries(entries)
    expect(unique).toHaveLength(1)
    expect(duplicates).toHaveLength(1)
  })

  it('handles an empty input list', () => {
    const { unique, duplicates } = deduplicateEntries([])
    expect(unique).toHaveLength(0)
    expect(duplicates).toHaveLength(0)
  })

  it('handles all-duplicate list (only first survives)', () => {
    const entries = [
      { name: 'A', email: 'same@x.com' },
      { name: 'B', email: 'same@x.com' },
      { name: 'C', email: 'same@x.com' }
    ]
    const { unique, duplicates } = deduplicateEntries(entries)
    expect(unique).toHaveLength(1)
    expect(duplicates).toHaveLength(2)
  })
})
