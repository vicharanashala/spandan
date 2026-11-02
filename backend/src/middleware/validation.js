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

// Email-OTP registration: step 1 requests a code (email only; name optional for the greeting),
// step 2 submits the full registration form plus the 6-digit code.
export const sendOtpSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional()
})

export const verifyRegistrationSchema = registerSchema.extend({
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  // The account is created at this step, so this is where Terms of Use acceptance is enforced.
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms of Use to register' })
  })
})

// Room validation schemas
export const createRoomSchema = z.object({
  name: z.string().min(1, 'Room name is required').max(200),
  settings: z.object({
    allowLateJoin: z.boolean().optional(),
    showResultsImmediately: z.boolean().optional(),
    requireCorrectAnswer: z.boolean().optional(),
    mode: z.enum(['normal', 'video']).optional(),
    videoUrl: z.string().max(500).optional()
  }).optional()
})

// Settings validation schema for room settings update
// Room settings as saved from the Settings dialog (PUT /rooms/:id with { settings }). Ranges mirror
// the dialog's own clamps (RoomSettingsModal.jsx) so a value the UI lets a teacher pick is never
// rejected here; the schema exists to stop out-of-range values arriving by any other path.
export const roomSettingsSchema = z.object({
  allowLateJoin: z.boolean().optional(),
  showResultsImmediately: z.boolean().optional(),
  requireCorrectAnswer: z.boolean().optional(),
  mode: z.enum(['normal', 'video']).optional(),
  videoUrl: z.string().max(500).optional(),
  timeToAnswer: z.number().int().min(0).max(300).optional(),       // seconds; dialog 0-300
  points: z.number().int().min(1).max(500).optional(),             // dialog 1-500
  segmentTime: z.number().int().min(1).max(15).optional(),         // whole minutes; dialog 1-15
  questionsPerSegment: z.number().int().min(1).max(10).optional(), // dialog 1-10
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  questionProvider: z.enum(['minimax', 'openai', 'anthropic', 'google']).optional(),
  questionTypeMix: z.object({
    MCQ: z.number().int().min(0).max(100).optional(),
    TF: z.number().int().min(0).max(100).optional(),
    MSQ: z.number().int().min(0).max(100).optional()
  }).optional(),
  anonymousLeaderboard: z.boolean().optional(),
  anonymityPercent: z.number().int().min(0).max(100).optional(),   // dialog 0-100
  revealBottomToStudents: z.boolean().optional()
})

// Body of PUT /rooms/:id. The same route saves settings ({ settings }), edits the video link
// ({ settings: { ...all, mode, videoUrl } }) and ends the room ({ isActive: false, endedAt }).
// Only known fields are checked; the route still applies req.body as before.
export const roomUpdateSchema = z.object({
  settings: roomSettingsSchema.optional(),
  isActive: z.boolean().optional(),
  endedAt: z.union([z.string().datetime(), z.date(), z.null()]).optional()
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