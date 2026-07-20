// Browser Notifications API wrapper — used by the student-side quiz countdown to surface an
// OS-level notification in addition to the in-app popup. All entry points fail silently:
// if the API is unavailable or permission was denied, the in-app popup still works.

const COUNTDOWN_NOTIFICATION_TAG = 'spandan-quiz-countdown'

function isSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function requestNotificationPermission() {
  if (!isSupported()) return 'unsupported'
  // Only prompt when the browser is in 'default' (hasn't asked yet). 'granted' / 'denied'
  // are terminal states and re-prompting would either be a no-op or annoy the user.
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch (err) {
    console.warn('[notifications] requestPermission failed:', err)
    return 'denied'
  }
}

export function showQuizCountdownNotification(duration) {
  if (!isSupported()) return
  if (Notification.permission !== 'granted') return
  try {
    const seconds = Number.isFinite(Number(duration)) ? Number(duration) : 15
    const notification = new Notification('Spandan', {
      body: `Quiz starts in ${seconds} seconds — click to view`,
      tag: COUNTDOWN_NOTIFICATION_TAG,
      silent: false
    })
    notification.onclick = () => {
      try {
        window.focus()
      } catch (err) {
        console.warn('[notifications] focus failed:', err)
      }
      notification.close()
    }
  } catch (err) {
    console.warn('[notifications] failed to show countdown notification:', err)
  }
}
