import { useGhostRunner } from '../hooks/useGhostRunner.js'
import '../styles/ghostRunner.css'

/**
 * Ghost Runner Track
 * ------------------
 * A single horizontal bar that sweeps from full-width to zero over the
 * question's allotted time. Used as a secondary visual cue alongside
 * the existing numeric countdown timer. Pure CSS transform — no
 * width animation, no layout thrash.
 *
 * Renders nothing when `question` is null.
 */
export default function GhostRunnerTrack({ question, label = 'Time remaining' }) {
  const { durationMs, progress, running, key } = useGhostRunner(question)

  if (!question) return null

  return (
    <div
      className="ghost-runner"
      data-testid="ghost-runner"
      data-running={running ? 'true' : 'false'}
      data-duration-ms={durationMs}
      aria-label={label}
      role="timer"
    >
      <div
        key={key}
        className="ghost-runner__bar"
        style={{ transform: `scaleX(${progress.toFixed(4)})` }}
        data-testid="ghost-runner-bar"
      />
    </div>
  )
}