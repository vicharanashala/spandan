
import React, { useState } from 'react'
import { Library, Plus, Search } from 'lucide-react'

export default function TeacherQuestionBankPage() {
  const [questions, setQuestions] = useState([])
  const [search, setSearch] = useState('')
  const [question, setQuestion] = useState('')

  const addQuestion = (e) => {
    e.preventDefault()

    if (!question.trim()) return

    setQuestions([
      ...questions,
      {
        id: Date.now(),
        question: question.trim(),
      },
    ])

    setQuestion('')
  }

  const filteredQuestions = questions.filter((item) =>
    item.question.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center gap-3">
          <Library size={32} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Question Bank
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Save and organize questions for future classrooms.
            </p>
          </div>
        </div>

        <form onSubmit={addQuestion} className="mb-6 flex gap-3">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Enter a question..."
            className="min-w-0 flex-1 rounded-lg border p-3 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-white"
          >
            <Plus size={18} />
            Add
          </button>
        </form>

        <div className="mb-4 flex items-center gap-2 rounded-lg border bg-white px-3 dark:border-gray-700 dark:bg-gray-900">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions..."
            className="w-full bg-transparent p-3 outline-none dark:text-white"
          />
        </div>

        <div className="space-y-3">
          {filteredQuestions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-gray-500 dark:border-gray-700">
              {search
                ? 'No matching questions found.'
                : 'No saved questions yet. Add your first question above.'}
            </div>
          ) : (
            filteredQuestions.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
              >
                <p className="text-gray-900 dark:text-white">
                  <span className="mr-2 text-gray-500">{index + 1}.</span>
                  {item.question}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setQuestions(questions.filter((q) => q.id !== item.id))
                  }
                  className="text-sm text-red-600"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
