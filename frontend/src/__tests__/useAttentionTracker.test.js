import { act, renderHook } from '@testing-library/react'
import useAttentionTracker, { DEFAULT_ATTENTION_GRACE_SECONDS } from '../hooks/useAttentionTracker'

// The client half of attention tracking: a hidden tab or an unfocused window starts a grace timer,
// then reports `away`; returning holds the answer block until the server acks the reopened presence.
const makeSocket = () => {
  const handlers = {}
  return {
    connected: true,
    emit: jest.fn(),
    on: jest.fn((event, fn) => { (handlers[event] = handlers[event] || []).push(fn) }),
    off: jest.fn((event, fn) => { handlers[event] = (handlers[event] || []).filter((h) => h !== fn) }),
    trigger: (event, data) => (handlers[event] || []).forEach((fn) => fn(data))
  }
}

const ROOM = 'ABC123'
const T0 = new Date('2026-01-01T09:00:00Z')

const awayEmit = (reason = 'tab-hidden', since = T0.getTime()) =>
  ['attention:update', { roomCode: ROOM, state: 'away', reason, since }]
const activeEmit = () =>
  ['attention:update', { roomCode: ROOM, state: 'active', reason: null, since: null }]

describe('useAttentionTracker', () => {
  let hidden
  let focused
  let socket

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(T0)
    hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    focused = jest.spyOn(document, 'hasFocus').mockReturnValue(true)
    socket = makeSocket()
  })

  afterEach(() => {
    hidden.mockRestore()
    focused.mockRestore()
    jest.useRealTimers()
  })

  const mount = (options = {}) => renderHook(() => useAttentionTracker({
    socket,
    roomCode: ROOM,
    enabled: true,
    graceSeconds: DEFAULT_ATTENTION_GRACE_SECONDS,
    ...options
  }))

  const blurWindow = () => act(() => { window.dispatchEvent(new Event('blur')) })
  const focusWindow = () => act(() => { window.dispatchEvent(new Event('focus')) })
  const hideTab = () => { hidden.mockReturnValue(true); blurWindow() }
  const showTab = () => { hidden.mockReturnValue(false); focused.mockReturnValue(true); focusWindow() }

  it('announces active on mount and never blocks', () => {
    const { result, unmount } = mount()

    expect(result.current).toMatchObject({
      state: 'active',
      away: false,
      returning: false,
      blocked: false,
      reason: null,
      awaySince: null
    })
    expect(socket.emit).toHaveBeenCalledWith(...activeEmit())
    unmount()
  })

  it('marks away only after the grace period, backdated to when the tab was hidden', () => {
    const { result, unmount } = mount()

    hideTab()
    act(() => { jest.advanceTimersByTime(6999) })

    expect(result.current.state).toBe('active')
    expect(socket.emit).not.toHaveBeenCalledWith(...awayEmit())

    act(() => { jest.advanceTimersByTime(1) })

    expect(result.current).toMatchObject({
      state: 'away',
      away: true,
      blocked: true,
      reason: 'tab-hidden',
      awaySince: T0.getTime()
    })
    expect(socket.emit).toHaveBeenCalledWith(...awayEmit())
    unmount()
  })

  it('ignores a brief focus loss that ends inside the grace period', () => {
    const { result, unmount } = mount()

    hideTab()
    act(() => { jest.advanceTimersByTime(5000) })
    showTab()
    act(() => { jest.advanceTimersByTime(10000) })

    expect(result.current.state).toBe('active')
    expect(socket.emit).not.toHaveBeenCalledWith(...awayEmit())
    unmount()
  })

  it('reports an unfocused window (another app) even while the tab stays visible', () => {
    const { result, unmount } = mount()

    focused.mockReturnValue(false)
    blurWindow()
    act(() => { jest.advanceTimersByTime(7000) })

    expect(result.current).toMatchObject({ state: 'away', reason: 'window-blur', blocked: true })
    expect(socket.emit).toHaveBeenCalledWith(...awayEmit('window-blur'))
    unmount()
  })

  it('marks away on blur even when hasFocus still reports the old window', () => {
    // Some browsers dispatch blur before document.hasFocus() flips. Trusting the event (rather than
    // re-reading hasFocus) is what makes switching to an already-open app count as absence.
    const { result, unmount } = mount()

    blurWindow()
    act(() => { jest.advanceTimersByTime(7000) })

    expect(result.current).toMatchObject({ state: 'away', reason: 'window-blur', blocked: true })
    expect(socket.emit).toHaveBeenCalledWith(...awayEmit('window-blur'))
    unmount()
  })

  it('heartbeat re-syncs a focus loss that never fired blur', () => {
    const { result, unmount } = mount()

    focused.mockReturnValue(false)
    act(() => { jest.advanceTimersByTime(10000) })
    expect(result.current.state).toBe('active')

    act(() => { jest.advanceTimersByTime(7000) })

    expect(result.current).toMatchObject({ state: 'away', reason: 'window-blur' })
    expect(socket.emit).toHaveBeenCalledWith('attention:update', {
      roomCode: ROOM,
      state: 'away',
      reason: 'window-blur',
      since: T0.getTime() + 10000
    })
    unmount()
  })

  it('re-announces the current state when this socket joins the room', () => {
    const { result, unmount } = mount()
    socket.emit.mockClear()

    act(() => { socket.trigger('room:joined', { roomCode: ROOM }) })
    expect(socket.emit).toHaveBeenCalledWith(...activeEmit())

    hideTab()
    act(() => { jest.advanceTimersByTime(7000) })
    socket.emit.mockClear()
    act(() => { socket.trigger('room:joined', { roomCode: ROOM }) })

    expect(result.current.state).toBe('away')
    expect(socket.emit).toHaveBeenCalledWith(...awayEmit())
    unmount()
  })

  it('closes presence immediately when the page is navigated away', () => {
    const { result, unmount } = mount()

    act(() => { window.dispatchEvent(new Event('pagehide')) })

    expect(result.current).toMatchObject({ state: 'away', blocked: true, reason: 'window-blur' })
    expect(socket.emit).toHaveBeenCalledWith('attention:update', {
      roomCode: ROOM,
      state: 'away',
      reason: 'window-blur',
      since: T0.getTime()
    })
    unmount()
  })

  it('holds the block on return until the server acks the reopened presence', () => {
    const { result, unmount } = mount()

    hideTab()
    act(() => { jest.advanceTimersByTime(7000) })
    expect(result.current.state).toBe('away')

    showTab()
    expect(result.current).toMatchObject({ state: 'returning', away: true, blocked: true })
    expect(socket.emit).toHaveBeenCalledWith(...activeEmit())

    act(() => { socket.trigger('attention:ack', { roomCode: ROOM, state: 'active', disabled: false }) })

    expect(result.current).toMatchObject({ state: 'active', away: false, blocked: false, reason: null })
    unmount()
  })

  it('retries the active report while returning so a lost ack cannot keep Submit locked', () => {
    const { result, unmount } = mount()

    hideTab()
    act(() => { jest.advanceTimersByTime(7000) })
    showTab()
    socket.emit.mockClear()

    act(() => { jest.advanceTimersByTime(2500) })
    expect(socket.emit).toHaveBeenCalledWith(...activeEmit())

    act(() => { socket.trigger('attention:ack', { roomCode: ROOM, state: 'active', disabled: false }) })
    socket.emit.mockClear()
    act(() => { jest.advanceTimersByTime(2500) })
    expect(socket.emit).not.toHaveBeenCalledWith(...activeEmit())
    expect(result.current.state).toBe('active')
    unmount()
  })

  it('re-announces active when the server reports it was away while this tab is active', () => {
    const { result, unmount } = mount()
    socket.emit.mockClear()

    act(() => { socket.trigger('attention:ack', { roomCode: ROOM, state: 'away', disabled: false }) })

    expect(result.current.state).toBe('active')
    expect(socket.emit).toHaveBeenCalledWith(...activeEmit())
    unmount()
  })

  it('treats a disabled room as never blocked', () => {
    const { result, unmount } = mount({ enabled: false })

    expect(result.current).toMatchObject({ state: 'disabled', away: false, blocked: false })
    expect(socket.emit).not.toHaveBeenCalled()
    unmount()
  })

  it('accepts a server ack that disables tracking mid-session', () => {
    const { result, unmount } = mount()

    hideTab()
    act(() => { jest.advanceTimersByTime(7000) })
    expect(result.current.blocked).toBe(true)

    act(() => { socket.trigger('attention:ack', { roomCode: ROOM, disabled: true }) })

    expect(result.current).toMatchObject({ state: 'disabled', blocked: false })
    unmount()
  })

  it('ignores an ack for a different room', () => {
    const { result, unmount } = mount()

    hideTab()
    act(() => { jest.advanceTimersByTime(7000) })
    act(() => { socket.trigger('attention:ack', { roomCode: 'OTHER', state: 'active', disabled: false }) })

    expect(result.current.state).toBe('away')
    unmount()
  })

  it('sends a heartbeat only while active and attentive', () => {
    const { result, unmount } = mount()
    socket.emit.mockClear()

    act(() => { jest.advanceTimersByTime(10000) })
    expect(socket.emit).toHaveBeenCalledWith('attention:ping', { roomCode: ROOM })

    hideTab()
    act(() => { jest.advanceTimersByTime(7000) })
    expect(result.current.state).toBe('away')
    socket.emit.mockClear()
    act(() => { jest.advanceTimersByTime(20000) })
    expect(socket.emit).not.toHaveBeenCalledWith('attention:ping', { roomCode: ROOM })
    unmount()
  })

  it('re-announces away after a reconnect instead of opening a phantom presence', () => {
    const { result, unmount } = mount()

    hideTab()
    act(() => { jest.advanceTimersByTime(7000) })
    socket.emit.mockClear()

    act(() => { socket.trigger('connect') })

    expect(result.current.state).toBe('away')
    expect(socket.emit).toHaveBeenCalledWith(...awayEmit())
    unmount()
  })

  it('clamps the grace period to 0..300 seconds', () => {
    const high = renderHook(() => useAttentionTracker({ socket, roomCode: ROOM, graceSeconds: 999 }))
    expect(high.result.current.graceSeconds).toBe(300)
    high.unmount()

    const low = renderHook(() => useAttentionTracker({ socket, roomCode: ROOM, graceSeconds: -5 }))
    expect(low.result.current.graceSeconds).toBe(0)
    low.unmount()
  })

  it('is inactive without a connected room/socket', () => {
    const noSocket = renderHook(() => useAttentionTracker({ socket: null, roomCode: ROOM }))
    expect(noSocket.result.current).toMatchObject({ state: 'disabled', blocked: false })
    noSocket.unmount()

    const noRoom = renderHook(() => useAttentionTracker({ socket, roomCode: null }))
    expect(noRoom.result.current).toMatchObject({ state: 'disabled', blocked: false })
    noRoom.unmount()
  })
})
