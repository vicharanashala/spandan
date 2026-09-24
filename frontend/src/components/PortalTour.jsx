import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../stores/authStore'
import useRoomStore from '../stores/roomStore'
import { useTourStore } from '../stores/tourStore'
import OnboardingTour from './OnboardingTour'
import { API_URL } from '../config.js'

// A single page of the teacher portal tour. `anchor` is the first selector we wait for after
// navigating (proof the target page has mounted) and `adminOnly: true` pages (the Approvals desk)
// are dropped from the flow for non-admin teachers. Each page = [intro, ...component spotlights,
// goto-next-step] fed to OnboardingTour one page at a time.
const PAGES = [
  {
    id: 'dashboard',
    path: '/teacher',
    anchor: '[data-tour="teacher-stats"]',
    intro: {
      eyebrow: 'Dashboard', icon: 'grid',
      title: 'Your dashboard',
      description: "This is your command centre — every room, poll and stat lives here. Let's look at the key parts."
    },
    steps: [
      { target: '[data-tour="teacher-stats"]', eyebrow: 'Live overview', icon: 'chart', title: 'Track your classroom', description: 'Rooms created, polls asked and responses received — your teaching impact at a glance, updated in real time.', placement: 'bottom' },
      { target: '[data-tour="create-room-input"]', eyebrow: 'Quick create', icon: 'zap', title: 'Launch a room instantly', description: 'Type a room name and hit Create Room right from the dashboard — no extra page needed.', placement: 'right' }
    ],
    next: 'Create Room'
  },
  {
    id: 'create-room',
    path: '/teacher/create-room',
    anchor: '[data-tour="create-name-input"]',
    demoCreate: true,
    intro: {
      eyebrow: 'Create Room', icon: 'grid',
      title: 'The Create Room page',
      description: 'The dedicated creation screen — the same flow with more room to plan a class properly.'
    },
    steps: [
      { target: '[data-tour="create-name-input"]', eyebrow: 'Step 1', icon: 'grid', title: 'Name your room', description: "Pick a clear name students will recognise — the join code is generated automatically from it.", placement: 'right' },
      { target: '[data-tour="create-mode-options"]', eyebrow: 'Step 2', icon: 'zap', title: 'Choose a mode', description: 'Normal captures your microphone live; Video plays a YouTube video or live stream while it transcribes.', placement: 'right' },
      { target: '[data-tour="create-submit-btn"]', eyebrow: 'Step 3', icon: 'done', title: 'Bring your class in', description: 'Create Room spins the room up instantly — share the code and students join in seconds.', placement: 'right' }
    ],
    next: 'Manage Room'
  },
  {
    id: 'room-detail',
    path: null, // reached by creating the demo room — the real URL is /teacher/room/:id
    anchor: '[data-tour="room-code-row"]',
    intro: {
      eyebrow: 'Manage Room', icon: 'zap',
      title: 'Your room control centre',
      description: "This is where a live class actually happens. Every control for running a session lives on this one screen."
    },
    steps: [
      { target: '[data-tour="room-code-row"]', eyebrow: 'Join code', icon: 'zap', title: 'Share the code', description: "Students join from the student portal with this code — the Copy button drops it straight onto your clipboard to share.", placement: 'top' },
      { target: '[data-tour="room-mic-btn"]', eyebrow: 'Start the class', icon: 'chart', title: 'Hit the mic', description: 'Start recording to capture your lecture live — each timed segment auto-generates quiz questions as you teach.', placement: 'right' },
      { target: '[data-tour="room-transcript-card"]', eyebrow: 'Live transcript', icon: 'history', title: 'Watch the text appear', description: 'Everything you say streams here in real time, and Generate Q turns the current segment into poll questions on demand.', placement: 'top' },
      { target: '[data-tour="room-questions"]', eyebrow: 'Question bank', icon: 'grid', title: 'Approved questions', description: 'Approved questions pile up here with live answer counts, broadcast instantly to every student in the room.', placement: 'top' },
      { target: '[data-tour="room-leaderboard"]', eyebrow: 'Live scores', icon: 'trophy', title: 'The leaderboard', description: 'A live, ranked scoreboard updates as answers arrive — a great way to keep the whole class engaged.', placement: 'left' },
      { target: '[data-tour="room-settings-btn"]', eyebrow: 'Tune & finish', icon: 'done', title: 'Settings and End Room', description: 'Settings adjusts answer time, points and question difficulty; End Room wraps up the session and saves it to Room History.', placement: 'left' }
    ],
    next: 'Room History'
  },
  {
    id: 'room-history',
    path: '/teacher/room-history',
    anchor: '[data-tour="history-section"]',
    intro: {
      eyebrow: 'Room History', icon: 'history',
      title: 'Past sessions',
      description: "Every class you've ended is kept here — results and answers ready for review."
    },
    steps: [
      { target: '[data-tour="history-section"]', eyebrow: 'Ended rooms', icon: 'history', title: 'Your archive', description: 'Ended classes appear here with their end date, ready to reopen and revisit anytime.', placement: 'bottom' },
      { target: '[data-tour="history-export"]', eyebrow: 'Data export', icon: 'done', title: 'Download full results', description: 'Teachers get a one-click CSV of every answer in a session — great for records or grade books.', placement: 'bottom' }
    ],
    next: 'Approvals'
  },
  {
    id: 'approvals',
    path: '/admin',
    anchor: '[data-tour="admin-tabs"]',
    adminOnly: true,
    intro: {
      eyebrow: 'Approvals', icon: 'done',
      title: 'The admin desk',
      description: "Only approved teachers can sign in — this is where you decide who gets into Spandan."
    },
    steps: [
      { target: '[data-tour="admin-tabs"]', eyebrow: 'Filter requests', icon: 'grid', title: 'Pending, approved, rejected', description: 'Three tabs with live counts — flip between them to see every teacher request at a glance.', placement: 'bottom' },
      { target: '[data-tour="admin-list"]', eyebrow: 'Decisions', icon: 'done', title: 'Approve or reject', description: "Each pending teacher request shows their details with Approve / Reject buttons alongside.", placement: 'bottom' }
    ],
    next: 'Manual'
  },
  {
    id: 'manual',
    path: '/teacher/help',
    anchor: '[data-tour="manual-intro"]',
    intro: {
      eyebrow: 'Manual', icon: 'help',
      title: 'Always at hand',
      description: "Every feature lives in the manual — and the shortcut to it is always sitting right there in the sidebar."
    },
    steps: [
      { target: '[data-tour="nav-manual"]', eyebrow: 'The Manual button', icon: 'help', title: 'One click away', description: "Tap Manual on the left at any time to open the complete written guide — how every mode, poll and setting works, all in one place.", placement: 'right' }
    ]
  }
]

