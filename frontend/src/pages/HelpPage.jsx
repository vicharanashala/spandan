import React, { useState } from 'react'
import useAuthStore from '../stores/authStore'
import useIsMobile from '../hooks/useIsMobile'
import Sidebar from '../components/Sidebar'
import ThemeToggle from '../components/ThemeToggle'
import ProfileDropdown from '../components/ProfileDropdown'

// Role-aware in-app manual. Reached from the sidebar "Manual" item (/teacher/help, /student/help).
const TEACHER_SECTIONS = [
  {
    icon: '🚀', title: 'Getting started', ordered: true,
    body: [
      'Create a room from the Dashboard (quick-create) or the Create Room page.',
      'Give it a name and choose a mode — Normal (microphone) or Video (YouTube / live stream).',
      'Open Settings and adjust the room to how you want to run it (see "Room settings" below) before you begin.',
      'Share the room\'s join code with your students so they can join.',
      'Run the session, launching questions as you go. Click "End Room" when you are finished — this closes all polls and shows the final leaderboard.',
    ],
  },
  {
    icon: '⚙️', title: 'Room settings (the "Settings" button)',
    body: [
      'Segment Time — how long each lecture/video segment runs before questions are generated from it (choose 1, 2, 3, 5, 10, 15, 20 or 30 min; default 2). Shorter segments = more frequent polls.',
      'Questions / Segment — how many questions to generate each segment (1 to 10; default 2).',
      'Difficulty Level — easy, medium, or hard; controls how challenging the generated questions are (default medium).',
      'Question Type Mix — the percentage split across MCQ (one correct answer), True/False, and MSQ (multiple correct answers). The three must add up to 100% (default: 100% True/False).',
      'Time to Answer (TTA) — how many seconds students get to answer each poll (0 to 300; default 30).',
      'Points per Question — the maximum points for a correct answer (1 to 500; default 100). Faster correct answers earn more (points decay with time).',
      'Question Provider — the AI engine used to generate questions (a default is preselected).',
      'Tip: set these before you start. You can reopen Settings any time; changes apply to the questions generated after that.',
    ],
  },
  {
    icon: '🎙️', title: 'Normal mode (microphone)', ordered: true,
    body: [
      'Click the microphone to start; the room transcribes your lecture in real time (watch it fill in the "Current Segment Transcription" panel).',
      'At the end of each segment the app auto-generates questions from what you said, using your Settings (count, difficulty, type mix).',
      'Review and approve the questions in the popup, then launch them as a live poll.',
      'You can also press "Generate Q" on the transcript panel to generate from the current segment without waiting for the timer.',
    ],
  },
  {
    icon: '🎬', title: 'Video mode (YouTube / live stream)', ordered: true,
    body: [
      'Create the room in Video mode and paste a YouTube video or live-stream link — or change it later with "Edit link" on the room page.',
      'Click "Start Session" and, when the browser asks, share THIS tab and tick "Share tab audio". That lets Spandan hear the video to transcribe it and generate questions. The prompt appears once per session (browsers never allow silent capture).',
      'Play the video — it transcribes and generates questions per segment, exactly like the mic does.',
      'The video pauses automatically while a poll is live and resumes afterwards (live streams jump back to the live edge). Use Chrome or Edge for the most reliable tab-audio sharing.',
    ],
  },
  {
    icon: '📋', title: 'Paste & Generate (from your own text)',
    body: [
      'Use "Paste & Generate" to create questions from text you already have — lecture notes, a textbook passage, an article — without lecturing live.',
      'Click Paste & Generate and paste your content (at least 50 characters).',
      'Choose a style: "True/False" (T/F questions only) or "Mixed" (a variety of question types).',
      'The AI generates questions using your room\'s difficulty and count settings; review and edit them in the approval popup, then launch.',
    ],
  },
  {
    icon: '✍️', title: 'Create Q (write your own question)', ordered: true,
    body: [
      'Use "Create Q" when you want full control and no AI — you write the question yourself.',
      'Pick a type: MCQ (one correct of several options), True/False, or MSQ (several correct options).',
      'Type the question and its options, mark the correct answer(s), and set the points.',
      'Launch it straight to students with the answer timer.',
    ],
  },
  {
    icon: '❓', title: 'Running a poll & the leaderboard', ordered: true,
    body: [
      'Questions reach students from three places: auto-generated per segment, Paste & Generate, or Create Q.',
      'Review and approve each question in the popup — edit the wording or the correct answer if needed.',
      'Launch it. Students see the question and answer within the Time to Answer you set.',
      'Watch answers arrive; the leaderboard ranks students by points (correctness + speed).',
      'Continue to the next question or segment. When done, "End Room" settles and shows the final leaderboard.',
    ],
  },
  {
    icon: '🙋‍♂️', title: 'Handling Student Doubts',
    body: [
      'Students can ask text doubts during the lecture without interrupting you.',
      'Click the "Doubts" button in the top navigation bar to view them.',
      'You can reply to individual doubts, or group them by topic and resolve them in bulk.',
      'When you resolve a doubt, it moves to the resolved history. The student will get a private prompt to verify if they understood.',
    ],
  },
  {
    icon: '📉', title: 'Confusion Analytics (I\'m lost)',
    body: [
      'Students can click "I\'m lost" to instantly signal confusion without typing anything.',
      'Spandan uses AI to automatically detect what topic you were teaching at that exact moment.',
      'Click "Confusion Analytics" in the top navigation bar to open the analytics panel.',
      'You will see live confusion alerts, a heatmap of difficult topics, and a timeline. Use the "Ask Students" button to survey the class when you re-explain a topic.',
    ],
  },
]

