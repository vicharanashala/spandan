/**
 * peerChannel.js
 * --------------
 * Typed wrapper around the BroadcastChannel API for cross-tab
 * peer-review coordination. Channel name is locked to
 * 'spandan:peer-review'. Messages are validated against the
 * BROADCAST_MESSAGE_TYPES allow-list from peerReviewHelpers.
 *
 * Designed for the locked use case: student running multiple tabs
 * of the same live quiz session. Single-origin only.
 *
 * IMPORTANT: this file intentionally avoids a module-level
 * BroadcastChannel instance. Creating the channel eagerly breaks
 * SSR / non-browser test environments. Use `createPeerChannel()`
 * which is a no-op in non-browser contexts.
 */

import {
  BROADCAST_CHANNEL_NAME,
  BROADCAST_MESSAGE_TYPES,
  isValidBroadcastMessage,
  makeBroadcastMessage
} from '../stores/peerReviewHelpers.js'

/**
 * isBroadcastChannelAvailable()
 * ------------------------------
 * True if the runtime exposes a working BroadcastChannel.
 */
export function isBroadcastChannelAvailable() {
  try {
    return typeof globalThis !== 'undefined' && typeof globalThis.BroadcastChannel === 'function'
  } catch (_) {
    return false
  }
}

/**
 * createPeerChannel(handler)
 * --------------------------
 * Returns an object with post() / close() and an unsubscribe.
 * If BroadcastChannel is unavailable, returns a stub object whose
 * post() is a no-op and close() does nothing.
 *
 *   handler(msg): called for every valid incoming message.
 *                 Invalid messages are dropped silently.
 */
export function createPeerChannel(handler) {
  const safeHandler = typeof handler === 'function' ? handler : function () {}
  if (!isBroadcastChannelAvailable()) {
    return {
      name: BROADCAST_CHANNEL_NAME,
      available: false,
      post: function () {},
      close: function () {
        return true
      },
      addEventListener: function () {},
      removeEventListener: function () {}
    }
  }

  let channel
  try {
    channel = new globalThis.BroadcastChannel(BROADCAST_CHANNEL_NAME)
  } catch (_) {
    return {
      name: BROADCAST_CHANNEL_NAME,
      available: false,
      post: function () {},
      close: function () {
        return true
      },
      addEventListener: function () {},
      removeEventListener: function () {}
    }
  }

  function onMessage(event) {
    const msg = event && event.data
    if (!isValidBroadcastMessage(msg)) return
    try {
      safeHandler(msg)
    } catch (_) {
      // swallow handler errors so the channel stays alive
    }
  }

  channel.addEventListener('message', onMessage)

  return {
    name: BROADCAST_CHANNEL_NAME,
    available: true,
    post: function (type, payload) {
      const msg = makeBroadcastMessage(type, payload)
      if (!msg) return false
      try {
        channel.postMessage(msg)
        return true
      } catch (_) {
        return false
      }
    },
    addEventListener: function (type, fn) {
      // Permits explicit subscribers in addition to the handler.
      // Currently unused but exposed for API symmetry.
      if (typeof type !== 'string' || typeof fn !== 'function') return
      const listener = function (event) {
        const msg = event && event.data
        if (!msg || msg.type !== type) return
        fn(msg.payload, msg)
      }
      channel.addEventListener('message', listener)
    },
    removeEventListener: function (type, fn) {
      // Best-effort; removeEventListener identity match is fine for
      // symmetric add/remove.
      if (typeof fn !== 'function') return
      try {
        channel.removeEventListener('message', fn)
      } catch (_) {}
    },
    close: function () {
      try {
        channel.removeEventListener('message', onMessage)
        channel.close()
        return true
      } catch (_) {
        return false
      }
    }
  }
}

/**
 * broadcastHello(tabId)
 * ----------------------
 * Convenience: announce this tab is alive on the peer-review channel.
 * Returns true if posted, false otherwise.
 */
export function broadcastHello(channel, tabId) {
  if (!channel || !channel.available) return false
  return channel.post('peer-review:hello', { tabId: typeof tabId === 'string' ? tabId : '' })
}

/**
 * broadcastRequest(channel, payload)
 * -----------------------------------
 * Convenience: post a peer-review request.
 */
export function broadcastRequest(channel, payload) {
  if (!channel || !channel.available) return false
  return channel.post('peer-review:request', payload || {})
}

/**
 * broadcastAnswer(channel, payload)
 * ----------------------------------
 * Convenience: share an answer with the peer.
 */
export function broadcastAnswer(channel, payload) {
  if (!channel || !channel.available) return false
  return channel.post('peer-review:answer-shared', payload || {})
}

/**
 * broadcastGrade(channel, payload)
 * --------------------------------
 * Convenience: submit a grade via the channel.
 */
export function broadcastGrade(channel, payload) {
  if (!channel || !channel.available) return false
  return channel.post('peer-review:grade-submitted', payload || {})
}

/**
 * broadcastCancel(channel, payload)
 * ---------------------------------
 * Convenience: cancel an active pairing.
 */
export function broadcastCancel(channel, payload) {
  if (!channel || !channel.available) return false
  return channel.post('peer-review:cancel', payload || {})
}

// --- Test-only helpers ---------------------------------------------------

/**
 * _resetPeerChannelForTests()
 * ----------------------------
 * No-op in practice. Provided for API symmetry with the other
 * test-only helpers. Clears any module-cached state if added later.
 */
export function _resetPeerChannelForTests() {
  return true
}

export const PEER_CHANNEL_CONSTANTS = Object.freeze({
  BROADCAST_CHANNEL_NAME,
  BROADCAST_MESSAGE_TYPES
})