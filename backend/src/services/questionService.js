import Question from '../models/Question.js'
import Response from '../models/Response.js'
import Room from '../models/Room.js'

export const createQuestion = async (data, createdBy) => {
  const question = new Question({
    question: data.question,
    options: data.options,
    correctOptionIndex: data.correctOptionIndex,
    room: data.roomId,
    createdBy,
    source: data.source || 'manual',
    timer: data.timer || 30
  })

  await question.save()
  return question
}

export const getQuestionById = async (id) => {
  const question = await Question.findById(id).populate('createdBy', 'name email')
  
  if (!question) {
    throw new Error('Question not found')
  }
  
  return question
}

export const getQuestionsByRoom = async (roomId) => {
  return Question.find({ room: roomId }).sort({ createdAt: 1 })
}

export const updateQuestion = async (questionId, updates, userId) => {
  const question = await Question.findById(questionId)
  
  if (!question) {
    throw new Error('Question not found')
  }
  
  // Check ownership
  if (question.createdBy.toString() !== userId.toString()) {
    throw new Error('Not authorized to update this question')
  }
  
  Object.assign(question, updates)
  await question.save()
  
  return question
}

export const deleteQuestion = async (questionId, userId) => {
  const question = await Question.findById(questionId)
  
  if (!question) {
    throw new Error('Question not found')
  }
  
  if (question.createdBy.toString() !== userId.toString()) {
    throw new Error('Not authorized to delete this question')
  }
  
  await Question.findByIdAndDelete(questionId)
  
  // Also delete related responses
  await Response.deleteMany({ question: questionId })
  
  return true
}

export const setActiveQuestion = async (roomId, questionId) => {
  // Deactivate all questions in the room
  await Question.updateMany(
    { room: roomId },
    { $set: { isActive: false } }
  )
  
  // Activate the specified question
  const question = await Question.findByIdAndUpdate(
    questionId,
    { $set: { isActive: true } },
    { new: true }
  )
  
  if (!question) {
    throw new Error('Question not found')
  }
  
  // Update room's currentQuestion
  await Room.findByIdAndUpdate(roomId, { currentQuestion: questionId })
  
  return question
}

export const submitResponse = async (data, studentId) => {
  const { questionId, selectedOption, responseTime } = data
  
  // Get the question to check correct answer
  const question = await Question.findById(questionId)
  
  if (!question) {
    throw new Error('Question not found')
  }
  
  const isCorrect = selectedOption === question.correctOptionIndex
  
  const response = new Response({
    question: questionId,
    room: question.room,
    student: studentId,
    selectedOption,
    isCorrect,
    responseTime
  })

  await response.save()
  
  return response
}

export const getResponsesByQuestion = async (questionId) => {
  return Response.find({ question: questionId })
    .populate('student', 'name email')
    .sort({ createdAt: -1 })
}

export const getResponsesByRoom = async (roomId) => {
  return Response.find({ room: roomId })
    .populate('student', 'name email')
    .sort({ createdAt: -1 })
}

export const getQuestionResults = async (questionId) => {
  const responses = await Response.find({ question: questionId })
  
  const totalResponses = responses.length
  
  if (totalResponses === 0) {
    return {
      totalResponses: 0,
      results: {},
      correctPercentage: 0
    }
  }
  
  const results = {}
  let correctCount = 0
  
  responses.forEach(response => {
    const option = response.selectedOption
    results[option] = (results[option] || 0) + 1
    
    if (response.isCorrect) {
      correctCount++
    }
  })
  
  return {
    totalResponses,
    results,
    correctPercentage: Math.round((correctCount / totalResponses) * 100)
  }
}