import { PollySession } from '../services/pollyOrchestrator.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Records every action call so we can assert what the timeline fired and in what order.
function makeActions() {
  const calls = []
  const rec = (name) => (...args) => { calls.push({ name, args, t: Date.now() }) }
  return {
    calls,
    headsUp: rec('headsUp'),
    speakerNudge: rec('speakerNudge'),
    countdown: rec('countdown'),
    postPoll: rec('postPoll'),
    announceBreak: rec('announceBreak'),
  }
}

describe('PollySession automatic timeline', () => {
  test('fires heads-up + speaker nudge before the poll, then countdown + poll, plus breaks', async () => {
    const actions = makeActions()
    const settings = {
      pollMinutes: '1', pollTrigger: 'auto', notifyMode: 'auto',
      headsUp: true, wrapUpNudge: true, headsUpLeadSec: 30, // 0.5 "minute" lead
      showCountdown: true, countdownSecs: 15,
      breaksEnabled: true, breakEveryMin: 1, breakLengthMin: 5,
    }
    const s = new PollySession({ botId: 'b1', settings, actions, minuteMs: 40 }) // 1 min = 40ms
    s.start()
    await sleep(120) // let minute 0.5 (heads-up), 1 (poll + break) fire
    s.stop()

    const names = actions.calls.map((c) => c.name)
    expect(names).toContain('headsUp')
    expect(names).toContain('speakerNudge')
    expect(names).toContain('postPoll')
    expect(names).toContain('announceBreak')
    // countdown was requested with the configured seconds
    const cd = actions.calls.find((c) => c.name === 'countdown')
    expect(cd.args[0]).toBe(15)
    // break length passed through
    expect(actions.calls.find((c) => c.name === 'announceBreak').args[0]).toBe(5)
    // heads-up happens before the poll
    const headsUpAt = actions.calls.find((c) => c.name === 'headsUp').t
    const pollAt = actions.calls.find((c) => c.name === 'postPoll').t
    expect(headsUpAt).toBeLessThanOrEqual(pollAt)
  })

  test('manual modes do not auto-fire polls or notifications', async () => {
    const actions = makeActions()
    const settings = { pollMinutes: '1', pollTrigger: 'manual', notifyMode: 'manual', breaksEnabled: false }
    const s = new PollySession({ botId: 'b2', settings, actions, minuteMs: 20 })
    s.start()
    await sleep(80)
    s.stop()
    expect(actions.calls.filter((c) => c.name === 'postPoll')).toHaveLength(0)
    expect(actions.calls.filter((c) => c.name === 'headsUp')).toHaveLength(0)
  })

  test('stop() cancels pending timers', async () => {
    const actions = makeActions()
    const settings = { pollMinutes: '2', pollTrigger: 'auto', notifyMode: 'auto', headsUp: true, breaksEnabled: false }
    const s = new PollySession({ botId: 'b3', settings, actions, minuteMs: 40 })
    s.start()
    s.stop() // cancel immediately
    await sleep(120)
    expect(actions.calls).toHaveLength(0)
  })
})
