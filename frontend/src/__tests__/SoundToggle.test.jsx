import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

jest.mock('../lib/sounds', () => {
  let enabled = true
  return {
    SOUND_CHANGE_EVENT: 'spandan:sound',
    isSoundEnabled: () => enabled,
    setSoundEnabled: jest.fn((on) => { enabled = on }),
    unlockAudio: jest.fn().mockResolvedValue(true),
    playPreview: jest.fn().mockResolvedValue('played')
  }
})
import SoundToggle from '../components/SoundToggle'
import { setSoundEnabled, unlockAudio, playPreview } from '../lib/sounds'

describe('SoundToggle', () => {
  it('shows the bell when on, mutes on click, and previews when turned back on', async () => {
    render(<SoundToggle />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toHaveAccessibleName(/Sound on/)

    fireEvent.click(btn)
    expect(setSoundEnabled).toHaveBeenLastCalledWith(false)
    await waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'false'))
    expect(playPreview).not.toHaveBeenCalled()

    fireEvent.click(btn)
    expect(setSoundEnabled).toHaveBeenLastCalledWith(true)
    await waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'true'))
    await waitFor(() => expect(unlockAudio).toHaveBeenCalled())
    expect(playPreview).toHaveBeenCalledTimes(1)
  })
})
