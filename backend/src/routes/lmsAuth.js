import express from 'express'
import { authenticate } from '../middleware/auth.js'
import { google } from 'googleapis'
import User from '../models/User.js'

const router = express.Router()

const getOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

// GET /api/lms/google/auth
// Generates an auth URL and redirects the user to Google
router.get('/google/auth', authenticate, (req, res) => {
  try {
    const oauth2Client = getOAuth2Client()
    
    // Generate a url that asks permissions for Google Classroom grades
    const scopes = [
      'https://www.googleapis.com/auth/classroom.coursework.students',
      'https://www.googleapis.com/auth/classroom.courses.readonly',
      'https://www.googleapis.com/auth/classroom.profile.emails'
    ]

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force to get refresh token
      state: req.user._id.toString() // Pass user ID in state to link account in callback
    })

    res.json({ url })
  } catch (error) {
    console.error('Error generating Google Auth URL:', error)
    res.status(500).json({ error: 'Failed to initiate Google authentication' })
  }
})

// GET /api/lms/google/callback
// Handles the OAuth2 callback from Google
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query
    if (!code || !state) {
      return res.status(400).send('Missing code or state parameter')
    }

    const userId = state
    const oauth2Client = getOAuth2Client()
    
    const { tokens } = await oauth2Client.getToken(code)
    
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).send('User not found')
    }

    if (!user.lmsIntegrations) {
      user.lmsIntegrations = {}
    }

    user.lmsIntegrations.googleClassroom = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || user.lmsIntegrations.googleClassroom?.refreshToken,
      expiryDate: tokens.expiry_date
    }

    await user.save()

    // Redirect back to frontend settings or dashboard
    res.send('<script>window.close();</script>Successfully connected to Google Classroom. You can close this window.')
  } catch (error) {
    console.error('Error in Google Auth callback:', error)
    res.status(500).send('Failed to authenticate with Google')
  }
})

// GET /api/lms/status
// Check which LMS are connected for the current user
router.get('/status', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
    const connected = {
      googleClassroom: !!(user?.lmsIntegrations?.googleClassroom?.refreshToken)
    }
    res.json({ success: true, connected })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch LMS status' })
  }
})

export default router
