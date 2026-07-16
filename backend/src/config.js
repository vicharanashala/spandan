import dotenv from 'dotenv'
dotenv.config()

export const config = {
  smtpEmail: process.env.SMTP_EMAIL || '',
  smtpPassword: process.env.SMTP_PASSWORD || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  minimaxApiKey: process.env.MINIMAX_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  googleApiKey: process.env.GOOGLE_API_KEY || '',
  googleModel: process.env.GOOGLE_MODEL || '',
  nodeEnv: process.env.NODE_ENV || 'development'
}

export const AI_PROVIDERS = {
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