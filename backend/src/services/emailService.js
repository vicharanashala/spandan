import nodemailer from 'nodemailer'
import { config } from '../config.js'

// Create reusable transporter - configured via environment variables
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.smtpEmail,
    pass: config.smtpPassword
  },
  // Force IPv4 — prevents ECONNREFUSED on IPv6 addresses in local dev environments
  family: 4,
  // ⚠️  DEV-ONLY WORKAROUND: disables TLS certificate verification to bypass
  // "self-signed certificate in certificate chain" errors on local/proxy setups.
  // This is NOT safe for production. It is guarded by NODE_ENV so it will
  // NEVER apply when NODE_ENV==='production'. Remove or re-audit before merging to PR.
  ...(process.env.NODE_ENV !== 'production' && {
    tls: { rejectUnauthorized: false }
  })
})

// Send reset password email
export const sendResetPasswordEmail = async (email, token) => {
  const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`

  const mailOptions = {
    from: `"Spandan Quiz" <${config.smtpEmail}>`,
    to: email,
    subject: 'Password Reset - Spandan Quiz',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Spandan Quiz</h1>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
          <h2 style="color: #1f2937; margin-top: 0;">Password Reset Request</h2>
          <p style="color: #6b7280; font-size: 16px; line-height: 1.6;">
            You received this email because a password reset was requested for your account.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Reset Password
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            This link will expire in <strong>1 hour</strong>.
          </p>
          <p style="color: #9ca3af; font-size: 13px; margin-top: 20px;">
            If you didn't request a password reset, you can safely ignore this email.<br>
            The link is: <a href="${resetUrl}" style="color: #3b82f6;">${resetUrl}</a>
          </p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          © 2024 Spandan Quiz. All rights reserved.
        </div>
      </div>
    `
  }

  try {
    await transporter.sendMail(mailOptions)
    console.log(`Reset email sent to ${email}`)
    return true
  } catch (error) {
    console.error(`Failed to send reset email to ${email}:`, error.message)
    throw new Error('Failed to send reset email')
  }
}

// Send welcome email
export const sendWelcomeEmail = async (email, name, role) => {
  const roleDisplay = role === 'teacher' ? 'Teacher' : 'Student'

  const mailOptions = {
    from: `"Spandan Quiz" <${config.smtpEmail}>`,
    to: email,
    subject: 'Welcome to Spandan Quiz!',
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Spandan!</h1>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
          <h2 style="color: #1f2937; margin-top: 0;">Hi ${name},</h2>
          <p style="color: #6b7280; font-size: 16px; line-height: 1.6;">
            Your account has been successfully created. Here are your account details:
          </p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #374151;"><strong>Name:</strong> ${name}</p>
            <p style="margin: 10px 0 0; color: #374151;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 10px 0 0; color: #374151;"><strong>Role:</strong> ${roleDisplay}</p>
          </div>
          <p style="color: #6b7280; font-size: 16px; line-height: 1.6;">
            As a <strong>${roleDisplay}</strong>, you can:
            ${role === 'teacher' 
              ? '<ul style="color: #6b7280; line-height: 1.8;"><li>Create and manage quiz rooms</li><li>Generate AI-powered questions</li><li>Monitor student performance</li><li>View detailed leaderboards</li></ul>'
              : '<ul style="color: #6b7280; line-height: 1.8;"><li>Join quiz rooms and participate in real-time quizzes</li><li>Compete on leaderboards</li><li>View your quiz history and performance</li></ul>'
            }
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${config.frontendUrl}" style="display: inline-block; background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Go to Spandan
            </a>
          </div>
          <p style="color: #9ca3af; font-size: 13px; margin-top: 20px;">
            If you have any questions or need assistance, feel free to reach out.
          </p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          © 2024 Spandan Quiz. All rights reserved.
        </div>
      </div>
    `
  }

  try {
    await transporter.sendMail(mailOptions)
    console.log(`Welcome email sent to ${email}`)
    return true
  } catch (error) {
    console.error(`Failed to send welcome email to ${email}:`, error.message)
    // Non-critical: don't throw, just log
    return false
  }
}

// Send roster invite email (bulk classroom invite)
export const sendRosterInviteEmail = async (recipientEmail, recipientName, roomName, roomCode, frontendUrl) => {
  const joinUrl = `${frontendUrl}/join/${roomCode}`

  const mailOptions = {
    from: `"Spandan Quiz" <${config.smtpEmail}>`,
    to: recipientEmail,
    subject: `You're invited to join "${roomName}" on Spandan Quiz`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Spandan Quiz</h1>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
          <h2 style="color: #1f2937; margin-top: 0;">Hi ${recipientName},</h2>
          <p style="color: #6b7280; font-size: 16px; line-height: 1.6;">
            You have been invited to join the classroom session <strong>${roomName}</strong>.
          </p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; color: #374151; font-size: 14px;">Room Join Code</p>
            <p style="margin: 8px 0 0; color: #1e40af; font-size: 32px; font-weight: 700; letter-spacing: 6px;">${roomCode}</p>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${joinUrl}" style="display: inline-block; background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              Join Room Now
            </a>
          </div>
          <p style="color: #9ca3af; font-size: 13px; margin-top: 20px;">
            Or visit: <a href="${joinUrl}" style="color: #3b82f6;">${joinUrl}</a>
          </p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          © 2024 Spandan Quiz. All rights reserved.
        </div>
      </div>
    `
  }

  try {
    await transporter.sendMail(mailOptions)
    console.log(`Roster invite email sent to ${recipientEmail}`)
    return true
  } catch (error) {
    console.error(`Failed to send roster invite email to ${recipientEmail}:`, error.message)
    throw new Error('Failed to send invite email')
  }
}