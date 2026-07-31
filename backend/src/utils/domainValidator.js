import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Resolves the path to allowed_domains.txt file.
 */
export function getDomainFilePath(customPath) {
  if (customPath && fs.existsSync(customPath)) return customPath
  if (process.env.ALLOWED_DOMAINS_FILE && fs.existsSync(process.env.ALLOWED_DOMAINS_FILE)) {
    return process.env.ALLOWED_DOMAINS_FILE
  }

  const candidates = [
    path.resolve(process.cwd(), 'allowed_domains.txt'),
    path.resolve(process.cwd(), 'backend/allowed_domains.txt'),
    path.resolve(__dirname, '../../allowed_domains.txt'),
    path.resolve(__dirname, '../allowed_domains.txt')
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  // Default fallback candidate path
  return candidates[2]
}

/**
 * Parses a single line from domain file into a RegExp pattern.
 */
export function parseDomainLineToRegex(line) {
  if (!line || typeof line !== 'string') return null
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null

  try {
    // 1. Literal regex format: /pattern/flags
    if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
      const lastSlash = trimmed.lastIndexOf('/')
      const pattern = trimmed.slice(1, lastSlash)
      const flags = trimmed.slice(lastSlash + 1) || 'i'
      return new RegExp(pattern, flags)
    }

    // 2. Explicit regex pattern with anchors
    if (trimmed.startsWith('^') || trimmed.endsWith('$')) {
      return new RegExp(trimmed, 'i')
    }

    // 3. Domain or wildcard pattern (e.g. gmail.com or *.edu.in)
    let cleanDomain = trimmed.replace(/^\*\./, '')
    const escaped = cleanDomain.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&')
    return new RegExp(`^(?:[a-zA-Z0-9-]+\\.)*${escaped}$`, 'i')
  } catch (err) {
    console.error(`[domainValidator] Invalid domain regex pattern "${trimmed}":`, err.message)
    return null
  }
}

/**
 * Reads domain file and compiles regex patterns.
 */
export function getAllowedDomainRegexes(filePath) {
  const targetPath = getDomainFilePath(filePath)

  try {
    if (!fs.existsSync(targetPath)) {
      return null
    }

    const content = fs.readFileSync(targetPath, 'utf-8')
    const lines = content.split(/\r?\n/)
    const regexes = []

    for (const line of lines) {
      const regex = parseDomainLineToRegex(line)
      if (regex) regexes.push(regex)
    }

    return regexes
  } catch (error) {
    console.error('[domainValidator] Error reading allowed domains file:', error.message)
    return null
  }
}

/**
 * Validates if an email's domain matches any allowed domain regex from file.
 */
export function isDomainAllowed(email, filePath) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return false
  }

  const parts = email.trim().split('@')
  if (parts.length < 2) return false
  const domain = parts.pop().toLowerCase().trim()
  if (!domain) return false

  const regexes = getAllowedDomainRegexes(filePath)

  // If no allowed domains file or rules found, allow by default
  if (!regexes || regexes.length === 0) {
    return true
  }

  return regexes.some(regex => regex.test(domain))
}
