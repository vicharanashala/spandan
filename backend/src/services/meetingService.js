/**
 * Service to generate Zoom and Microsoft Teams meeting links via their APIs.
 * 
 * Note: Since obtaining real credentials requires Zoom/Azure admin approval, 
 * this service uses a mock flow by default unless real environment variables are provided.
 */

export const generateZoomMeeting = async (roomTitle) => {
  const accountId = process.env.ZOOM_ACCOUNT_ID
  const clientId = process.env.ZOOM_CLIENT_ID
  const clientSecret = process.env.ZOOM_CLIENT_SECRET

  if (!accountId || !clientId || !clientSecret) {
    console.log('[MeetingService] Using Mock Zoom API...')
    // Mock API Delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    const randomMeetingId = Math.floor(Math.random() * 10000000000)
    return `https://zoom.us/j/${randomMeetingId}`
  }

  // Real Zoom API Flow (Placeholder logic)
  try {
    // 1. Get OAuth Token (Server-to-Server)
    console.log('[MeetingService] Attempting real Zoom API call...')
    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const tokenResponse = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${authHeader}` }
    })
    const tokenData = await tokenResponse.json()

    // 2. Create Meeting
    const meetingResponse = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topic: `Spandan Poll: ${roomTitle || 'Live Session'}`,
        type: 1, // Instant meeting
      })
    })
    
    const meetingData = await meetingResponse.json()
    return meetingData.join_url
  } catch (err) {
    console.error('[MeetingService] Zoom API Error:', err)
    throw new Error('Failed to create Zoom meeting')
  }
}

export const generateTeamsMeeting = async (roomTitle) => {
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    console.log('[MeetingService] Using Mock Teams API...')
    await new Promise(resolve => setTimeout(resolve, 1000))
    const randomMeetingId = Math.floor(Math.random() * 10000000000)
    return `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${randomMeetingId}%40thread.v2/0?context=%7b%22Tid%22%3a%22mock-tenant-id%22%2c%22Oid%22%3a%22mock-oid%22%7d`
  }

  // Real Microsoft Graph API Flow
  try {
    console.log('[MeetingService] Attempting real Teams API call...')
    // 1. Get Token
    const tokenParams = new URLSearchParams()
    tokenParams.append('client_id', clientId)
    tokenParams.append('scope', 'https://graph.microsoft.com/.default')
    tokenParams.append('client_secret', clientSecret)
    tokenParams.append('grant_type', 'client_credentials')

    const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      body: tokenParams
    })
    const tokenData = await tokenResponse.json()

    // 2. Create Online Meeting
    const meetingResponse = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: `Spandan Poll: ${roomTitle || 'Live Session'}`
      })
    })

    const meetingData = await meetingResponse.json()
    return meetingData.joinWebUrl
  } catch (err) {
    console.error('[MeetingService] Teams API Error:', err)
    throw new Error('Failed to create Teams meeting')
  }
}
