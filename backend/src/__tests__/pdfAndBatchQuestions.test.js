import { generateOfflineQuestions } from '../services/smartOfflineQuestionGenerator.js'
import { extractTextFromPdf } from '../utils/pdfExtractor.js'

describe('PDF Extraction and Batch Questions Suite', () => {
  describe('Smart Offline Question Generator', () => {
    const sampleLectureText = `
      Photosynthesis is the process by which green plants convert sunlight into chemical energy.
      Chlorophyll is the primary pigment responsible for absorbing blue and red light while reflecting green.
      Light-dependent reactions take place inside the thylakoid membranes of chloroplasts.
      During the Calvin cycle, carbon dioxide is fixed into glucose molecules without requiring direct sunlight.
      Oxygen is released into the atmosphere as a byproduct of water photolysis during the light reactions.
      Adenosine triphosphate serves as the primary energy currency in all cellular biological operations.
      Cellular respiration is an exothermic reaction that breaks down glucose to release energy for metabolic processes.
      Mitochondria are often referred to as the powerhouses of eukaryotic cells due to ATP synthesis.
    `

    it('generates the requested number of questions with valid structures', () => {
      const questions = generateOfflineQuestions(sampleLectureText, { numQuestions: 6, difficulty: 'medium' })
      expect(questions).toBeInstanceOf(Array)
      expect(questions.length).toBe(6)

      // Verify each question has valid fields
      questions.forEach(q => {
        expect(q.question).toBeTruthy()
        expect(q.options.length).toBeGreaterThanOrEqual(2)
        expect(['MCQ', 'TF', 'MSQ']).toContain(q.type)
        expect(q.options.some(opt => opt.isCorrect)).toBe(true)
        expect(q.explanation).toBeTruthy()
      })
    })

    it('generates 10-15 questions when requested for a full quiz batch', () => {
      const questions = generateOfflineQuestions(sampleLectureText, { numQuestions: 12, difficulty: 'hard' })
      expect(questions.length).toBe(12)
      
      const mcqs = questions.filter(q => q.type === 'MCQ')
      const tfs = questions.filter(q => q.type === 'TF')
      const msqs = questions.filter(q => q.type === 'MSQ')

      expect(mcqs.length).toBeGreaterThan(0)
      expect(tfs.length).toBeGreaterThan(0)
      expect(msqs.length).toBeGreaterThan(0)
    })

    it('throws an error if the text is empty or too short', () => {
      expect(() => generateOfflineQuestions('Short', { numQuestions: 5 })).toThrow()
    })
  })

  describe('PDF Text Extractor', () => {
    it('rejects empty input buffers or invalid data', async () => {
      await expect(extractTextFromPdf(Buffer.from(''))).rejects.toThrow('empty')
      await expect(extractTextFromPdf('not-valid-base64')).rejects.toThrow()
    })
  })
})
