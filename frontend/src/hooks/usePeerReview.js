/**
 * usePeerReview.js
 * ----------------
 * Lifecycle hook for the peer-review round. Wraps the
 * peerReviewStore so a component can drive the round without
 * touching the store directly.
 *
 * Flow:
 *   1. beginRound(questionId, mySubmission)
 *   2. tick(elapsedMs) — auto-flips to 'ghost' at 2.5s, 'expired' at 90s
 *   3. pairWith(peerSubmission, peerUserId) — peer arrived
 *   4. setMyGrade(0|1|2) — user's grade for peer
 *   5. submitRound() — captures peer grade into rolling accuracy
 */

import { useCallback } from 'react'
import { usePeerReviewStore } from '../stores/peerReviewStore.js'

export function usePeerReview() {
  const beginRound = usePeerReviewStore((s) => s.beginRound)
  const pairWith = usePeerReviewStore((s) => s.pairWith)
  const enterGhostMode = usePeerReviewStore((s) => s.enterGhostMode)
  const setMyGrade = usePeerReviewStore((s) => s.setMyGrade)
  const setPeerGrade = usePeerReviewStore((s) => s.setPeerGrade)
  const submitRound = usePeerReviewStore((s) => s.submitRound)
  const tickRound = usePeerReviewStore((s) => s.tickRound)
  const cancelRound = usePeerReviewStore((s) => s.cancelRound)
  const resetForQuestion = usePeerReviewStore((s) => s.resetForQuestion)
  const noteBroadcast = usePeerReviewStore((s) => s.noteBroadcast)

  const begin = useCallback(function (questionId, mySubmission) {
    return beginRound(questionId, mySubmission)
  }, [beginRound])

  const pair = useCallback(function (peerSubmission, peerUserId) {
    return pairWith(peerSubmission, peerUserId)
  }, [pairWith])

  const ghost = useCallback(function () {
    return enterGhostMode()
  }, [enterGhostMode])

  const grade = useCallback(function (g) {
    return setMyGrade(g)
  }, [setMyGrade])

  const recordPeerGrade = useCallback(function (g) {
    return setPeerGrade(g)
  }, [setPeerGrade])

  const submit = useCallback(function () {
    return submitRound()
  }, [submitRound])

  const tick = useCallback(function (elapsedMs) {
    return tickRound(elapsedMs)
  }, [tickRound])

  const cancel = useCallback(function () {
    return cancelRound()
  }, [cancelRound])

  const reset = useCallback(function (questionId) {
    return resetForQuestion(questionId)
  }, [resetForQuestion])

  const note = useCallback(function () {
    return noteBroadcast()
  }, [noteBroadcast])

  return {
    begin: begin,
    pair: pair,
    ghost: ghost,
    grade: grade,
    recordPeerGrade: recordPeerGrade,
    submit: submit,
    tick: tick,
    cancel: cancel,
    reset: reset,
    noteBroadcast: note
  }
}