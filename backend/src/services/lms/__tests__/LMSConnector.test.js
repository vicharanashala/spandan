import { LMSConnector } from '../LMSConnector.js'
import { GoogleClassroomConnector } from '../GoogleClassroomConnector.js'

// Mock googleapis
jest.mock('googleapis', () => {
  return {
    google: {
      auth: {
        OAuth2: jest.fn().mockImplementation(() => {
          return {
            setCredentials: jest.fn()
          }
        })
      },
      classroom: jest.fn().mockReturnValue({
        courses: {
          courseWork: {
            studentSubmissions: {
              list: jest.fn().mockResolvedValue({
                data: {
                  studentSubmissions: [
                    { id: 'sub_123' }
                  ]
                }
              }),
              patch: jest.fn().mockResolvedValue({ data: {} })
            }
          }
        }
      })
    }
  }
})

describe('LMSConnector Interface', () => {
  test('base class throws on pushGrades', async () => {
    const base = new LMSConnector()
    await expect(base.pushGrades([], {})).rejects.toThrow('pushGrades must be implemented by subclasses')
  })
})

describe('GoogleClassroomConnector', () => {
  test('throws if missing refresh token', async () => {
    const connector = new GoogleClassroomConnector()
    await expect(connector.pushGrades([], { tokens: {} })).rejects.toThrow('Google Classroom refresh token is missing')
  })

  test('successfully pushes grades', async () => {
    const connector = new GoogleClassroomConnector()
    const results = await connector.pushGrades(
      [{ studentEmail: 'test@student.com', score: 85 }],
      { courseId: 'c1', courseWorkId: 'cw1', tokens: { refreshToken: 'rt', accessToken: 'at' } }
    )
    
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('success')
    expect(results[0].studentEmail).toBe('test@student.com')
  })
})
