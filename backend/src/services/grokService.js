const GROK_API_URL = 'https://api.x.ai/v1/chat/completions'
const GROK_MODELS = ['grok-4', 'grok-4-fast', 'grok-3', 'grok-3-mini']

const GROK_SYSTEM_PROMPT = 'You are an expert technical interviewer. Generate high-quality interview questions based on the requested topic. Return ONLY valid JSON without markdown or additional text.'

export async function generateWithGrok(prompt, apiKey, model = 'grok-4') {
  if (!apiKey) {
    throw new Error('Grok API key is required')
  }

  if (!GROK_MODELS.includes(model)) {
    throw new Error(`Invalid Grok model: ${model}. Supported: ${GROK_MODELS.join(', ')}`)
  }

  const response = await fetch(GROK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: GROK_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7
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

    const isAuthError = response.status === 401 ||
      (response.status === 400 && /incorrect|invalid|unauthorized/i.test(errorMessage))

    if (isAuthError) {
      throw new Error('Invalid Grok API key. Please check your API key and try again.')
    }
    if (response.status === 403) {
      throw new Error('Grok API: Your xAI account needs credits or a license. Visit https://console.x.ai to purchase.')
    }
    if (response.status === 429) {
      throw new Error('Grok API rate limit exceeded. Please wait a moment and try again.')
    }

    throw new Error(`Grok API error (${response.status}): ${errorMessage}`)
  }

  const data = await response.json()

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Grok API returned an empty response. Please try again.')
  }

  return data.choices[0].message.content || ''
}

export { GROK_MODELS }
