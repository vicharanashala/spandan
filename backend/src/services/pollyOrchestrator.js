// Polly automatic session engine. Given a bot's settings and a set of injected "actions" (send a
// heads-up, nudge the speaker, post a poll, announce a break/countdown), it runs the meeting timeline
// by itself: heads-ups and speaker wrap-up nudges ahead of each poll, the polls at the configured
// minutes, and scheduled breaks - all honouring the settings toggles.
//
// It is deliberately free of any Attendee/AI specifics: the route layer supplies `actions`, so this
// file is pure timeline logic and can be unit-tested with fake actions and a compressed clock.

export class PollySession {
  /**
   * @param {object}   o
   * @param {string}   o.botId
   * @param {object}   o.settings   - the panel settings (pollMinutes, pollTrigger, notifyMode, ...)
   * @param {object}   o.actions    - { headsUp(), speakerNudge(), countdown(secs), postPoll(), announceBreak(min) }
   * @param {number}   [o.minuteMs] - how many ms count as one "meeting minute" (60000 in prod; small in tests)
   * @param {function} [o.log]
   */
  constructor({ botId, settings, actions, minuteMs = 60000, log = () => {} }) {
    this.botId = botId
    this.s = settings || {}
    this.actions = actions
    this.minuteMs = minuteMs
    this.log = log
    this.timers = []
    this.running = false
    this.startedAt = null
  }

  parseMinutes() {
    return String(this.s.pollMinutes || '')
      .split(',')
      .map((x) => parseInt(String(x).trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)
  }

  _at(minuteOffset, fn) {
    const delay = Math.max(0, minuteOffset * this.minuteMs)
    const t = setTimeout(() => {
      if (!this.running) return
      Promise.resolve(fn()).catch((e) => this.log(`action error: ${e.message}`))
    }, delay)
    this.timers.push(t)
  }

  _schedulePoll(minute) {
    const leadMin = (Number(this.s.headsUpLeadSec) || 30) / 60

    // Heads-up + speaker wrap-up nudge, ahead of the poll (only in automatic notify mode).
    if (this.s.notifyMode === 'auto') {
      this._at(minute - leadMin, async () => {
        if (this.s.headsUp) await this.actions.headsUp()
        if (this.s.wrapUpNudge) await this.actions.speakerNudge()
      })
    }

    // The poll itself (only when polls are triggered automatically).
    if (this.s.pollTrigger === 'auto') {
      this._at(minute, async () => {
        if (this.s.showCountdown) await this.actions.countdown(Number(this.s.countdownSecs) || 15)
        await this.actions.postPoll()
      })
    }
  }

  _scheduleBreaks(horizonMin) {
    const every = Number(this.s.breakEveryMin)
    const len = Number(this.s.breakLengthMin)
    if (!every || !len) return
    for (let at = every; at <= horizonMin; at += every) {
      this._at(at, async () => this.actions.announceBreak(len))
    }
  }

  /** Start the automatic timeline. Returns this. */
  start() {
    if (this.running) return this
    this.running = true
    this.startedAt = Date.now()

    const minutes = this.parseMinutes()
    for (const m of minutes) this._schedulePoll(m)

    if (this.s.breaksEnabled) {
      // schedule breaks out to a bit past the last poll (or 2 hours if no polls)
      const horizon = (minutes.length ? minutes[minutes.length - 1] : 0) + 60 || 120
      this._scheduleBreaks(Math.max(horizon, 120))
    }
    this.log(`automatic session started for ${this.botId} (polls at ${minutes.join(', ') || 'none'})`)
    return this
  }

  stop() {
    this.running = false
    this.timers.forEach(clearTimeout)
    this.timers = []
  }

  isRunning() {
    return this.running
  }
}
