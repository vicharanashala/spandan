import { config } from '../config.js'
import nodemailer from 'nodemailer'

// Email provider is chosen at runtime via EMAIL_PROVIDER (config.emailProvider); the API key for any
// HTTP provider comes from the generic EMAIL_API_KEY (config.emailApiKey), so switching providers is
// just an env change — no code edit:
//   • 'brevo' (default), 'resend', 'sendgrid' — transactional HTTP APIs over port 443. Required on
//     the DigitalOcean droplet, which blocks outbound SMTP (25/465/587).
//   • 'smtp' — Gmail SMTP via nodemailer (needs SMTP_EMAIL / SMTP_PASSWORD; only where SMTP is open).
// To add another HTTP provider, add one entry to HTTP_PROVIDERS below — nothing else changes. The
// HTML content is identical for every provider, and a 10s abort keeps a hiccup from hanging a request.
const FROM_NAME = 'Spandan VLED'

// Gmail SMTP transport (used only when EMAIL_PROVIDER=smtp).
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.smtpEmail,
    pass: config.smtpPassword
  }
})

// Generic HTTP POST-JSON send with a 10s abort. Shared by every HTTP provider below.
async function httpSend(url, authHeaders, body, label) {
  if (!config.emailApiKey) throw new Error('EMAIL_API_KEY not configured')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...authHeaders },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`${label} API ${res.status}: ${text.slice(0, 300)}`)
    }
    return true
  } finally {
    clearTimeout(timer)
  }
}

// HTTP email providers — each maps {to, subject, html} to that provider's API shape, using the
// generic EMAIL_API_KEY and the configured sender. Add a provider by adding one entry here.
const HTTP_PROVIDERS = {
  brevo: ({ to, subject, html }) => httpSend(
    'https://api.brevo.com/v3/smtp/email',
    { 'api-key': config.emailApiKey },
    { sender: { name: FROM_NAME, email: config.mailFrom }, to: [{ email: to }], subject, htmlContent: html },
    'Brevo'
  ),
  resend: ({ to, subject, html }) => httpSend(
    'https://api.resend.com/emails',
    { Authorization: `Bearer ${config.emailApiKey}` },
    { from: `${FROM_NAME} <${config.mailFrom}>`, to: [to], subject, html },
    'Resend'
  ),
  sendgrid: ({ to, subject, html }) => httpSend(
    'https://api.sendgrid.com/v3/mail/send',
    { Authorization: `Bearer ${config.emailApiKey}` },
    { personalizations: [{ to: [{ email: to }] }], from: { email: config.mailFrom, name: FROM_NAME }, subject, content: [{ type: 'text/html', value: html }] },
    'SendGrid'
  )
}

// Unified sender — dispatches to the provider selected by EMAIL_PROVIDER.
async function sendEmail(mailOptions) {
  const provider = config.emailProvider
  if (provider === 'smtp') return transporter.sendMail(mailOptions)
  const send = HTTP_PROVIDERS[provider]
  if (!send) {
    throw new Error(`Unknown EMAIL_PROVIDER '${provider}' (valid: ${Object.keys(HTTP_PROVIDERS).join(', ')}, smtp)`)
  }
  return send({ to: mailOptions.to, subject: mailOptions.subject, html: mailOptions.html })
}

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
    await sendEmail(mailOptions)
    console.log(`Reset email sent to ${email}`)
    return true
  } catch (error) {
    console.error(`Failed to send reset email to ${email}:`, error.message)
    throw new Error('Failed to send reset email')
  }
}

// Send welcome email
// Send a 6-digit registration verification code (email-OTP signup)
export const sendRegistrationOtp = async (email, name, otp) => {
  const mailOptions = {
    from: `"Spandan Quiz" <${config.smtpEmail}>`,
    to: email,
    subject: `${otp} is your Spandan verification code`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Spandan Quiz</h1>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
          <h2 style="color: #1f2937; margin-top: 0;">Verify your email</h2>
          <p style="color: #6b7280; font-size: 16px; line-height: 1.6;">
            ${name ? `Hi ${name}, ` : ''}use the code below to finish creating your Spandan account.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="display: inline-block; background: #f1f5ff; color: #1e40af; letter-spacing: 10px; font-size: 34px; font-weight: 700; padding: 16px 28px; border-radius: 10px; border: 1px solid #dbe4ff;">
              ${otp}
            </div>
          </div>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            This code expires in <strong>10 minutes</strong>. Enter it on the sign-up page to complete registration.
          </p>
          <p style="color: #9ca3af; font-size: 13px; margin-top: 20px;">
            If you didn't try to sign up for Spandan, you can safely ignore this email — no account will be created.
          </p>
        </div>
        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          © 2024 Spandan Quiz. All rights reserved.
        </div>
      </div>
    `
  }

  try {
    await sendEmail(mailOptions)
    console.log(`OTP email sent to ${email}`)
    return true
  } catch (error) {
    console.error(`Failed to send OTP email to ${email}:`, error.message)
    throw new Error('Failed to send verification code')
  }
}

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
    await sendEmail(mailOptions)
    console.log(`Welcome email sent to ${email}`)
    return true
  } catch (error) {
    console.error(`Failed to send welcome email to ${email}:`, error.message)
    // Non-critical: don't throw, just log
    return false
  }
}