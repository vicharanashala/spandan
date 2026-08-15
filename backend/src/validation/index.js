# Environment Validation Module
# Initializes configuration validation and provides global environment setup

const { config, validateConfig } = require('./configValidation.js')

// Load configuration
const envConfig = validateConfig()

// Provide global access to configuration
global.config = {
  ...config,
  isProduction: config.NODE_ENV === 'production',
  isDevelopment: config.NODE_ENV === 'development',
  isTesting: config.NODE_ENV === 'test'
}

// Validation function
global.validateEnvironment = () => {
  console.log('🔍 Validating environment configuration...')
  
  const requiredVars = []
  const optionalVars = []
  
  // Check required variables
  if (!envConfig.MONGODB_URI) requiredVars.push('MONGODB_URI')
  if (!envConfig.JWT_SECRET) requiredVars.push('JWT_SECRET')
  if (!envConfig.MINIMAX_API_KEY && !envConfig.OPENAI_API_KEY && !envConfig.ANTHROPIC_API_KEY && !envConfig.GOOGLE_API_KEY) {
    requiredVars.push('At least one AI API key (MINIMAX_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY)')
  }
  
  // Check optional but important variables
  if (!envConfig.FRONTEND_URL) {
    console.warn('⚠️ Warning: FRONTEND_URL is optional but recommended for proper CORS')
    optionalVars.push('FRONTEND_URL')
  }
  
  if (envConfig.isProduction && envConfig.CORS_ORIGINS === 'http://localhost:5173,http://127.0.0.1:5173') {
    console.warn('⚠️ Warning: Production mode with localhost CORS origins')
    optionalVars.push('CORS_ORIGINS (consider production-safe values)')
  }
  
  // Report validation results
  if (requiredVars.length > 0) {
    console.error('❌ Missing required environment variables:')
    requiredVars.forEach(varName => {
      console.error(`  - ${varName}`)
    })
    console.error('\n📋 Setup Instructions:')
    console.error('  1. Create .env file from backend/.env.example')
    console.error('  2. Set all required variables')
    console.error('  3. Ensure JWT_SECRET is at least 32 characters')
    console.error('  4. Set at least one AI API key for question generation')
    process.exit(1)
  }
  
  // Show validation summary
  console.log('✅ Environment validation successful')
  console.log('📍 Environment:', config.NODE_ENV)
  console.log('🔌 Port:', config.PORT)
  console.log('📱 Frontend URL:', config.FRONTEND_URL)
  console.log('🗄️ MongoDB Connected:', !!envConfig.MONGODB_URI)
  console.log('🔐 JWT Secret Set:', !!envConfig.JWT_SECRET)
  
  if (envConfig.isProduction) {
    console.log('🚀 Production Mode - Running with high security')
    console.log('⚠️  Ensure all production settings are secure')
  } else {
    console.log('🛠️ Development Mode - Running with relaxed security')
    console.log('💡 Use for local development and testing')
  }
  
  console.log('\n🔧 Configuration Summary:')
  console.log('  - Rate Limits: API:', config.RATE_LIMITS.api.max, '/15min, Auth:', config.RATE_LIMITS.auth.max, '/1h')
  console.log('  - AI Providers: Minimax:', !!envConfig.MINIMAX_API_KEY, 'OpenAI:', !!envConfig.OPENAI_API_KEY, 'Claude:', !!envConfig.ANTHROPIC_API_KEY, 'Gemini:', !!envConfig.GOOGLE_API_KEY)
  console.log('  - Rate Limiting: Response:', config.RATE_LIMITS.responses.max, '/15min, Leaderboard:', config.RATE_LIMITS.leaderboard.max, '/15min')
  
  return true
}

// Export configuration for use in other modules
module.exports = {
  config,
  validateEnvironment,
  ...config
}