const STUDENT_SECTIONS = [
  {
    icon: '🔗', title: 'Joining a room', ordered: true,
    body: [
      'There are two ways to join: the "Quick Join" box on your Dashboard (home screen), or the "Join Room" page from the sidebar — both work the same way.',
      'Enter the room code your teacher shared with you and press Join.',
      'You will land in the live session — wait there for the teacher to start asking questions.',
    ],
  },
  {
    icon: '❓', title: 'Answering questions', ordered: true,
    body: [
      'When the teacher launches a poll, the question appears at the top of your screen and takes over.',
      'Read the question and pick your answer: MCQ and True/False want one choice; MSQ (multiple-select) wants every correct option — select all that apply.',
      'Answer before the timer runs out. Points reward both correctness and speed, so answer promptly.',
      'When the poll closes, the question disappears and your position updates on the leaderboard.',
    ],
  },
  {
    icon: '🎬', title: 'Video-mode rooms',
    body: [
      'Some rooms play a YouTube video or live stream inside the page instead of the teacher speaking. Just watch along.',
      'Recorded YouTube video: you CAN pause and rewind to review earlier parts. You cannot skip ahead of where the class has reached.',
      'YouTube live stream: it plays in real time at the live edge, so you follow the broadcast as it happens — you cannot rewind or pause a live stream.',
      'When the teacher launches a poll, the video pauses automatically and the question appears; it resumes on its own once the poll closes.',
    ],
  },
  {
    icon: '⛶', title: 'Full screen & answering',
    body: [
      'You can make the video full screen to watch it larger.',
      'IMPORTANT: while you are in full screen, a poll will still appear and you WILL see the question — but you will NOT be able to mark/select your answer from there.',
      'So when a question comes up, exit full screen to mark your answer. Then you can go full screen again.',
    ],
  },
  {
    icon: '🏆', title: 'Leaderboard',
    body: [
      'Your score builds up across the whole session from your correct answers and how quickly you answer.',
      'The final leaderboard appears once the teacher ends the room.',
    ],
  },
  {
    icon: '🙋‍♂️', title: 'Asking questions (Doubts)',
    body: [
      'If you have a question during the lecture, click the floating "Q&A / Doubts" button at the bottom right.',
      'You can type your doubt or upvote questions asked by other students. High-priority doubts move to the top.',
      'When the teacher resolves your doubt, you will get a private prompt. You can click "Got it!" if you understand, or "Re-Open" if you still need help.',
    ],
  },
  {
    icon: '🚩', title: 'I\'m lost (Instant Confusion Signal)',
    body: [
      'If you suddenly lose track of the lecture, click the floating "I\'m lost" button.',
      'It instantly sends an anonymous signal to the teacher. The system automatically tags it with the exact topic the teacher was discussing.',
      'The button has a cooldown to prevent spamming, but you can use it whenever you feel left behind.',
    ],
  },
]

