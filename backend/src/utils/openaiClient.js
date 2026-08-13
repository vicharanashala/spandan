// backend/src/utils/openaiClient.js


const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-3.5-turbo';

export async function generateQuestion(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${err}`);
  }

  const data = await response.json();
  const generated = data.choices?.[0]?.message?.content?.trim();
  return generated;
}
