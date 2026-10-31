import { renderHook, act } from '@testing-library/react'

jest.mock('../lib/sounds', () => ({ playTeacherReady: jest.fn().mockResolvedValue('played') }))
import { playTeacherReady } from '../lib/sounds'
import useGeneratedBatchCues, { TITLE_ALERT } from '../hooks/useGeneratedBatchCues'

const makeSocket = () => ({ emit: jest.fn() })

describe('useGeneratedBatchCues (teacher side)', () => {
  beforeEach(() => { jest.clearAllMocks(); document.title = 'Spandan' })
  afterEach(() => { jest.useRealTimers() })

  it('chimes and emits questions:ready exactly once per batch (closed→open), never while open or on close', () => {
    const socket = makeSocket()
    const { rerender } = renderHook(({ open }) => useGeneratedBatchCues(open, socket, 'ABC123'), { initialProps: { open: false } })
    expect(playTeacherReady).not.toHaveBeenCalled()

    rerender({ open: true })   // batch 1 arrives
    expect(playTeacherReady).toHaveBeenCalledTimes(1)
    expect(socket.emit).toHaveBeenCalledWith('questions:ready', { roomCode: 'ABC123' })

    rerender({ open: true })   // teacher steps Q1→Q2 (still open): no second cue
    rerender({ open: false })  // popup closes: no cue
    expect(playTeacherReady).toHaveBeenCalledTimes(1)
    expect(socket.emit).toHaveBeenCalledTimes(1)

    rerender({ open: true })   // batch 2 (next segment)
    expect(playTeacherReady).toHaveBeenCalledTimes(2)
    expect(socket.emit).toHaveBeenCalledTimes(2)
  })

  it('does nothing while open stays false (Create Q path)', () => {
    const socket = makeSocket()
    const { rerender } = renderHook(({ open }) => useGeneratedBatchCues(open, socket, 'ABC123'), { initialProps: { open: false } })
    rerender({ open: false }); rerender({ open: false })
    expect(playTeacherReady).not.toHaveBeenCalled()
    expect(socket.emit).not.toHaveBeenCalled()
  })

  it('still chimes locally when the socket is not ready, without throwing', () => {
    const { rerender } = renderHook(({ open }) => useGeneratedBatchCues(open, null, undefined), { initialProps: { open: false } })
    rerender({ open: true })
    expect(playTeacherReady).toHaveBeenCalledTimes(1)
  })

  it('flashes the tab title only while the tab is away, and restores it on close', () => {
    jest.useFakeTimers()
    const hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const focus = jest.spyOn(document, 'hasFocus').mockReturnValue(true)
    const { rerender, unmount } = renderHook(({ open }) => useGeneratedBatchCues(open, makeSocket(), 'ABC123'), { initialProps: { open: false } })

    rerender({ open: true })
    act(() => { jest.advanceTimersByTime(3000) })
    expect(document.title).toBe('Spandan')          // tab in front: no flashing

    hidden.mockReturnValue(true)                     // teacher switches to another tab
    act(() => { jest.advanceTimersByTime(1000) })
    expect(document.title).toBe(TITLE_ALERT)
    act(() => { jest.advanceTimersByTime(1000) })
    expect(document.title).toBe('Spandan')
    act(() => { jest.advanceTimersByTime(1000) })
    expect(document.title).toBe(TITLE_ALERT)

    hidden.mockReturnValue(false)                    // teacher comes back
    act(() => { jest.advanceTimersByTime(1000) })
    expect(document.title).toBe('Spandan')

    focus.mockReturnValue(false)                     // window visible but another app in front
    act(() => { jest.advanceTimersByTime(1000) })
    expect(document.title).toBe(TITLE_ALERT)

    rerender({ open: false })                        // popup closed: restored immediately
    expect(document.title).toBe('Spandan')
    act(() => { jest.advanceTimersByTime(5000) })
    expect(document.title).toBe('Spandan')           // and the interval is gone
    unmount()
    hidden.mockRestore(); focus.mockRestore()
  })
})
