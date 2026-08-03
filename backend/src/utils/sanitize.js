/**
 * Simple XSS sanitization for user text inputs
 * Escapes HTML special characters to prevent XSS attacks
 */

const escapeHtml = (str) => {
  if (typeof str !== 'string') return str
  
  const htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '`': '&#x60;'
  }
  
  return str.replace(/[&<>"'`]/g, (char) => htmlEscapes[char] || char)
}

const unescapeHtml = (str) => {
  if (typeof str !== 'string') return str
  
  const htmlUnescapes = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#x60;': '`'
  }
  
  return str.replace(/&(amp|lt|gt|quot|#x27|#x60);/g, (match) => htmlUnescapes[match] || match)
}

/**
 * Sanitize a string for safe display
 * @param {string} input - The input string to sanitize
 * @returns {string} - Sanitized string safe for HTML display
 */
export const sanitize = (input) => {
  if (input == null) return input
  return escapeHtml(String(input))
}

/**
 * Sanitize an object's string values recursively
 * @param {object} obj - The object to sanitize
 * @returns {object} - Sanitized object
 */
export const sanitizeObject = (obj) => {
  if (obj == null) return obj
  
  if (typeof obj === 'string') {
    return sanitize(obj)
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item))
  }
  
  if (typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObject(value)
    }
    return result
  }
  
  return obj
}

/**
 * Strip all HTML tags from a string
 * @param {string} input - The input string
 * @returns {string} - String without HTML tags
 */
export const stripHtml = (input) => {
  if (input == null) return input
  return String(input).replace(/<[^>]*>/g, '')
}

/**
 * Recursively strip HTML tags from an object's string values.
 * Unlike sanitizeObject (which HTML-escapes to entities), this keeps the
 * text as-is — quotes, apostrophes, etc. are preserved — and only removes
 * actual <...> tags. Safe because the frontend renders all text as React
 * text nodes (auto-escaped at render time), so no entity-encoding is needed.
 * @param {object} obj - The object to strip
 * @returns {object} - Object with tag-free string values
 */
export const stripObject = (obj) => {
  if (obj == null) return obj

  if (typeof obj === 'string') {
    return stripHtml(obj)
  }

  if (Array.isArray(obj)) {
    return obj.map(item => stripObject(item))
  }

  if (typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = stripObject(value)
    }
    return result
  }

  return obj
}

export default { sanitize, sanitizeObject, stripHtml, stripObject }