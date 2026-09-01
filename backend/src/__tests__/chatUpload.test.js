import { jest } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import { validateMagicBytes } from '../utils/fileValidation.js'
import { flushAndCleanRoom, setRedisOverridesForTest } from '../services/chatService.js'

describe('Live Chat Upload Security & Magic Byte Validation', () => {
  const tempDir = path.join(process.cwd(), 'uploads', 'test_tmp')

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
  })

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('accepts valid PNG file matching magic bytes (89 50 4E 47)', () => {
    const pngPath = path.join(tempDir, 'valid.png')
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D])
    fs.writeFileSync(pngPath, pngHeader)

    const result = validateMagicBytes(pngPath, 'image/png')
    expect(result.valid).toBe(true)
    expect(result.fileType).toBe('image')
  })

  test('accepts valid PDF file matching magic bytes (%PDF / 25 50 44 46)', () => {
    const pdfPath = path.join(tempDir, 'valid.pdf')
    const pdfHeader = Buffer.from('%PDF-1.4\n%...\n', 'utf8')
    fs.writeFileSync(pdfPath, pdfHeader)

    const result = validateMagicBytes(pdfPath, 'application/pdf')
    expect(result.valid).toBe(true)
    expect(result.fileType).toBe('pdf')
  })

  test('accepts valid JPEG file matching magic bytes (FF D8 FF)', () => {
    const jpgPath = path.join(tempDir, 'valid.jpg')
    const jpgHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46])
    fs.writeFileSync(jpgPath, jpgHeader)

    const result = validateMagicBytes(jpgPath, 'image/jpeg')
    expect(result.valid).toBe(true)
    expect(result.fileType).toBe('image')
  })

  test('rejects disguised executable / script renamed to .png (magic bytes mismatch)', () => {
    const disguisedPath = path.join(tempDir, 'fake.png')
    // Windows PE executable header: MZ (4D 5A) or script header (#!/bin/sh)
    const execHeader = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xFF\xFF', 'binary')
    fs.writeFileSync(disguisedPath, execHeader)

    const result = validateMagicBytes(disguisedPath, 'image/png')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('does not match allowed magic bytes')
  })

  test('rejects disguised script renamed to .pdf (magic bytes mismatch)', () => {
    const disguisedPdf = path.join(tempDir, 'fake.pdf')
    const scriptHeader = Buffer.from('<?php echo "evil"; ?>', 'utf8')
    fs.writeFileSync(disguisedPdf, scriptHeader)

    const result = validateMagicBytes(disguisedPdf, 'application/pdf')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('does not match allowed magic bytes')
  })

  test('accepts valid legacy DOC file matching OLE2 magic bytes (D0 CF 11 E0 A1 B1 1A E1)', () => {
    const docPath = path.join(tempDir, 'valid.doc')
    const docHeader = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0x00, 0x00])
    fs.writeFileSync(docPath, docHeader)

    const result = validateMagicBytes(docPath, 'application/msword')
    expect(result.valid).toBe(true)
    expect(result.fileType).toBe('file')
  })

  test('accepts valid plain text file (.txt) with UTF-8 text', () => {
    const txtPath = path.join(tempDir, 'notes.txt')
    fs.writeFileSync(txtPath, 'Hello, this is a clean study notes file.\nLine 2.\n', 'utf8')

    const result = validateMagicBytes(txtPath, 'text/plain')
    expect(result.valid).toBe(true)
    expect(result.fileType).toBe('file')
  })

  test('rejects .txt file containing binary null bytes or script shebangs', () => {
    const binaryTxtPath = path.join(tempDir, 'bad_binary.txt')
    fs.writeFileSync(binaryTxtPath, Buffer.from([0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x00, 0x57, 0x6F]))

    const result = validateMagicBytes(binaryTxtPath, 'text/plain')
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('binary null bytes')

    const scriptTxtPath = path.join(tempDir, 'bad_script.txt')
    fs.writeFileSync(scriptTxtPath, '#!/bin/bash\nrm -rf /\n', 'utf8')

    const result2 = validateMagicBytes(scriptTxtPath, 'text/plain')
    expect(result2.valid).toBe(false)
    expect(result2.reason).toContain('script or executable marker')
  })

  test('flushAndCleanRoom cleans up chat:quota:* Redis keys using non-blocking SCAN on room end/delete', async () => {
    const deletedKeys = []
    const mockRedis = {
      lLen: jest.fn().mockResolvedValue(0),
      lPopCount: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockImplementation((keys) => {
        if (Array.isArray(keys)) deletedKeys.push(...keys)
        else deletedKeys.push(keys)
        return Promise.resolve(1)
      }),
      sRem: jest.fn().mockResolvedValue(1),
      scan: jest.fn().mockResolvedValue({
        cursor: '0',
        keys: ['chat:quota:room123:user1', 'chat:quota:room123:user2']
      })
    }
    setRedisOverridesForTest({ isRedisEnabled: () => true, getRedisClient: () => mockRedis })

    await flushAndCleanRoom('room123')

    expect(mockRedis.scan).toHaveBeenCalledWith('0', { MATCH: 'chat:quota:room123:*', COUNT: 100 })
    expect(deletedKeys).toContain('chat:quota:room123:user1')
    expect(deletedKeys).toContain('chat:quota:room123:user2')
    expect(deletedKeys).toContain('chat:room:room123:messages')
    expect(deletedKeys).toContain('chat:room:room123:enabled')

    setRedisOverridesForTest(null)
  })
})
