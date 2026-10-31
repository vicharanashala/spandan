import { PDFParse } from 'pdf-parse'

/**
 * Extract clean readable text from a PDF Buffer or base64 string.
 * Supports PDF documents with graceful fallback for text/markdown files.
 * @param {Buffer|string} input - PDF file as Buffer or base64 data URL / base64 string
 * @returns {Promise<{ text: string, numPages: number, charCount: number }>}
 */
export async function extractTextFromPdf(input) {
  let buffer
  if (Buffer.isBuffer(input)) {
    buffer = input
  } else if (typeof input === 'string') {
    // Strip data URL header if present (e.g. data:application/pdf;base64,...)
    const base64Data = input.replace(/^data:[^;]+;base64,/, '')
    buffer = Buffer.from(base64Data, 'base64')
  } else {
    throw new Error('Invalid input format. Expected Buffer or base64 string.')
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('File is empty')
  }

  const isPdfHeader = buffer.slice(0, 5).toString('ascii').startsWith('%PDF')

  if (isPdfHeader) {
    let parser
    try {
      parser = new PDFParse({ data: buffer })
      const result = await parser.getText()
      const rawText = result?.text || ''
      const text = rawText
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

      if (text && text.length >= 30) {
        return {
          text,
          numPages: result.total || (result.pages ? result.pages.length : 1),
          charCount: text.length
        }
      }
    } catch (pdfErr) {
      console.warn('[PDF Extractor] PDFParse failed, checking fallback text:', pdfErr.message)
    } finally {
      if (parser) {
        try {
          await parser.destroy()
        } catch (_) {}
      }
    }
  }

  // Fallback: check if buffer is plain text / markdown / text notes
  const utf8Text = buffer.toString('utf-8').trim()
  if (utf8Text && utf8Text.length >= 30 && !/[\x00-\x08\x0E-\x1F]/.test(utf8Text.slice(0, 100))) {
    return {
      text: utf8Text,
      numPages: 1,
      charCount: utf8Text.length
    }
  }

  throw new Error('Could not extract readable text from document. Please ensure the PDF or document contains selectable text.')
}
