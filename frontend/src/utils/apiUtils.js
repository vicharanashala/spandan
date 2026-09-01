/**
 * Safely parse response JSON without throwing "Unexpected end of JSON input"
 * on empty bodies or non-JSON responses (HTML error pages, 502/504, 204, etc.)
 */
export async function safeParseJson(response) {
  const text = await response.text()
  let data = null

  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const errorMsg =
      data?.error ||
      data?.message ||
      (text && text.length < 200 ? text : `Request failed with status ${response.status}`)
    const error = new Error(errorMsg)
    error.status = response.status
    error.data = data
    throw error
  }

  return data ?? {}
}
