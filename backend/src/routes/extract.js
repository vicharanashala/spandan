import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { extractContent } from '../services/contentExtractor.js'

const router = express.Router()

router.use(authenticate)

router.post('/extract-content', authorize('teacher'), async (req, res) => {
  try {
    const { files = [], urls = [] } = req.body

    if (!files.length && !urls.length) {
      return res.status(400).json({
        success: false,
        error: 'No files or URLs provided. Upload at least one file or enter a URL.'
      })
    }

    if (files.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 5 files allowed per request.'
      })
    }

    if (urls.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 URLs allowed per request.'
      })
    }

    // Validate file sizes (10MB max per file)
    for (const file of files) {
      const sizeInMB = (file.data.length * 3) / 4 / 1024 / 1024
      if (sizeInMB > 10) {
        return res.status(400).json({
          success: false,
          error: `File "${file.name}" exceeds 10MB limit.`
        })
      }
    }

    const { results, errors } = await extractContent(files, urls)

    const combinedText = results.map(r => {
      const separator = r.type === 'url' ? `--- Content from: ${r.source} ---` : `--- Content from file: ${r.source} ---`
      return `${separator}\n${r.text}`
    }).join('\n\n')

    res.json({
      success: true,
      results,
      errors,
      combinedText,
      totalChars: combinedText.length
    })
  } catch (error) {
    console.error('Content extraction error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to extract content'
    })
  }
})

export default router
