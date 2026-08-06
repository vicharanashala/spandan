import React from 'react'
import { render, screen, act } from '@testing-library/react'

// config.js uses import.meta.env (not available under jest) — mock it.
jest.mock('../config.js', () => ({ API_URL: '/api', SOCKET_URL: 'http://localhost' }))
import Leaderboard from '../components/Leaderboard'

// Minimal fake socket: records handlers; emit() lets the test push server events.
function makeSocket() {
  const h = {}
  return {
    on: (e, fn) => { (h[e] = h[e] || []).push(fn) },
    off: (e, fn) => { if (h[e]) h[e] = h[e].filter(x => x !== fn) },
    emit: (e, p) => { (h[e] || []).forEach(fn => fn(p)) }
  }
}
const rows = (n) => Array.from({ length: n }, (_, i) => ({
  rank: i + 1, studentId: String(i + 1), studentName: `S${i + 1}`,
  totalPoints: 1000 - i * 10, correctCount: 5, totalAnswered: 10
}))
const jsonOk = (body) => ({ ok: true, json: async () => ({ success: true, isTeacher: false, userRank: null, totalParticipants: 20, topN: 10, ...body }) })

afterEach(() => { jest.restoreAllMocks(); jest.clearAllTimers(); jest.useRealTimers(); delete global.fetch })

describe('Leaderboard — privacy render + resilience', () => {
  it('student: renders the public top-10 from a successful fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonOk({ leaderboard: rows(10) }))
    render(<Leaderboard roomId="r1" token="t" socket={makeSocket()} userId="999" />)
    expect(await screen.findByText('S1')).toBeInTheDocument()
    expect(screen.getByText('S10')).toBeInTheDocument()
  })

  it('student below top-10: shows top-10 + own row (You), never a stranger', async () => {
    const me = { rank: 15, studentId: '999', studentName: 'Me', totalPoints: 500, correctCount: 3, totalAnswered: 10 }
    global.fetch = jest.fn().mockResolvedValue(jsonOk({ leaderboard: [...rows(10), me], userRank: 15 }))
    render(<Leaderboard roomId="r1" token="t" socket={makeSocket()} userId="999" />)
    expect(await screen.findByText(/Me \(You\)/)).toBeInTheDocument()
    expect(screen.queryByText('S11')).toBeNull() // ranks 11-14 must not leak to a below-cutoff student
  })

  it('teacher: renders the full board (beyond top-10 visible)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, isTeacher: true, leaderboard: rows(12), totalParticipants: 12, topN: 10 }) })
    render(<Leaderboard roomId="r1" token="t" socket={makeSocket()} userId="x" />)
    expect(await screen.findByText('S12')).toBeInTheDocument()
  })

  it('self-heals: a live socket push renders the board even after a failed fetch', async () => {
    jest.useFakeTimers() // prevent the retry timers from firing during this test
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const socket = makeSocket()
    render(<Leaderboard roomId="r1" token="t" socket={socket} userId="999" />)
    await act(async () => { await Promise.resolve() }) // let the initial rejection settle
    act(() => socket.emit('leaderboard:updated', { leaderboard: rows(3), totalParticipants: 3, topN: 10 }))
    expect(screen.getByText('S1')).toBeInTheDocument()
    expect(screen.queryByText('Failed to load leaderboard')).toBeNull()
  })

  it('retries then surfaces the error only when every fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    render(<Leaderboard roomId="r1" token="t" socket={makeSocket()} userId="999" />)
    // initial + 2 backoff retries (800ms, 1600ms) → error appears after ~2.4s
    expect(await screen.findByText('Failed to load leaderboard', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(3)
  }, 8000)
})
