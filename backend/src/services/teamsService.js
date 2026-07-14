
/**
 * Sends a live Spandan Poll to a Microsoft Teams channel via Incoming Webhook.
 * Formatted as an Office 365 Connector Card (MessageCard).
 */
export const sendPollToTeams = async (webhookUrl, room, question) => {
  if (!webhookUrl) return

  // Base URL of the Spandan frontend
  // Fallback to spandan.fun if VITE_API_URL is missing, or localhost for dev
  const baseUrl = process.env.VITE_API_URL ? process.env.VITE_API_URL.replace('/api', '') : 'http://localhost:5173'

  // Build the action buttons
  // When clicked, it will open the Spandan "Quick Answer" route in their browser
  const actions = question.options.map((option, index) => ({
    '@type': 'OpenUri',
    name: `Submit: ${option}`,
    targets: [
      {
        os: 'default',
        uri: `${baseUrl}/student/quick-answer/${room._id}/${question._id}/${index}`
      }
    ]
  }))

  const messageCard = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '7c3aed',
    summary: `Live Poll: ${question.question}`,
    sections: [
      {
        activityTitle: `**Live Poll Started in ${room.name}**`,
        activitySubtitle: 'Answer the question below!',
        activityImage: 'https://cdn-icons-png.flaticon.com/512/3256/3256075.png', // Polling icon
        facts: [
          { name: 'Time Limit', value: `${question.timeToAnswer || 30} seconds` },
          { name: 'Room Code', value: room.code }
        ],
        text: `### ${question.question}`
      }
    ],
    potentialAction: actions
  }

  try {
    console.log(`[TeamsService] Pushing poll to Teams webhook for Room ${room.code}`)
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messageCard)
    })

    if (!response.ok) {
      console.error(`[TeamsService] Webhook failed with status ${response.status}`)
    } else {
      console.log(`[TeamsService] Successfully pushed poll to Teams`)
    }
  } catch (error) {
    console.error('[TeamsService] Error pushing poll to Teams:', error)
  }
}
