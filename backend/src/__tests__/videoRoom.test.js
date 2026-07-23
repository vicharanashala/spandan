import { createRoomSchema } from '../middleware/validation.js'

describe('Video Room Validation Schema', () => {
  describe('Zod Validation (createRoomSchema)', () => {
    it('should validate standard audio room successfully', () => {
      const payload = {
        name: 'My Audio Room',
        mode: 'audio'
      }
      const result = createRoomSchema.safeParse(payload)
      expect(result.success).toBe(true)
      expect(result.data.mode).toBe('audio')
    })

    it('should default to undefined or allow omit of mode and videoUrl', () => {
      const payload = {
        name: 'Default Room'
      }
      const result = createRoomSchema.safeParse(payload)
      expect(result.success).toBe(true)
      expect(result.data.mode).toBeUndefined()
    })

    it('should require a valid YouTube URL when mode is video', () => {
      const payload = {
        name: 'My Video Room',
        mode: 'video'
      }
      const result = createRoomSchema.safeParse(payload)
      expect(result.success).toBe(false)

      const payload2 = {
        name: 'My Video Room',
        mode: 'video',
        videoUrl: 'not-a-youtube-url'
      }
      const result2 = createRoomSchema.safeParse(payload2)
      expect(result2.success).toBe(false)
    })

    it('should validate valid YouTube URLs in video mode', () => {
      const validUrls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'http://youtube.com/watch?v=dQw4w9WgXcQ'
      ]

      validUrls.forEach(url => {
        const payload = {
          name: 'My Video Room',
          mode: 'video',
          videoUrl: url
        }
        const result = createRoomSchema.safeParse(payload)
        expect(result.success).toBe(true)
        expect(result.data.videoUrl).toBe(url)
      })
    })
  })
})
