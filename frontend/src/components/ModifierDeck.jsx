import { useEffect } from 'react'
import useModifierStore from '../stores/modifierStore.js'
import {
  MODIFIER_IDS,
  MODIFIER_META,
  PEEK_MS
} from '../stores/modifierHelpers.js'
import '../styles/modifierDeck.css'

/**
 * ModifierDeck
 * ------------
 * Floating overlay panel that lists the player's modifier cards. Each
 * card shows the card's icon, label, current charge count, and a
 * Fire button. The deck is opened/closed via the store.
 *
 *   - Props.onFire(id) is called when a card is successfully fired.
 *     The store has already decremented the charge; the parent owns
 *     the side-effect (running the 50/50 collapse, freezing the
 *     timer, etc.).
 *   - The component does NOT run side effects itself. It only
 *     reflects store state. This keeps the deck easy to unit-test.
 *
 * If `question` is missing or store has no questionId, the deck shows
 * a disabled state ("Waiting for next question…").
 */
export default function ModifierDeck({ question, onFire }) {
  const deckOpen = useModifierStore((s) => s.deckOpen)
  const closeDeck = useModifierStore((s) => s.closeDeck)
  const hand = useModifierStore((s) => s.hand)
  const questionId = useModifierStore((s) => s.questionId)
  const peekActive = useModifierStore((s) => s.peekActive)
  const peekExpiresAt = useModifierStore((s) => s.peekExpiresAt)
  const toggleDeck = useModifierStore((s) => s.toggleDeck)

  // Auto-close peek when it expires so the UI reflects store state.
  useEffect(() => {
    if (!peekActive) return undefined
    const ms = Math.max(0, peekExpiresAt - Date.now())
    if (ms === 0) return undefined
    const t = window.setTimeout(() => {
      // The owning effect module is responsible for calling
      // setPeekActive(false) at expiry. We just react to the new state.
    }, ms)
    return () => window.clearTimeout(t)
  }, [peekActive, peekExpiresAt])

  // Esc closes the deck for keyboard users.
  useEffect(() => {
    if (!deckOpen) return undefined
    const handler = (e) => {
      if (e.key === 'Escape') closeDeck()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [deckOpen, closeDeck])

  const handleFire = (id) => {
    const result = useModifierStore.getState().consume(id)
    if (!result.ok) return
    if (typeof onFire === 'function') {
      try {
        onFire(id, { question, questionId })
      } catch (err) {
        // Roll back the consume if the parent threw — UX safety net.
        useModifierStore.getState().refund(id)
        // Re-throw so dev-mode surfaces the issue.
        throw err
      }
    }
  }

  if (!deckOpen) {
    // Render a single low-profile toggle button so the deck is always
    // reachable, even when collapsed.
    return (
      <button
        type="button"
        className="modifier-deck__toggle"
        onClick={toggleDeck}
        aria-label="Open modifier deck"
        data-testid="modifier-deck-toggle"
      >
        <span aria-hidden="true">🃏</span>
        <span className="modifier-deck__toggle-label">Deck</span>
      </button>
    )
  }

  const hasQuestion = Boolean(question && questionId)

  return (
    <aside
      className="modifier-deck"
      role="dialog"
      aria-label="Modifier deck"
      data-testid="modifier-deck-panel"
      data-has-question={hasQuestion ? 'true' : 'false'}
    >
      <header className="modifier-deck__header">
        <h3 className="modifier-deck__title">🃏 Modifier Deck</h3>
        <button
          type="button"
          className="modifier-deck__close"
          onClick={closeDeck}
          aria-label="Close modifier deck"
          data-testid="modifier-deck-close"
        >
          ✕
        </button>
      </header>

      {!hasQuestion && (
        <p className="modifier-deck__hint" data-testid="modifier-deck-waiting">
          Waiting for next question…
        </p>
      )}

      <ul className="modifier-deck__list">
        {MODIFIER_IDS.map((id) => {
          const meta = MODIFIER_META[id]
          const charges = (hand && hand[id]) || 0
          const disabled = !hasQuestion || charges <= 0
          return (
            <li
              key={id}
              className="modifier-deck__item"
              data-testid={`modifier-card-${id}`}
              data-charges={charges}
              data-disabled={disabled ? 'true' : 'false'}
            >
              <div className="modifier-deck__card-icon" aria-hidden="true">
                {meta.icon}
              </div>
              <div className="modifier-deck__card-body">
                <div className="modifier-deck__card-label">{meta.label}</div>
                <div className="modifier-deck__card-desc">{meta.description}</div>
                {id === 'peek' && peekActive && (
                  <div
                    className="modifier-deck__card-status"
                    data-testid="modifier-peek-active"
                  >
                    Active — {Math.max(0, Math.round((peekExpiresAt - Date.now()) / 1000))}s
                  </div>
                )}
              </div>
              <button
                type="button"
                className="modifier-deck__fire"
                onClick={() => handleFire(id)}
                disabled={disabled}
                aria-label={`Fire ${meta.label}`}
                data-testid={`modifier-fire-${id}`}
              >
                Fire
                <span className="modifier-deck__charges" aria-hidden="true">
                  {charges}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <footer className="modifier-deck__footer">
        Cards reset on each new question.
      </footer>
    </aside>
  )
}

ModifierDeck.PEEK_MS = PEEK_MS