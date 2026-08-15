// Central configuration - change VITE_* in .env to update entire app
// Only ONE value to change when deploying to a different path

const BASE_PATH = import.meta.env.VITE_BASE_PATH || ''
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || BASE_PATH + '/api'

// Application configuration
export const API_URL = API_BASE_URL
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin

// Feature flags
export const VITE_MODE = import.meta.env.VITE_MODE || 'development'
export const VITE_ENABLE_SOUNDS = import.meta.env.VITE_ENABLE_SOUNDS !== 'false'
export const VITE_KEYBOARD_SHORTCUTS = import.meta.env.VITE_KEYBOARD_SHORTCUTS !== 'false'
export const VITE_ENABLE_AI_GENERATION = import.meta.env.VITE_ENABLE_AI_GENERATION !== 'false'
export const VITE_ENABLE_TRANSCRIPTION = import.meta.env.VITE_ENABLE_TRANSCRIPTION !== 'false'
export const VITE_ENABLE_SSO = import.meta.env.VITE_ENABLE_SSO !== 'false'
export const VITE_ENABLE_ANALYTICS = import.meta.env.VITE_ENABLE_ANALYTICS === 'true'
export const VITE_ENABLE_CODE_SPLITTING = import.meta.env.VITE_ENABLE_CODE_SPLITTING === 'true'
export const VITE_ENABLE_COMPRESSION = import.meta.env.VITE_ENABLE_COMPRESSION === 'true'
export const VITE_ENABLE_CACHE = import.meta.env.VITE_ENABLE_CACHE === 'true'

// API configuration
export const VITE_API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT) || 30000
export const VITE_API_RETRY_COUNT = Number(import.meta.env.VITE_API_RETRY_COUNT) || 3
export const VITE_API_RETRY_DELAY = Number(import.meta.env.VITE_API_RETRY_DELAY) || 1000

// Theme and UI
export const VITE_THEME = import.meta.env.VITE_THEME || 'auto'
export const VITE_THEME_PREFERENCE = import.meta.env.VITE_THEME_PREFERENCE || 'local'

// Security
export const VITE_ENABLE_CORS = import.meta.env.VITE_ENABLE_CORS === 'true'
export const VITE_CORS_ORIGINS = import.meta.env.VITE_CORS_ORIGINS || import.meta.env.VITE_SOCKET_URL || window.location.origin

// Performance
export const VITE_CACHE_DURATION = Number(import.meta.env.VITE_CACHE_DURATION) || 3600

// Logging
export const VITE_ENABLE_DEBUG_LOGS = import.meta.env.VITE_ENABLE_DEBUG_LOGS === 'true'
export const VITE_LOG_LEVEL = import.meta.env.VITE_LOG_LEVEL || 'info'
export const VITE_LOG_MAX_SIZE = Number(import.meta.env.VITE_LOG_MAX_SIZE) || 10485760
export const VITE_LOG_BACKUP_COUNT = Number(import.meta.env.VITE_LOG_BACKUP_COUNT) || 5

// Analytics
export const VITE_TRACKING_ID = import.meta.env.VITE_TRACKING_ID || ''
export const VITE_ENABLE_PERFORMANCE_MONITORING = import.meta.env.VITE_ENABLE_PERFORMANCE_MONITORING === 'true'
export const VITE_ENABLE_ERROR_TRACKING = import.meta.env.VITE_ENABLE_ERROR_TRACKING === 'true'

// SSO Configuration
export const VITE_SAMAGAMA_URL = import.meta.env.VITE_SAMAGAMA_URL || 'https://samagama.in'
export const VITE_SAMAGAMA_CLIENT_ID = import.meta.env.VITE_SAMAGAMA_CLIENT_ID || ''
export const VITE_SAMAGAMA_SCOPE = import.meta.env.VITE_SAMAGAMA_SCOPE || 'user.read,user.write'

// AI Configuration
export const VITE_AI_MODEL_MINIMAX = import.meta.env.VITE_AI_MODEL_MINIMAX || 'chat-minimal'
export const VITE_AI_MODEL_OPENAI = import.meta.env.VITE_AI_MODEL_OPENAI || 'gpt-3.5-turbo'
export const VITE_AI_MODEL_ANTHROPIC = import.meta.env.VITE_AI_MODEL_ANTHROPIC || 'claude-2'
export const VITE_AI_MODEL_GOOGLE = import.meta.env.VITE_AI_MODEL_GOOGLE || 'gemini-pro'
export const VITE_AI_MAX_TOKENS = Number(import.meta.env.VITE_AI_MAX_TOKENS) || 1000
export const VITE_AI_TEMPERATURE = Number(import.meta.env.VITE_AI_TEMPERATURE) || 0.7
export const VITE_AI_TOP_P = Number(import.meta.env.VITE_AI_TOP_P) || 0.9
export const VITE_AI_TIMEOUT = Number(import.meta.env.VITE_AI_TIMEOUT) || 30000

// Accessibility
export const VITE_ENABLE_SCREEN_READER_SUPPORT = import.meta.env.VITE_ENABLE_SCREEN_READER_SUPPORT === 'true'
export const VITE_ENABLE_HIGH_CONTRAST_MODE = import.meta.env.VITE_ENABLE_HIGH_CONTRAST_MODE === 'true'
export const VITE_ENABLE_FONT_SCALING = import.meta.env.VITE_ENABLE_FONT_SCALING === 'true'
export const VITE_ENABLE_ANIMATION_REDUCTION = import.meta.env.VITE_ENABLE_ANIMATION_REDUCTION === 'true'

// Environment check
export const IS_DEVELOPMENT = VITE_MODE === 'development'
export const IS_TESTING = VITE_MODE === 'test'
export const IS_PRODUCTION = VITE_MODE === 'production'