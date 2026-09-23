import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(currentDir, '../.env') })
dotenv.config()

export const config = {
  smtpEmail: process.env.SMTP_EMAIL || '',
  smtpPassword: process.env.SMTP_PASSWORD || '',
  // Generic API key for whichever HTTP email provider is selected (Brevo/Resend/SendGrid/…).
  // Falls back to the legacy BREVO_API_KEY name for continuity.
  emailApiKey: process.env.EMAIL_API_KEY || process.env.BREVO_API_KEY || '',
  // Verified sender address; falls back to the old SMTP_EMAIL for continuity.
  mailFrom: process.env.MAIL_FROM || process.env.SMTP_EMAIL || '',
  // Email provider: 'brevo' (default), 'resend', 'sendgrid' (HTTP APIs — SMTP is blocked on the DO
  // droplet), or 'smtp'. EMAIL_TRANSPORT is accepted as an alias for back-compat.
  emailProvider: (process.env.EMAIL_PROVIDER || process.env.EMAIL_TRANSPORT || 'brevo').toLowerCase(),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  nvidiaApiKey: process.env.NVIDIA_API_KEY || '',
  minimaxApiKey: process.env.MINIMAX_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  googleApiKey: process.env.GOOGLE_API_KEY || '',
  nodeEnv: process.env.NODE_ENV || 'development'
}

export const AI_PROVIDERS = {
  nvidia: {
    name: 'NVIDIA NIM (Llama 3.1)',
    enabled: !!config.nvidiaApiKey,
    icon: '🟢'
  },
  minimax: {
    name: 'MiniMax',
    enabled: !!config.minimaxApiKey,
    icon: '🔵'
  },
  openai: {
    name: 'OpenAI',
    enabled: !!config.openaiApiKey,
    icon: '🟢'
  },
  anthropic: {
    name: 'Claude',
    enabled: !!config.anthropicApiKey,
    icon: '🟠'
  },
  google: {
    name: 'Gemini',
    enabled: !!config.googleApiKey,
    icon: '🔴'
  }
}