// Assemble the steps fed to OnboardingTour for one page:
// [intro (centered)] + [...component spotlights] + [continue step (centered)].
// `nextLabel` is the REAL next page in this teacher's filtered flow (Approvals may be dropped),
// so the "Up next" box never announces a page that won't actually open.
const buildSteps = (page, num, total, isLast, nextLabel) => {
  const steps = [
    { target: null, eyebrow: `${num} of ${total} · ${page.intro.eyebrow}`, icon: page.intro.icon, title: page.intro.title, description: page.intro.description }
  ]
  page.steps.forEach((s) => steps.push({ ...s }))
  if (isLast) {
    steps.push({
      target: null, eyebrow: 'All set', icon: 'trophy',
      title: "You're ready to teach",
      description: "That was the full tour. Create a room and bring your class to life — Spandan handles the rest.",
      cta: 'Start teaching'
    })
  } else if (page.demoCreate) {
    steps.push({
      target: null, eyebrow: 'Hands-on', icon: 'zap',
      title: 'Create your first room',
      description: "Let's do it for real — this button creates a sample room and lands you inside its full control centre to explore.",
      cta: 'Create Demo Room'
    })
  } else {
    steps.push({
      target: null, eyebrow: 'Next stop', icon: 'grid',
      title: `Up next: ${nextLabel || page.next}`,
      description: 'Click Continue to jump over and see what that page has to offer.',
      cta: 'Continue →'
    })
  }
  return steps
}

