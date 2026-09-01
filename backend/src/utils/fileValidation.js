import fs from 'fs'

/**
 * Validate file content using Magic Bytes (file signatures).
 * Rejects disguised files (e.g. an executable or script disguised as a .png or .pdf).
 */
export function validateMagicBytes(filePath, declaredMime) {
  try {
    const buffer = Buffer.alloc(16)
    const fd = fs.openSync(filePath, 'r')
    fs.readSync(fd, buffer, 0, 16, 0)
    fs.closeSync(fd)

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return { valid: true, fileType: 'image', mime: 'image/png' }
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return { valid: true, fileType: 'image', mime: 'image/jpeg' }
    }

    // GIF: 47 49 46 38
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      return { valid: true, fileType: 'image', mime: 'image/gif' }
    }

    // WebP: RIFF .... WEBP
    if (
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
      return { valid: true, fileType: 'image', mime: 'image/webp' }
    }

    // PDF: %PDF (25 50 44 46)
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return { valid: true, fileType: 'pdf', mime: 'application/pdf' }
    }

    // DOCX/ZIP (Office Open XML): PK.. (50 4B 03 04)
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      return { valid: true, fileType: 'file', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    }

    // DOC (Legacy Microsoft Word OLE2 Compound Binary Format): D0 CF 11 E0 A1 B1 1A E1
    if (
      buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0 &&
      buffer[4] === 0xA1 && buffer[5] === 0xB1 && buffer[6] === 0x1A && buffer[7] === 0xE1
    ) {
      return { valid: true, fileType: 'file', mime: 'application/msword' }
    }

    // Plain text (.txt): Ensure valid UTF-8/ASCII, no null bytes, and no executable/script markers
    if (declaredMime === 'text/plain') {
      const textChunk = Buffer.alloc(512)
      const fd2 = fs.openSync(filePath, 'r')
      const bytesRead = fs.readSync(fd2, textChunk, 0, 512, 0)
      fs.closeSync(fd2)

      const slice = textChunk.slice(0, bytesRead)
      // Reject binary null bytes
      if (slice.includes(0x00)) {
        return { valid: false, reason: 'Plain text file contains binary null bytes' }
      }

      // Reject executable/script shebangs and tags
      const textStr = slice.toString('utf8').toLowerCase()
      if (
        textStr.startsWith('mz') ||
        textStr.startsWith('\x7felf') ||
        textStr.startsWith('#!/') ||
        textStr.startsWith('<?php') ||
        textStr.startsWith('<script')
      ) {
        return { valid: false, reason: 'Plain text file starts with script or executable marker' }
      }

      return { valid: true, fileType: 'file', mime: 'text/plain' }
    }

    return { valid: false, reason: 'File content does not match allowed magic bytes' }
  } catch (err) {
    return { valid: false, reason: err.message }
  }
}