export default function HelpPage() {
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const role = user?.role || 'student'
  const sections = role === 'teacher' ? TEACHER_SECTIONS : STUDENT_SECTIONS

  // Collapsible sections — accordion: at most ONE open at a time, all collapsed by default.
  // Opening a section closes whichever was open; clicking the open one closes it.
  const [openIdx, setOpenIdx] = useState(null)
  const toggle = (i) => setOpenIdx((prev) => (prev === i ? null : i))

  return (
    <div style={{
      display: 'flex', minHeight: '100vh', maxWidth: '100%',
      background: 'var(--bg-primary)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif', boxSizing: 'border-box'
    }}>
      <Sidebar user={user} />

      <div style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        marginLeft: 'var(--sidebar-width, 240px)', transition: 'margin-left 0.2s ease',
        maxWidth: '100%', boxSizing: 'border-box'
      }}>
        {/* Header */}
        <header style={{
          background: 'var(--header-bg)', color: 'white',
          padding: isMobile ? '20px 16px' : '24px 32px',
          paddingLeft: isMobile ? '64px' : '32px', boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: isMobile ? '20px' : '26px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                Manual & Help
              </h1>
              <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '14px' }}>
                How to use Spandan as a {role}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
              <ThemeToggle />
              <ProfileDropdown />
            </div>
          </div>
        </header>

        {/* Content */}
        <main style={{ padding: isMobile ? '16px' : '28px 32px', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: '860px' }}>
            <p style={{ margin: '0 0 20px', fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Spandan turns a class into a live, interactive session: the teacher runs a room, students
              join with a code, and everyone answers questions in real time. Here is how it works.
            </p>

            {sections.map((s, idx) => {
              const isOpen = openIdx === idx
              return (
                <section key={s.title} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                  borderRadius: '14px', padding: isMobile ? '16px' : '20px 22px', marginBottom: '16px',
                  boxShadow: 'var(--card-shadow)'
                }}>
                  {/* Clickable heading toggles the section open/closed. */}
                  <h2 style={{ margin: 0 }}>
                    <button
                      type="button"
                      onClick={() => toggle(idx)}
                      aria-expanded={isOpen}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                        background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                        fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)',
                        textAlign: 'left', fontFamily: 'inherit'
                      }}
                    >
                      <span style={{ fontSize: '20px' }}>{s.icon}</span>
                      <span style={{ flex: 1 }}>{idx + 1}. {s.title}</span>
                      <span aria-hidden="true" style={{
                        fontSize: '13px', color: 'var(--text-secondary)', flexShrink: 0,
                        transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease'
                      }}>▶</span>
                    </button>
                  </h2>
                  {/* Tailwind's Preflight base resets `list-style: none`, so set the marker type
                      explicitly (inline overrides the reset) to show numbers / bullets. */}
                  {isOpen && React.createElement(
                    s.ordered ? 'ol' : 'ul',
                    { style: {
                      margin: '12px 0 0', paddingLeft: '24px', color: 'var(--text-secondary)',
                      fontSize: '14px', lineHeight: 1.65,
                      listStyleType: s.ordered ? 'decimal' : 'disc',
                      listStylePosition: 'outside'
                    } },
                    s.body.map((line, i) => (
                      <li key={i} style={{ display: 'list-item', marginBottom: i < s.body.length - 1 ? '8px' : 0 }}>{line}</li>
                    ))
                  )}
                </section>
              )
            })}

            <p style={{ margin: '18px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Need more help? Contact your Spandan administrator.
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
