import { WAGER_STOPS } from '../stores/wagerHelpers.js'

/**
 * WagerSlider
 * -----------
 * Discrete-stop slider for the high-stakes wager. Renders five
 * buttons (0% / 25% / 50% / 75% / 100%) instead of a continuous
 * range input — the spec is explicit that this is a stepped control,
 * not a free-floating slider. Each stop is a real <button> so it's
 * keyboard- and screen-reader-accessible without extra ARIA.
 *
 * Props:
 *   value       : number  -- the current selected stop (one of WAGER_STOPS)
 *   onChange    : (next: number) => void  -- fired when a stop is picked
 *   disabled    : boolean -- disables all stops; styling dims them
 *   locked      : boolean -- if true, the entire control is read-only
 *
 * Pure presentational component. The store decides what to do with
 * the chosen value.
 */
export function WagerSlider({ value, onChange, disabled = false, locked = false }) {
  const isInteractive = !disabled && !locked

  function pick(stop) {
    if (!isInteractive) return
    if (typeof onChange === 'function') onChange(stop)
  }

  return (
    <div
      className="wager-slider"
      role="group"
      aria-label="Wager percentage"
      aria-disabled={disabled || locked}
      data-testid="wager-slider"
    >
      {WAGER_STOPS.map((stop) => {
        const selected = value === stop
        const cls =
          'wager-slider__stop' +
          (selected ? ' wager-slider__stop--selected' : '') +
          (!isInteractive ? ' wager-slider__stop--disabled' : '')
        return (
          <button
            key={stop}
            type="button"
            className={cls}
            aria-pressed={selected}
            aria-label={`Wager ${stop}%`}
            disabled={!isInteractive}
            onClick={() => pick(stop)}
            data-testid={`wager-stop-${stop}`}
          >
            <span className="wager-slider__stop-value">{stop}%</span>
            <span className="wager-slider__stop-label">
              {stop === 0 ? 'No risk' : stop === 100 ? 'All-in' : `${stop / 100}x`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default WagerSlider