export default function PortalTour() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, token, updateUser } = useAuthStore()
  const { setAuthToken: setRoomAuthToken, createRoom } = useRoomStore()
  const requestId = useTourStore((s) => s.requestId)

  const [active, setActive] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [steps, setSteps] = useState(null)
  const startedRef = useRef(false)
  const prevRequestRef = useRef(0)

  // PAGES filtered to this teacher's access (Approvals only for admins).
  const flow = useMemo(() => PAGES.filter((p) => (p.adminOnly ? user?.isAdmin : true)), [user?.isAdmin])
  const total = flow.length

  const persistSeen = useCallback(async () => {
    updateUser({ ...user, hasSeenOnboarding: true })
    try {
      await fetch(`${API_URL}/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ hasSeenOnboarding: true })
      })
    } catch (err) {
      console.error('Failed to persist onboarding status:', err)
    }
  }, [user, token, updateUser])

  const stopTour = useCallback(() => {
    setActive(false)
    setSteps(null)
  }, [])

  const completeAndClose = useCallback(() => {
    stopTour()
    persistSeen()
  }, [stopTour, persistSeen])

  const goToPage = useCallback(
    (i) => {
      const page = flow[i]
      if (!page || !page.path) {
        completeAndClose()
        return
      }
      navigate(page.path)
      const isLastPage = i === flow.length - 1
      const nextLabel = flow[i + 1]?.intro.eyebrow
      // Poll until the target page has actually mounted (its first anchor exists), so the
      // spotlight steps are measured against real elements — then hand over that page's steps.
      let tries = 0
      const check = () => {
        tries += 1
        if (document.querySelector(page.anchor)) {
          setPageIndex(i)
          setSteps(buildSteps(page, i + 1, flow.length, isLastPage, nextLabel))
          return
        }
        if (tries > 100) {
          setPageIndex(i)
          setSteps(buildSteps(page, i + 1, flow.length, isLastPage, nextLabel))
          return
        }
        setTimeout(check, 40)
      }
      setTimeout(check, 120)
    },
    [flow, navigate, completeAndClose]
  )

  // Open the control centre of the JUST-created demo room at its real URL (/teacher/room/:id).
  const openRoomPage = useCallback(
    (roomId) => {
      const idx = flow.findIndex((p) => p.id === 'room-detail')
      if (idx < 0) {
        completeAndClose()
        return
      }
      const page = flow[idx]
      navigate(`/teacher/room/${roomId}`)
      const isLastPage = idx === flow.length - 1
      const nextLabel = flow[idx + 1]?.intro.eyebrow
      let tries = 0
      const check = () => {
        tries += 1
        if (document.querySelector(page.anchor)) {
          setPageIndex(idx)
          setSteps(buildSteps(page, idx + 1, flow.length, isLastPage, nextLabel))
          return
        }
        if (tries > 120) {
          setPageIndex(idx)
          setSteps(buildSteps(page, idx + 1, flow.length, isLastPage, nextLabel))
          return
        }
        setTimeout(check, 40)
      }
      setTimeout(check, 120)
    },
    [flow, navigate, completeAndClose]
  )

  // The "Create Demo Room" CTA: really create a room (normal mode, timestamped name so replays
  // never clash on join codes), then walk the room's control-centre page.
  const createDemoRoom = useCallback(async () => {
    try {
      if (token) setRoomAuthToken(token)
      const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const room = await createRoom(`Demo Room ${stamp}`, { mode: 'normal' })
      openRoomPage(room._id)
    } catch (err) {
      console.error('[PortalTour] Failed to create demo room:', err)
      // Room creation failed — skip past the dynamic control-centre page and continue the tour.
      goToPage(pageIndex + 2)
    }
  }, [token, setRoomAuthToken, createRoom, openRoomPage, goToPage, pageIndex])

  const handleFinish = useCallback(
    (reason) => {
      if (reason === 'skipped') {
        completeAndClose()
        return
      }
      const page = flow[pageIndex]
      if (page?.demoCreate) {
        createDemoRoom()
        return
      }
      if (pageIndex >= flow.length - 1) {
        completeAndClose()
      } else {
        goToPage(pageIndex + 1)
      }
    },
    [pageIndex, flow, flow.length, goToPage, completeAndClose, createDemoRoom]
  )

  const startTour = useCallback(() => {
    if (flow.length === 0) return
    setActive(true)
    goToPage(0)
  }, [flow.length, goToPage])

  // Auto-start: teachers who haven't seen the tour yet (once per account/login).
  useEffect(() => {
    if (user?.role === 'teacher' && user?.hasSeenOnboarding === false && !startedRef.current) {
      startedRef.current = true
      const t = setTimeout(startTour, 800)
      return () => clearTimeout(t)
    }
    if (!user || user.role !== 'teacher') startedRef.current = false
  }, [user, startTour])

  // Replay via the ❔ button on the dashboard (and any future trigger).
  useEffect(() => {
    if (requestId > prevRequestRef.current) {
      prevRequestRef.current = requestId
      if (user?.role === 'teacher') startTour()
    }
  }, [requestId, user?.role, startTour])

  // Safety: if the session drops mid-tour, close it.
  useEffect(() => {
    if (active && (!user || user.role !== 'teacher')) {
      stopTour()
    }
  }, [active, user, stopTour])

  if (!active || !steps) return null

  return (
    <OnboardingTour key={`page-${pageIndex}`} steps={steps} onFinish={handleFinish} />
  )
}