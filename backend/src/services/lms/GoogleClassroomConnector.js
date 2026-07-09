import { LMSConnector } from './LMSConnector.js'
import { google } from 'googleapis'

export class GoogleClassroomConnector extends LMSConnector {
  constructor() {
    super()
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
  }

  async pushGrades(sessionResults, config) {
    const { courseId, courseWorkId, tokens } = config
    
    if (!tokens || !tokens.refreshToken) {
      throw new Error('Google Classroom refresh token is missing. Please reconnect your account.')
    }

    this.oauth2Client.setCredentials({
      refresh_token: tokens.refreshToken,
      access_token: tokens.accessToken
    })

    const classroom = google.classroom({ version: 'v1', auth: this.oauth2Client })
    
    const results = []
    
    // sessionResults is an array of objects: { studentEmail, score }
    for (const result of sessionResults) {
      try {
        // Find the student's submission for this coursework
        const submissions = await classroom.courses.courseWork.studentSubmissions.list({
          courseId,
          courseWorkId,
          userId: result.studentEmail // Email is commonly used to resolve the user
        })

        if (submissions.data.studentSubmissions && submissions.data.studentSubmissions.length > 0) {
          const submission = submissions.data.studentSubmissions[0]
          
          // Patch the submission with the assigned grade
          await classroom.courses.courseWork.studentSubmissions.patch({
            courseId,
            courseWorkId,
            id: submission.id,
            updateMask: 'assignedGrade,draftGrade',
            requestBody: {
              assignedGrade: result.score,
              draftGrade: result.score
            }
          })
          
          results.push({ studentEmail: result.studentEmail, status: 'success' })
        } else {
          results.push({ studentEmail: result.studentEmail, status: 'failed', reason: 'Submission not found for this student.' })
        }
      } catch (error) {
        console.error(`Failed to push grade for ${result.studentEmail}:`, error)
        results.push({ studentEmail: result.studentEmail, status: 'failed', reason: error.message })
      }
    }
    
    return results
  }
}
