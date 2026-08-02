import authRoutes from './routes/auth.js'
import roomRoutes from './routes/rooms.js'
import questionRoutes from './routes/questions.js'
import transcriptionRoutes from './routes/transcription.js'
import transcriptRoutes from './routes/transcripts.js'
import responseRoutes from './routes/responses.js'
import researchRoutes from './routes/research.js'

// The API surface, in one place. index.js mounts from this table and then asserts every route in it
// declares an access policy; the route access matrix test enumerates the same table, so "every
// route" means the same set of routes to the server and to the tests, and a new router cannot be
// added to one without appearing in the other.
export const API_ROUTES = [
  ['/api/auth', authRoutes],
  ['/api/rooms', roomRoutes],
  ['/api/questions', questionRoutes],
  ['/api/transcription', transcriptionRoutes],
  ['/api/transcripts', transcriptRoutes],
  ['/api/responses', responseRoutes],
  ['/api/research', researchRoutes]
]
