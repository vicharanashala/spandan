const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it']

export async function generateWithGroq(prompt, apiKey, model = 'llama-3.3-70b-versatile') {
  if (!apiKey) {
    throw new Error('Groq API key is required')
  }

  if (!GROQ_MODELS.includes(model)) {
    throw new Error(`Invalid Groq model: ${model}. Supported: ${GROQ_MODELS.join(', ')}`)
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })
  })

  if (!response.ok) {
    let errorMessage
    try {
      const errorData = await response.json()
      errorMessage = errorData.error?.message || errorData.error || JSON.stringify(errorData)
    } catch {
      errorMessage = await response.text().catch(() => 'Unknown error')
    }

    if (response.status === 401 || (response.status === 400 && /invalid|incorrect|unauthorized/i.test(errorMessage))) {
      throw new Error('Invalid Groq API key. Get a free key at https://console.groq.com.')
    }
    if (response.status === 429) {
      throw new Error('Groq API rate limit exceeded. Please wait a moment and try again.')
    }

    throw new Error(`Groq API error (${response.status}): ${errorMessage}`)
  }

  const data = await response.json()

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Groq API returned an empty response. Please try again.')
  }

  return data.choices[0].message.content || ''
}

export { GROQ_MODELS }
