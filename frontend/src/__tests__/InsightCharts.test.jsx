import React from 'react'
import { render, screen } from '@testing-library/react'
import { Funnel, Heatmap, BarList } from '../components/InsightCharts'

describe('InsightCharts layout', () => {
  it('Funnel renders every value label in HTML (nothing clipped by an SVG viewBox)', () => {
    const { container } = render(<Funnel title="F" stages={[{ label: 'Joined', value: 126, pct: 100 }, { label: 'Answered all', value: 65, pct: 52 }]} />)
    expect(screen.getByText('126 (100%)')).toBeInTheDocument()
    expect(screen.getByText('65 (52%)')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })

  it('Heatmap shows 10 rows then scrolls (capped height, all rows present, fade + hint), thin scrollbars', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ studentId: 's' + i, name: 'Student ' + i, points: 100 - i, cells: ['c', 'w', '-'] }))
    const { container } = render(<Heatmap rows={rows} questionCount={3} />)
    const box = container.querySelector('.thin-scroll')
    expect(box).not.toBeNull()
    expect(box.style.overflow).toBe('auto')
    expect(box.style.maxHeight).toBe(`${(10 + 1) * 18 + 8}px`)    // header + 10 rows
    expect(screen.getAllByText(/^Student \d+$/)).toHaveLength(25)  // every row rendered, the box scrolls
    expect(screen.getByText(/25 students · scroll for the rest/)).toBeInTheDocument()
  })

  it('Heatmap with ≤10 students is not capped', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ studentId: 's' + i, name: 'S' + i, points: 10, cells: ['c'] }))
    const { container } = render(<Heatmap rows={rows} questionCount={1} />)
    expect(container.querySelector('.thin-scroll').style.maxHeight).toBe('')
    expect(screen.queryByText(/scroll for the rest/)).toBeNull()
  })

  it('BarList caps long lists at 14 rows with a scroll hint', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ key: i, label: 'Q' + (i + 1), value: i }))
    render(<BarList items={items} />)
    expect(screen.getByText('Scroll for all 30 rows.')).toBeInTheDocument()
    expect(screen.getAllByText(/^Q\d+$/)).toHaveLength(30)
  })
})
