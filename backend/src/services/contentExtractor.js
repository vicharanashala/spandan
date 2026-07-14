import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import Tesseract from 'tesseract.js'

export async function extractTextFromPDF(buffer, filename = 'Unknown.pdf') {
  try {
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    return result.text || ''
  } catch (error) {
    console.error(`[Extraction Error] Failed parsing PDF: ${filename}`)
    console.error(`[Extraction Error] Package/Parser Error:`, error)
    throw new Error(`Failed to parse PDF (${filename}): ${error.message}`)
  }
}

export async function fetchURLContent(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Spandan/1.0)'
      },
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || ''
    const text = await response.text()

    // Return raw text for plain text; strip HTML tags for HTML content
    if (contentType.includes('text/html')) {
      return text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[^;]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    return text.trim()
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new Error(`Timeout fetching URL: ${url}`)
    }
    throw new Error(`Failed to fetch URL (${url}): ${error.message}`)
  }
}

export async function extractContent(files = [], urls = []) {
  const results = []
  const errors = []

  // Process uploaded files (PDFs sent as base64)
  for (const file of files) {
    try {
      const buffer = Buffer.from(file.data, 'base64')
      let text = ''

      if (file.mimeType === 'application/pdf') {
        text = await extractTextFromPDF(buffer, file.name)
      } else if (file.mimeType === 'text/plain') {
        text = buffer.toString('utf-8')
      } else if (file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ buffer })
        text = result.value
      } else if (file.mimeType.startsWith('image/')) {
        const result = await Tesseract.recognize(buffer, 'eng')
        text = result.data.text
      } else {
        errors.push({ file: file.name, error: `Unsupported file type: ${file.mimeType}` })
        continue
      }

      if (text && text.trim()) {
        results.push({ source: file.name, type: 'file', text: text.trim() })
      } else {
        errors.push({ file: file.name, error: 'No extractable text found' })
      }
    } catch (error) {
      console.error(`[Extraction Error] Failed parsing file: ${file.name}`)
      console.error(`[Extraction Error] Stack trace / Parser Error:`, error)
      errors.push({ file: file.name, error: error.message || 'Unknown extraction error' })
    }
  }

  // Process URLs
  for (const url of urls) {
    try {
      const text = await fetchURLContent(url)
      if (text.trim()) {
        results.push({ source: url, type: 'url', text: text.trim() })
      } else {
        errors.push({ file: url, error: 'No content found at URL' })
      }
    } catch (error) {
      console.error(`[Extraction Error] Failed parsing URL: ${url}`)
      console.error(`[Extraction Error] Stack trace / Parser Error:`, error)
      errors.push({ file: url, error: error.message || 'Unknown URL extraction error' })
    }
  }

  return { results, errors }
}
