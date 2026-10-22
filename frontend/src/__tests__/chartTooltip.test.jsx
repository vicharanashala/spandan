import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Columns, Heatmap, hideTip, showTip } from '../components/InsightCharts'
import { scoreTicks, rtTicks, questionTicks, formatDuration } from '../lib/insightsFormat'

// jsdom has no PointerEvent: without this, pointerType would be dropped from fired events.
if (typeof window.PointerEvent === 'undefined') {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) { super(type, init); this.pointerType = init.pointerType || 'mouse' }
  }
}

const tipBox = () => document.querySelector('[data-chart-tip]')
const visible = () => tipBox() && tipBox().style.display !== 'none'

beforeEach(() => { hideTip(); window.innerWidth = 400; window.innerHeight = 800 })

describe('shared chart tooltip', () => {
  it('mouse: follows the pointer and hides on leave', () => {
    const { container } = render(<Columns points={[{ x: 0.5, y: 3, label: 'Q1' }]} xMax={1} tipFor={() => ['Q1', '3 answered']} />)
    const bar = container.querySelector('rect')
    fireEvent.pointerMove(bar, { clientX: 50, clientY: 60, pointerType: 'mouse' })
    expect(visible()).toBe(true)
    expect(tipBox().textContent).toBe('Q1' + '3 answered')
    expect(tipBox().style.position).toBe('fixed')
    fireEvent.pointerLeave(bar, { pointerType: 'mouse' })
    expect(visible()).toBe(false)
  })

  it('touch: a tap shows it, a tap elsewhere hides it', () => {
    const { container } = render(<Columns points={[{ x: 0.5, y: 3 }]} xMax={1} tipFor={() => ['tap']} />)
    const bar = container.querySelector('rect')
    fireEvent.pointerMove(bar, { clientX: 50, clientY: 60, pointerType: 'touch' })
    expect(visible()).toBeFalsy() // no hover on touch
    fireEvent.click(bar, { clientX: 50, clientY: 60 })
    expect(visible()).toBe(true)
    fireEvent.pointerDown(document.body)
    expect(visible()).toBe(false)
  })

  it('hides on scroll and when the chart unmounts', () => {
    const { container, unmount } = render(<Columns points={[{ x: 0.5, y: 3 }]} xMax={1} />)
    fireEvent.click(container.querySelector('rect'), { clientX: 10, clientY: 10 })
    expect(visible()).toBe(true)
    fireEvent.scroll(window)
    expect(visible()).toBe(false)
    fireEvent.click(container.querySelector('rect'), { clientX: 10, clientY: 10 })
    unmount()
    expect(visible()).toBe(false)
  })

  it('flips to the left near the right edge so it stays on screen', () => {
    act(() => {
      showTip(390, 100, ['a fairly long tooltip line'])
    })
    // jsdom has no layout (width 0), so check the flip rule with a stubbed size
    const el = tipBox()
    el.getBoundingClientRect = () => ({ width: 150, height: 40 })
    act(() => showTip(390, 790, ['x']))
    expect(parseInt(el.style.left, 10)).toBeLessThanOrEqual(400 - 150)
    expect(parseInt(el.style.top, 10)).toBeLessThanOrEqual(800 - 40)
  })

  it('renders text, never HTML', () => {
    act(() => showTip(10, 10, ['<img src=x onerror=alert(1)>']))
    expect(tipBox().querySelector('img')).toBeNull()
    expect(tipBox().textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('heatmap cells use the shared tooltip; compact mode narrows the name column', () => {
    const rows = [{ studentId: 'a', name: 'Asha', points: 10, cells: ['c', 'w'] }]
    const { container } = render(<Heatmap rows={rows} questionCount={2} compact />)
    const name = screen.getByText('Asha')
    expect(name.style.width).toBe('92px')
    const cells = [...container.querySelectorAll('span')].filter((el) => el.style.width === '16px' && el.style.height === '16px')
    fireEvent.pointerMove(cells[1], { clientX: 20, clientY: 20, pointerType: 'mouse' })
    expect(tipBox().textContent).toBe('AshaQ2: wrong')
  })
})

describe('axis labels', () => {
  it('score histogram is labelled in points, not bucket numbers', () => {
    const t = scoreTicks([{ from: 0, to: 50 }, { from: 50, to: 100 }, { from: 100, to: 150 }, { from: 150, to: 200 }])
    expect(t.map((x) => x.label)).toEqual(['0', '100', '200 pts'])
    const { container } = render(<Columns points={[{ x: 0.5, y: 1 }]} xMax={4} xTicks={t} />)
    const labels = [...container.querySelectorAll('text')].map((n) => n.textContent)
    expect(labels).toEqual(expect.arrayContaining(['0', '100', '200 pts']))
  })
  it('response-time bars get one label each; question columns get Q labels', () => {
    expect(rtTicks().map((t) => t.label)).toEqual(['0–5', '5–10', '10–20', '20–30', '30–60', '60+'])
    expect(questionTicks(94).map((t) => t.label)).toEqual(['Q1', 'Q47', 'Q94'])
    expect(questionTicks(1).map((t) => t.label)).toEqual(['Q1'])
  })
  it('the last default x label is right-aligned so it is not clipped', () => {
    const { container } = render(<Columns points={[{ x: 5, y: 1 }]} xMax={38929} xLabel="min" />)
    const xs = [...container.querySelectorAll('text')].filter((n) => n.textContent.endsWith('min'))
    expect(xs.map((n) => n.getAttribute('text-anchor'))).toEqual(['start', 'middle', 'end'])
  })
})

describe('formatDuration', () => {
  it('minutes up to 90, then hours and minutes', () => {
    expect(formatDuration(40)).toBe('40 min')
    expect(formatDuration(90)).toBe('90 min')
    expect(formatDuration(125)).toBe('2 h 05 min')
    expect(formatDuration(null)).toBe('—')
  })
})

describe('results page UI pieces', () => {
  const { StatTile, HeroSummary, SectionNav } = require('../components/InsightUI')
  it('StatTile draws a progress bar only when given a percentage', () => {
    const { container, rerender } = render(<StatTile icon="✅" label="Correct" value="80%" progress={80} />)
    expect([...container.querySelectorAll('div')].some((d) => d.style.width === '80%')).toBe(true)
    rerender(<StatTile icon="✅" label="Correct" value="80%" />)
    expect([...container.querySelectorAll('div')].some((d) => d.style.width === '80%')).toBe(false)
  })
  it('HeroSummary shows the ring value, facts and highlights', () => {
    render(<HeroSummary title="Session summary" meta={['20 Jun 2026', '58 min']} ring={{ value: 73, label: 'correct', color: '#0ca30c' }} highlights={[{ icon: '🧗', label: 'Hardest question', value: 'Q3 · 12% correct' }]} />)
    expect(screen.getByRole('img', { name: 'correct: 73%' })).toBeInTheDocument()
    expect(screen.getByText('58 min')).toBeInTheDocument()
    expect(screen.getByText('Q3 · 12% correct')).toBeInTheDocument()
  })
  it('SectionNav jumps to a section and marks it current', () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="s-a"></div><div id="s-b"></div>')
    const spy = jest.fn(); document.getElementById('s-b').scrollIntoView = spy
    render(<SectionNav sections={[{ id: 's-a', label: 'A' }, { id: 's-b', label: 'B' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'B' }))
    expect(spy).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'B' }).getAttribute('aria-current')).toBe('true')
  })
})

