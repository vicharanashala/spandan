import React from 'react'
import { usePeerReviewStore } from '../stores/peerReviewStore.js'
import {
  PEER_RUBRIC_MIN,
  PEER_RUBRIC_MAX,
  clampRubric
} from '../stores/peerReviewHelpers.js'
import PeerReviewTimer from './PeerReviewTimer.jsx'
import AccuracyMeter from './AccuracyMeter.jsx'

/**
 * PeerReviewPanel
 * ---------------
 * Modal-style panel showing the user's open-text submission vs the
 * peer's. Rubric radios (0/1/2). Submit button. Timer + accuracy
 * meter included inline.
 *
 * Props:
 *   elapsedMs: number
 *   onSubmit: (grade) => void
 *   onCancel: () => void
 *   disabled: boolean
 */
export default function PeerReviewPanel(props) {
  const status = usePeerReviewStore(function (s) { return s.status })
  const mySubmission = usePeerReviewStore(function (s) { return s.mySubmission })
  const peerSubmission = usePeerReviewStore(function (s) { return s.peerSubmission })
  const myGrade = usePeerReviewStore(function (s) { return s.myGrade })
  const isGhostMode = usePeerReviewStore(function (s) { return s.isGhostMode })
  const roundExpired = usePeerReviewStore(function (s) { return s.roundExpired })
  const rollingAccuracy = usePeerReviewStore(function (s) { return s.rollingAccuracy })
  const rollingGrades = usePeerReviewStore(function (s) { return s.rollingGrades })

  const setMyGrade = usePeerReviewStore(function (s) { return s.setMyGrade })
  const submitRound = usePeerReviewStore(function (s) { return s.submitRound })

  const elapsed = Number.isFinite(props && props.elapsedMs) ? props.elapsedMs : 0
  const onSubmit = typeof (props && props.onSubmit) === 'function' ? props.onSubmit : function () {}
  const onCancel = typeof (props && props.onCancel) === 'function' ? props.onCancel : function () {}
  const disabled = Boolean(props && props.disabled)

  const canGrade = !disabled && !roundExpired && status !== 'submitted' && status !== 'expired'
  const canSubmit = canGrade && (myGrade !== null && myGrade !== undefined)

  function onRadio(grade) {
    const clamped = clampRubric(grade)
    setMyGrade(clamped)
  }

  function onSubmitClick() {
    if (!canSubmit) return
    const acc = submitRound()
    onSubmit(myGrade, acc)
  }

  const radioOptions = []
  for (let i = PEER_RUBRIC_MIN; i <= PEER_RUBRIC_MAX; i++) {
    radioOptions.push(i)
  }

  return (
    <div className="pr-panel" data-testid="peer-review-panel" data-status={status}>
      <PeerReviewTimer
        elapsedMs={elapsed}
        isGhostMode={isGhostMode}
        roundExpired={roundExpired}
      />

      <div className="pr-panel__grid">
        <section className="pr-panel__col" data-testid="pr-my-submission">
          <h4>Your answer</h4>
          <p>{mySubmission || '(empty)'}</p>
        </section>
        <section className="pr-panel__col" data-testid="pr-peer-submission">
          <h4>Peer answer</h4>
          <p>{peerSubmission || (isGhostMode ? '(reviewing your own past answer — ghost mode)' : '(waiting for peer)')}</p>
        </section>
      </div>

      <fieldset
        className="pr-panel__rubric"
        disabled={!canGrade}
        data-testid="pr-rubric"
      >
        <legend>Grade the peer</legend>
        {radioOptions.map(function (n) {
          const checked = myGrade === n
          return (
            <label key={n} className="pr-panel__radio">
              <input
                type="radio"
                name="pr-rubric"
                value={n}
                checked={checked}
                onChange={function () { onRadio(n) }}
                data-testid={'pr-radio-' + n}
              />
              <span>{n}</span>
            </label>
          )
        })}
      </fieldset>

      <AccuracyMeter
        rollingAccuracy={rollingAccuracy}
        rollingGradesCount={Array.isArray(rollingGrades) ? rollingGrades.length : 0}
      />

      <div className="pr-panel__actions">
        <button
          type="button"
          onClick={onCancel}
          data-testid="pr-cancel"
          disabled={disabled}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmitClick}
          data-testid="pr-submit"
          disabled={!canSubmit}
        >
          Submit grade
        </button>
      </div>
    </div>
  )
}