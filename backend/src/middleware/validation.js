import { z } from 'zod'

// Auth validation schemas
// Strong password: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char
const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .refine(val => passwordRegex.test(val), 'Password must contain: 1 uppercase, 1 lowercase, 1 digit, 1 special character'),
  role: z.enum(['teacher', 'student'], {
    errorMap: () => ({ message: 'Role must be either teacher or student' })
  })
})

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required')
})

// Room validation schemas
export const createRoomSchema = z.object({
  name: z.string().min(1, 'Room name is required').max(200),
  teamsWebhookUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  settings: z.object({
    allowLateJoin: z.boolean().optional(),
    showResultsImmediately: z.boolean().optional(),
    requireCorrectAnswer: z.boolean().optional()
  }).optional()
})

// Settings validation schema for room settings update
export const roomSettingsSchema = z.object({
  allowLateJoin: z.boolean().optional(),
  showResultsImmediately: z.boolean().optional(),
  requireCorrectAnswer: z.boolean().optional(),
  timeToAnswer: z.number().min(5).max(300).optional(),
  points: z.number().min(10).max(1000).optional(),
  segmentTime: z.number().min(1).max(60).optional(),
  questionsPerSegment: z.number().min(1).max(10).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  questionProvider: z.enum(['minimax', 'openai', 'anthropic', 'google']).optional(),
  questionTypeMix: z.object({
    MCQ: z.number().min(0).max(100).optional(),
    TF: z.number().min(0).max(100).optional(),
    MSQ: z.number().min(0).max(100).optional()
  }).optional()
})

// Question validation schemas
export const createQuestionSchema = z.object({
  question: z.string().min(1, 'Question text is required'),
  options: z.array(z.string().min(1, 'Option cannot be empty')).min(2, 'At least 2 options required'),
  correctOptionIndex: z.number().min(0),
  roomId: z.string(),
  source: z.enum(['manual', 'ai', 'upload', 'transcript']).optional(),
  timer: z.number().min(5).max(300).optional()
})

// Response validation schema
export const submitResponseSchema = z.object({
  questionId: z.string(),
  selectedOption: z.number().min(0),
  responseTime: z.number().min(0)
})

// Middleware factory
export const validate = (schema) => {
  return (req, res, next) => {
    try {
      const result = schema.parse(req.body)
      req.validatedBody = result
      next()
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }
      next(error)
    }
  }
}