describe('student chart fixes', () => {
  it('a 0% column still shows its colour when minBarPx is set (wrong answer on a question nobody got right)', () => {
    const { container } = render(<Columns points={[{ x: 0.5, y: 0 }, { x: 1.5, y: 80 }]} xMax={2} minBarPx={4} colorFor={(p) => (p.y ? 'green' : 'red')} />)
    const bars = [...container.querySelectorAll('rect')].filter((r) => r.getAttribute('fill') !== 'transparent')
    expect(Number(bars[0].getAttribute('height'))).toBe(4)
    expect(bars[0].getAttribute('fill')).toBe('red')
  })
  it('StepLine uses the caller tooltip (points chart says points, not "joined")', () => {
    const { StepLine } = require('../components/InsightCharts')
    const { container } = render(<StepLine points={[{ x: 1, y: 90 }]} tipFor={(p) => [`Q${p.x}: ${p.y} points so far`]} />)
    fireEvent.pointerMove(container.querySelector('circle'), { clientX: 5, clientY: 5, pointerType: 'mouse' })
    expect(document.querySelector('[data-chart-tip]').textContent).toBe('Q1: 90 points so far')
  })
})

describe('timeline bursts (clusterLayout)', () => {
  const { clusterLayout } = require('../components/InsightCharts')
  const noOverlap = ({ lefts, barWidth }) => {
    const s = [...lefts].sort((a, b) => a - b)
    return s.every((x, i) => i === 0 || x >= s[i - 1] + barWidth - 0.01)
  }
  it('polls launched together sit side by side, centred on their time; separate bursts stay apart', () => {
    // 5 bursts of 4 polls each, ~1 px apart inside a burst (the overlap seen in production)
    const cx = []
    for (const t of [300, 520, 740, 960, 1180]) for (let k = 0; k < 4; k++) cx.push(t + k)
    const L = clusterLayout(cx, { requested: 14, left: 36, right: 1500 })
    expect(L.groups).toHaveLength(5)
    expect(L.barWidth).toBe(14)
    expect(noOverlap(L)).toBe(true)
    const g = L.groups[0]
    expect(Math.abs((g.start + g.end) / 2 - 301.5)).toBeLessThan(0.01) // centred on the burst's mean time
  })
  it('on a phone it narrows the bars but keeps each burst as its own group', () => {
    const cx = Array.from({ length: 21 }, (_, i) => 60 + Math.floor(i / 4) * 40 + i * 0.3)
    const L = clusterLayout(cx, { requested: 14, left: 36, right: 280 })
    expect(L.groups).toHaveLength(6)
    expect(noOverlap(L)).toBe(true)
    expect(Math.min(...L.lefts)).toBeGreaterThanOrEqual(36 - 0.5)
    expect(Math.max(...L.lefts) + L.barWidth).toBeLessThanOrEqual(280 + 0.5)
    expect(L.barWidth).toBeLessThan(14)
  })
  it('well-separated polls are untouched (one column per group, at its own time)', () => {
    const L = clusterLayout([100, 300, 500], { requested: 14, left: 36, right: 600 })
    expect(L.groups).toHaveLength(3)
    expect(L.lefts).toEqual([93, 293, 493])
  })
  it('merges bursts only when even the narrowest bars cannot keep them apart', () => {
    const cx = Array.from({ length: 30 }, (_, i) => 50 + Math.floor(i / 10) * 20 + i * 0.1)
    const L = clusterLayout(cx, { requested: 14, left: 36, right: 200 })
    expect(L.groups.length).toBeLessThan(3)
    expect(noOverlap(L)).toBe(true)
  })
})

describe('timeline: polls nobody answered', () => {
  it('get a visible stub and a full-height hover target with a "no one answered" tooltip', () => {
    const { container } = render(<Columns points={[{ x: 5, y: 0, label: 'Q7' }, { x: 20, y: 30, label: 'Q8' }]} xMax={40} minBarPx={4}
      colorFor={(p) => (p.y ? 'green' : 'grey')} tipFor={(p) => [p.label, p.y ? `${p.y} answered` : 'no one answered']} />)
    const groups = [...container.querySelectorAll('svg g')].filter((g) => g.querySelectorAll('rect').length === 2)
    const [hit, bar] = groups[0].querySelectorAll('rect')
    expect(bar.getAttribute('fill')).toBe('grey')
    expect(Number(bar.getAttribute('height'))).toBe(4)
    expect(Number(hit.getAttribute('height'))).toBeGreaterThan(100) // hover target spans the plot height
    fireEvent.pointerMove(hit, { clientX: 5, clientY: 5, pointerType: 'mouse' })
    expect(document.querySelector('[data-chart-tip]').textContent).toBe('Q7' + 'no one answered')
  })
})
