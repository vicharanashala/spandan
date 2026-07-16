import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import User from '../models/User.js'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable is not set. Refusing to start in production without a secure secret.')
    process.exit(1)
  } else {
    console.warn('WARNING: JWT_SECRET not set — using insecure dev fallback. Do NOT deploy to production without setting JWT_SECRET.')
  }
}
const SECRET = JWT_SECRET || 'dev-only-insecure-fallback-do-not-use-in-production'
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d'

// Short-TTL in-memory cache of authenticated users. Every protected request used to
// issue a User.findById; during a live session students poll constantly, so that was
// thousands of redundant _id lookups/sec purely for auth. Caching the resolved user
// for a few seconds collapses those to one lookup per user per TTL window while keeping
// the full Mongoose document (so /auth/me and req.user.model keep working).
// Trade-off: a role change or account deletion takes up to TTL to be reflected.
// NOTE: this is per-process; when moving to multiple instances, switch to Redis or
// stateless token claims (see scalability audit, Phase 2).
const USER_CACHE_TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS) || 60000
const USER_CACHE_MAX = Number(process.env.AUTH_CACHE_MAX) || 20000
const userCache = new Map() // userId -> { user, expires }

export const clearUserCache = () => userCache.clear()

// Periodic cleanup every 5 minutes (prevents unbounded memory growth)
const cacheCleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [key, val] of userCache) {
    if (now >= val.expires) userCache.delete(key)
  }
}, 300000)

// Allow cleanup on server shutdown
export function stopCacheCleanup() {
  clearInterval(cacheCleanupInterval)
}

export function invalidateUserCache(userId) {
  userCache.delete(userId)
}

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid token'
      })
    }

    const token = authHeader.split(' ')[1]

    const decoded = jwt.verify(token, JWT_SECRET)

    let user
    const cached = userCache.get(decoded.userId)
    if (cached && cached.expires > Date.now()) {
      user = cached.user
    } else {
      user = await User.findById(decoded.userId).select('-password')
      if (user) {
        // Crude bound on cache size: clear wholesale rather than track LRU.
        if (userCache.size >= USER_CACHE_MAX) userCache.clear()
        userCache.set(decoded.userId, { user, expires: Date.now() + USER_CACHE_TTL_MS })
      }
    }

    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        message: 'The user associated with this token no longer exists'
      })
    }

    req.user = user
    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'The provided token is invalid or expired' 
      })
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Your session has expired. Please sign in again' 
      })
    }
    next(error)
  }
}

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Not authenticated',
        message: 'Please sign in to access this resource' 
      })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to perform this action' 
      })
    }

    next()
  }
}

export const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    SECRET,
    { expiresIn: JWT_EXPIRY }
  )
}
