/**
 * useBroadcastChannel.js
 * ----------------------
 * Generic React hook wrapping BroadcastChannel. Avoids creating a
 * channel until mount, and tears it down on unmount. Safe in
 * non-browser test environments (returns a stub).
 */

import { useEffect, useRef } from 'react'
import { createPeerChannel } from '../utils/peerChannel.js'

/**
 * useBroadcastChannel(handler)
 * ----------------------------
 *   handler(msg): receives every valid BroadcastChannel message
 *                 for the lifetime of the component.
 *
 * Returns:
 *   { post: (type, payload) => boolean, close: () => void }
 *
 * If BroadcastChannel is unavailable in the runtime, post() returns
 * false and close() does nothing.
 */
export function useBroadcastChannel(handler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const channelRef = useRef(null)

  useEffect(() => {
    const channel = createPeerChannel(function (msg) {
      if (handlerRef.current) {
        try {
          handlerRef.current(msg)
        } catch (_) {
          // swallow
        }
      }
    })
    channelRef.current = channel
    return function cleanup() {
      if (channelRef.current && typeof channelRef.current.close === 'function') {
        try {
          channelRef.current.close()
        } catch (_) {}
      }
      channelRef.current = null
    }
  }, [])

  function post(type, payload) {
    if (!channelRef.current) return false
    return channelRef.current.post(type, payload)
  }

  function close() {
    if (channelRef.current && typeof channelRef.current.close === 'function') {
      try {
        channelRef.current.close()
      } catch (_) {}
      channelRef.current = null
    }
  }

  return { post: post, close: close }
}