import React from 'react'
import { act, render, screen } from '@testing-library/react'
import { ReconnectMeter, gapReasonLabel } from '../components/ReconnectMeter'

describe('gapReasonLabel', () => {
  it('maps every recorded away reason to teacher-facing wording', () => {
    expect(gapReasonLabel('tab-hidden')).toBe('Switched tab')
    expect(gapReasonLabel('window-blur')).toBe('Window unfocused')
    expect(gapReasonLabel('frozen')).toBe('Tab stopped responding')
    expect(gapReasonLabel('untracked')).toBe('Could not confirm tab activity')
    expect(gapReasonLabel('leave')).toBe('Left the room')
    expect(gapReasonLabel('disconnect')).toBe('Disconnected')
    expect(gapReasonLabel('attention')).toBe('Lost focus')
  })

  it('returns null for an unknown or missing reason', () => {
    expect(gapReasonLabel(null)).toBeNull()
    expect(gapReasonLabel(undefined)).toBeNull()
    expect(gapReasonLabel('something-else')).toBeNull()
  })
})

describe('ReconnectMeter absence budget', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('labels a closed gap with the reason its presence interval closed', () => {
    const start = new Date('2026-01-01T09:00:00Z')
    render(
      <ReconnectMeter
        allowanceSeconds={60}
        usedSeconds={5}
        remainingSeconds={55}
        gaps={[{
          start,
          end: new Date(start.getTime() + 5_000),
          seconds: 5,
          forgivenSeconds: 5,
          billedSeconds: 0,
          reason: 'tab-hidden'
        }]}
        showGaps
      />
    )

    expect(screen.getByText(/Switched tab/)).toBeInTheDocument()
  })

  it('shows the reason on a still-open away gap', () => {
    const start = new Date('2026-01-01T09:00:00Z')
    jest.setSystemTime(new Date(start.getTime() + 10_000))

    render(
      <ReconnectMeter
        allowanceSeconds={60}
        usedSeconds={10}
        remainingSeconds={50}
        gaps={[{
          start,
          end: new Date(start.getTime() + 10_000),
          seconds: 10,
          forgivenSeconds: 10,
          billedSeconds: 0,
          reason: 'window-blur',
          open: true
        }]}
        live
        showGaps
      />
    )

    expect(screen.getByText(/Window unfocused/)).toBeInTheDocument()
    expect(screen.getByText(/still away/)).toBeInTheDocument()
  })

  it('labels the reason in the join / leave log', () => {
    const start = new Date('2026-01-01T09:00:00Z')
    render(
      <ReconnectMeter
        allowanceSeconds={60}
        usedSeconds={0}
        remainingSeconds={60}
        events={[
          { type: 'joined', at: start },
          { type: 'left', at: new Date(start.getTime() + 20_000), reason: 'disconnect' }
        ]}
        showEvents
      />
    )

    expect(screen.getByText(/Disconnected/)).toBeInTheDocument()
  })

  it('drains the budget while the student is still away', () => {
    const start = new Date('2026-01-01T09:00:00Z')
    jest.setSystemTime(new Date(start.getTime() + 10_000))

    render(
      <ReconnectMeter
        allowanceSeconds={60}
        usedSeconds={10}
        remainingSeconds={50}
        gaps={[{ start, end: new Date(start.getTime() + 10_000), seconds: 10, forgivenSeconds: 10, billedSeconds: 0, open: true }]}
        live
      />
    )

    expect(screen.getByText('10s')).toBeInTheDocument()
    expect(screen.getByText('50s left')).toBeInTheDocument()

    act(() => {
      jest.advanceTimersByTime(5_000)
    })

    expect(screen.getByText('15s')).toBeInTheDocument()
    expect(screen.getByText('45s left')).toBeInTheDocument()
  })

  it('labels a final absence with no return', () => {
    render(
      <ReconnectMeter
        allowanceSeconds={60}
        usedSeconds={13}
        remainingSeconds={47}
        gaps={[{
          start: new Date('2026-01-01T09:00:28Z'),
          end: new Date('2026-01-01T09:00:41Z'),
          seconds: 13,
          forgivenSeconds: 13,
          billedSeconds: 0,
          open: false,
          final: true
        }]}
        showGaps
      />
    )

    expect(screen.getByText('13s')).toBeInTheDocument()
    expect(screen.getByText(/did not return/)).toBeInTheDocument()
    expect(screen.getByText(/13s forgiven/)).toBeInTheDocument()
  })
})
