// Invalid, missing, or malformed email input returns an empty string rather than throwing.
// For local parts shorter than four characters, mask the entire local part to avoid exposing it.
export function maskEmail(email) {
  if (typeof email !== 'string') return ''

  const trimmed = email.trim()
  const at = trimmed.indexOf('@')
  if (at <= 0 || at !== trimmed.lastIndexOf('@') || at === trimmed.length - 1) return ''

  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  if (local.length < 4) return `***@${domain}`

  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`
}
