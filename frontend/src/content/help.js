// Single source of truth for in-app help. Rendered by the ⓘ help popup (components/HelpModal.jsx),
// which replaced the old sidebar "Manual" page. Content follows the Spandan User Manual v1.0 (Sep 2026)
// plus everything added since (Segment Time 1–15, anonymity percentage, chimes, tours).
//
// Each section: { id, role: 'teacher' | 'student' | 'both', icon, title, ordered?, adminOnly?,
//                 routes: [RegExp] (pathnames this section is the best match for), body: [string] }

import { CircleCheck, CircleHelp, Clapperboard, ClipboardPaste, Hand, History as HistoryIcon, KeyRound, LayoutDashboard, Link as LinkIcon, Maximize, Mic, PenLine, Plus, Rocket, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, TrendingUp, Trophy, User as UserIcon, UserPlus } from 'lucide-react'

const T = 'teacher', S = 'student', B = 'both', G = 'guest'  // G = signed-out landing page

export const HELP_SECTIONS = [
  // ───────────────────────────── Landing page (signed out) ─────────────────────────────
  {
    id: 'guest-welcome', role: G, icon: Hand, title: 'What is Spandan?',
    routes: [/^\/?$/],
    body: [
      'Spandan is a live classroom polling platform. As a teacher lectures, it transcribes the lecture, turns each segment into poll questions, and sends the ones the teacher approves to every student\'s screen. Students answer against a timer and climb a live leaderboard.',
      'Teachers sign in to run sessions and see analytics. Students join a session with a short code and answer questions.',
      'Everything runs in the browser. Google Chrome (or Microsoft Edge) is recommended; Video mode depends on it.',
    ],
  },
  {
    id: 'guest-register', role: G, icon: UserPlus, title: 'Create an account', ordered: true,
    routes: [],
    body: [
      'On the Create Account card fill in your Full Name, Email Address and a Password (at least 8 characters with an upper-case letter, a lower-case letter, a digit and a symbol), then confirm the password.',
      'Under "Want to…" choose your role: Learn if you will join sessions as a student, or Teach if you will run them.',
      'Click Create Account. A verification code is emailed to you; enter it on the next screen (you can request a new one after 60 seconds). Your account is created and you are signed in.',
      'Teach role: your account also needs admin approval before you can sign in and create rooms. Until an admin approves it, teacher features stay locked. The Learn role is active immediately.',
      'Prefer one click? Continue with Google creates the account from your Google identity (Teach accounts still need approval).',
    ],
  },
  {
    id: 'guest-signin', role: G, icon: KeyRound, title: 'Sign in',
    routes: [],
    body: [
      'Already registered? Click Sign in, enter your email and password, and you land on your dashboard (teachers) or your join screen (students).',
      'Continue with Google signs you in with your Google account if it was used to register.',
      'Forgot Password? sends a reset link to your email.',
      'Use the Dark / Light button top-right to switch theme. Once signed in, the ⓘ button in every page header opens the full guide for that page, and each page has a short guided tour on first visit.',
    ],
  },

  // ───────────────────────────── Teacher ─────────────────────────────
  {
    id: 'getting-started', role: T, icon: Rocket, title: 'Getting started',
    routes: [],
    body: [
      'Spandan listens to your lecture, transcribes it in real time, and turns each segment into poll questions. You approve them with one click, they appear on every student\'s screen, students answer against a timer, and a live leaderboard and end-of-session analytics follow.',
      'The same flow works from your microphone (Normal mode), a YouTube video or live stream (Video mode), text you paste (Paste & Generate), or a question you type yourself (Create Q).',
      'Teacher accounts need admin approval before they can sign in; the Learn role is active immediately. You can sign in with email and password or with Google. Use the Dark / Light button top-right to switch theme.',
      'Use Google Chrome (or Microsoft Edge) — Video mode depends on it. Nothing to install: everything runs in the browser.',
      'Help is always one click away: the ⓘ button in the header opens this guide on the section for the page you are on, with search. Press ? on your keyboard to open it too. Every page has a short guided tour that runs on your first visit; replay it any time with "Take this page\'s tour" at the top of this popup.',
    ],
  },
  {
    id: 'dashboard', role: T, icon: LayoutDashboard, title: 'The teacher dashboard',
    routes: [/^\/teacher\/?$/, /^\/teacher\/manage-room\/?$/],
    body: [
      'After signing in you land on the dashboard. Four cards summarise your activity: Total Rooms, Active Rooms, Total Polls and Total Responses.',
      'Create New Room is right below the cards (name + Normal / Video). My Active Rooms lists each open room with its join code and question count; Manage → jumps straight back into its live console.',
      'Sidebar: Dashboard (home), Create Room, Manage Room (open and administer active rooms), Room History (ended sessions, results, CSV export). Admins also see Approvals.',
    ],
  },
  {
    id: 'creating-a-room', role: T, icon: Plus, title: 'Creating a room',
    routes: [/^\/teacher\/create-room\/?$/],
    body: [
      'A room is one live session that students join. Create one from the dashboard panel or the Create Room page.',
      'Type a Name (your lecture topic works well) and choose the content source: Normal — live mic + transcript, or Video — a YouTube video or live link (paste the URL; you can change it later with "Edit link").',
      'Click Create Room. Spandan generates a unique six-letter join Code and opens the live console. Share the code with students — that is how they join.',
      'Video mode needs Google Chrome or Microsoft Edge to capture the video\'s audio. Open Spandan in one of those before starting a video room.',
    ],
  },
  {
    id: 'live-console', role: T, icon: SlidersHorizontal, title: 'The live session console',
    routes: [/^\/teacher\/room\/[^/]+\/?$/],
    body: [
      'This is your control room during a session. Top row: the room Code with Copy, the live Participants count, then Paste & Generate, Create Q, the bell (chime on/off for this device), Settings and End Room.',
      'Below: the green microphone (Start Recording) in Normal mode, or the embedded video with "Start Session (share this tab\'s audio)" in Video mode; the Current Segment Transcription panel with Generate Q; Session Questions (everything asked so far); and the live Leaderboard.',
      'The small summary under the microphone (Provider, Time/Answer, Points, Segment Time, Questions/Segment, Difficulty) shows your current settings at a glance.',
      'Adjust Settings before you start recording. End Room closes the session for everyone and compiles the results.',
    ],
  },
  {
    id: 'room-settings', role: T, icon: SettingsIcon, title: 'Room settings (the "Settings" button)',
    routes: [],
    body: [
      'Segment Time — how long each lecture/video segment runs before questions are generated from it (any whole number of minutes from 1 to 15; default 2). Shorter segments = more frequent polls.',
      'Questions / Segment — how many questions to generate each segment (1 to 10; default 2).',
      'Difficulty Level — easy, medium, or hard (default medium).',
      'Question Type Mix — the percentage split across MCQ (one correct answer), True/False, and MSQ (multiple correct answers); applied when generating 4+ questions. The three must add up to 100% (default: 100% True/False).',
      'Time to Answer (TTA) — seconds students get per poll (0 to 300; default 30).',
      'Points per Question — maximum points for a correct answer (1 to 500; default 100). Faster correct answers earn more.',
      'Question Generator — the AI engine used to write questions (a default is preselected).',
      'Anonymous Leaderboard — hide student names on the public board. With it on, Anonymity Percentage (default 20) sets the share of lowest scorers whose real names YOU still see; "Reveal bottom to students" shows that same slice by name to students too.',
      'Click Save Settings. These defaults apply to auto-generated, pasted-text and manually created questions alike. You can reopen Settings any time; changes apply to questions generated after that.',
    ],
  },
  {
    id: 'normal-mode', role: T, icon: Mic, title: 'Normal mode: recording & transcription', ordered: true,
    routes: [],
    body: [
      'Click the green microphone to Start Recording and allow microphone access if prompted. The button turns into a red Listening… indicator with a LIVE badge and the segment timer starts counting down.',
      'As you speak, your words stream into Current Segment Transcription in real time.',
      'When the segment timer ends, Spandan automatically generates questions from that segment using your Settings (count, difficulty, type mix). Press Generate Q to do it on demand for the current segment.',
      'Speak clearly and let a full segment run before generating — the more coherent the transcript, the better the questions.',
    ],
  },
  {
    id: 'video-mode', role: T, icon: Clapperboard, title: 'Video mode (YouTube / live stream)', ordered: true,
    routes: [],
    body: [
      'Create the room in Video mode and paste a YouTube video or live-stream link — or change it later with "Edit link" on the console.',
      'Click "Start Session (share this tab\'s audio)" and, when the browser asks, share THIS tab and keep "Share tab audio" ticked — otherwise there is no audio to transcribe. The prompt appears once per session.',
      'Play the video. Spandan transcribes the spoken audio and generates questions from it, segment by segment, exactly like a spoken lecture.',
      'The video pauses automatically on every student\'s screen while your approval popup is open and resumes afterwards (live streams jump back to the live edge). Requires Google Chrome or Microsoft Edge.',
    ],
  },
  {
    id: 'reviewing-launching', role: T, icon: CircleCheck, title: 'Reviewing & launching questions',
    routes: [],
    body: [
      'No question reaches students until you approve it. When a generated batch is ready, a five-second chime rings, students hear their own chime at the same moment, and the Question Approval dialog opens. If you are on another tab, the browser tab title flashes "(!) Questions ready". The bell button mutes the chime on this device.',
      'In the dialog: read the question and options (the correct one is marked CORRECT), read the Explanation, click Edit to fix wording or the answer, Reject to discard a weak question, or Approve & Launch to push it to students instantly.',
      'Batch review: numbered tabs (Q1, Q2 …) step through each generated question; the progress bar tracks how far through the batch you are.',
      'Launched questions appear on every student\'s screen with the Time to Answer countdown; answers arrive live and the leaderboard updates as they do.',
    ],
  },
  {
    id: 'paste-generate', role: T, icon: ClipboardPaste, title: 'Paste & Generate (from your own text)', ordered: true,
    routes: [],
    body: [
      'Use Paste & Generate to create questions from text you already have — lecture notes, a textbook passage, an article — without lecturing live.',
      'Paste the content (at least 50 characters) and choose a Question Mode: True/False Only, or Mixed (MCQ + TF + MSQ).',
      'Your room settings (difficulty, points, TTA, count) are applied automatically. Click Generate Questions.',
      'A chime rings when the batch is ready (students hear theirs too); review each question just like the live flow — Reject, or Launch to Class, then Next Question.',
    ],
  },
  {
    id: 'create-q', role: T, icon: PenLine, title: 'Create Q (write your own question)', ordered: true,
    routes: [],
    body: [
      'Use Create Q when you want full control and no AI — you write the question yourself. (No chime for this one; it is your own typing.)',
      'Pick a Question Type: Single Answer (MCQ), True/False, or Multi Answer (MSQ).',
      'Type the question, add the options with + Add Option, mark the correct one(s), set Time to Answer and Points.',
      'Click Launch Question to send it straight to students with the answer timer.',
    ],
  },
  {
    id: 'leaderboard-teacher', role: T, icon: Trophy, title: 'The live leaderboard',
    routes: [],
    body: [
      'Students are ranked by points: correctness plus speed (faster correct answers earn more).',
      'The board refreshes after each segment\'s questions close. With Anonymous Leaderboard on, students see "Anonymous #rank" rows; you still see real names for the bottom share set by Anonymity Percentage.',
      'When you End Room, the final board settles and the results page opens.',
    ],
  },
  {
    id: 'results', role: T, icon: TrendingUp, title: 'Results & analytics',
    routes: [/^\/teacher\/room\/[^/]+\/results\/?$/],
    body: [
      'When you click End Room, Spandan compiles the session results. Reopen them any time from Room History → View Results.',
      'Summary tiles: Students (everyone who joined or answered), Questions, Responses, Participation, Class correct rate, Median response time, Score spread (median / mean points) and Session length.',
      'Session timeline: one column per poll at the minute it was launched, height = students who answered, colour = correct-rate band; below it the cumulative join curve shows late joiners.',
      'Participation funnel (joined → answered one → answered half → answered all) and the score distribution (two humps = two groups in the room).',
      'Correct rate per question (sorted) and Speed vs accuracy (median response time against correct rate: slow-and-wrong = the class struggled, fast-and-wrong = a misconception). By lecture segment shows where the class got lost.',
      'Question-wise analysis: every question with difficulty (share correct), discrimination (point-biserial — above 0.3 good, below 0.2 weak), median time and flags (too easy, hard, low discrimination, dead distractor). Click a row for the answer distribution, the explanation and who got it wrong.',
      'Students × questions heatmap: one cell per student per question (correct, wrong, no answer), sorted by points.',
      'Download questions exports every question with its options as PDF (via the print dialog → Save as PDF) or CSV, either as an Answer key (✓ on correct options, explanations, stats) or a Student copy (a handout without answers). Responses CSV downloads every answer.',
      'Each student gets a personal results page: their rank (hidden when the leaderboard is anonymous), points, correct rate and median time against the class, and a per-question breakdown with their own answer highlighted. No other student is named.',
    ],
  },
  {
    id: 'history-export', role: T, icon: HistoryIcon, title: 'Room history & exporting data',
    routes: [/^\/teacher\/room-history\/?$/],
    body: [
      'Room History lists every ended session as a card, newest first, with its code and end date.',
      'View Results → reopens the full analytics for that session. CSV downloads the session\'s responses as a spreadsheet for your own records or grading.',
      'Tip: use the CSV export to keep an offline gradebook or to analyse participation across many sessions.',
    ],
  },
  {
    id: 'approvals', role: T, icon: ShieldCheck, title: 'Approving teachers (admins)', adminOnly: true,
    routes: [/^\/admin\/?$/],
    body: [
      'New Teach-role sign-ups wait in Approvals until an admin approves them; until then they cannot sign in.',
      'Open Approvals from the sidebar, review the pending registrations, and approve or reject each one. Approved teachers can sign in immediately.',
    ],
  },

  // ───────────────────────────── Student ─────────────────────────────
  {
    id: 's-getting-started', role: S, icon: Rocket, title: 'Getting started',
    routes: [],
    body: [
      'Spandan is where your teacher\'s live poll questions appear. You join a session with a short code, answer each question against a timer, and watch your place on the leaderboard.',
      'Create an account with the Learn role (active immediately) or sign in with Google. Use the Dark / Light button top-right to switch theme.',
      'Help is always one click away: the ⓘ button in the header opens this guide on the section for the page you are on, with search. Press ? to open it too. Every page has a short guided tour that runs on your first visit; replay it with "Take this page\'s tour" at the top of this popup.',
    ],
  },
  {
    id: 's-dashboard', role: S, icon: LayoutDashboard, title: 'Your dashboard',
    routes: [/^\/student\/?$/],
    body: [
      'The Quick Join box on your dashboard takes a room code and drops you straight into the session.',
      'Sidebar: Dashboard (home), Join Room (same thing on its own page), Room History (your past sessions and personal results).',
    ],
  },
  {
    id: 'joining', role: S, icon: LinkIcon, title: 'Joining a room', ordered: true,
    routes: [/^\/student\/join-room\/?$/],
    body: [
      'Get the six-letter room code from your teacher.',
      'Enter it in Quick Join on your Dashboard or on the Join Room page and press Join.',
      'You land in the live session — wait there for the teacher\'s first question. Keep this tab open.',
    ],
  },
  {
    id: 'answering', role: S, icon: CircleHelp, title: 'Answering questions', ordered: true,
    routes: [/^\/student\/session\/[^/]+\/?$/],
    body: [
      'When the teacher\'s questions are ready, a five-second chime rings so you know it is question time (once per segment). If your browser blocked the sound, tap "Enable sound" once; the bell button next to Leave mutes it on this device.',
      'When the teacher launches a poll, the question takes over your screen with a large countdown (the teacher\'s Time to Answer).',
      'Pick your answer: MCQ and True/False want one choice; MSQ (multiple-select) wants every correct option — select all that apply. It locks in and Answer Submitted appears.',
      'Answer before the timer runs out — points reward both correctness and speed. Between questions you see Waiting for Next Question with your Past Questions and the Leaderboard.',
    ],
  },
  {
    id: 'video-mode-rooms', role: S, icon: Clapperboard, title: 'Video-mode rooms',
    routes: [],
    body: [
      'Some rooms play a YouTube video or live stream inside the page instead of the teacher speaking. Just watch along.',
      'Recorded video: you CAN pause and rewind to review earlier parts, but you cannot skip ahead of where the class has reached.',
      'Live stream: it plays in real time at the live edge — you cannot rewind or pause.',
      'When the teacher\'s questions are ready, the video pauses automatically and the question appears; it resumes on its own once the poll closes.',
    ],
  },
  {
    id: 'fullscreen', role: S, icon: Maximize, title: 'Full screen & answering',
    routes: [],
    body: [
      'You can make the video full screen to watch it larger.',
      'IMPORTANT: in full screen a poll still appears and you WILL see the question — but you will NOT be able to select your answer from there.',
      'When a question comes up, exit full screen to answer. Then you can go full screen again.',
    ],
  },
  {
    id: 's-leaderboard', role: S, icon: Trophy, title: 'Leaderboard',
    routes: [],
    body: [
      'Your score builds up across the whole session from your correct answers and how quickly you answer.',
      'Your teacher may run an anonymous leaderboard — then rows show "Anonymous #rank" instead of names.',
      'The final leaderboard appears once the teacher ends the room.',
    ],
  },
  {
    id: 's-results', role: S, icon: TrendingUp, title: 'Your results',
    routes: [/^\/student\/room\/[^/]+\/results\/?$/],
    body: [
      'When the teacher ends the room you are taken to your personal results. The tiles at the top show your rank (hidden if the leaderboard is anonymous), points, correct rate, median time, best streak and how many questions you answered, each next to the class figure.',
      'Below the tiles: your points through the session; you vs the class per question; the Question-wise analysis (your result, time and points next to the class figures for every question, filterable to Wrong or Not answered; click a row for the correct answer, your pick, how the class answered and the explanation); and where you sit in the class score distribution. No other student is named.',
      'Reopen any past session\'s results from Room History.',
    ],
  },
  {
    id: 's-history', role: S, icon: HistoryIcon, title: 'Room history',
    routes: [/^\/student\/room-history\/?$/],
    body: [
      'Room History lists the sessions you have taken part in, newest first. View Results reopens your personal results for that session.',
    ],
  },

  // ───────────────────────────── Both ─────────────────────────────
  {
    id: 'account-profile', role: B, icon: UserIcon, title: 'Your profile & account',
    routes: [/^\/(teacher|student)\/profile\/?$/],
    body: [
      'Open your profile from the avatar menu top-right. You can update your name, photo, contact details, bio and (for teachers) department, employee ID and qualifications.',
      'Change your password from the same page. Forgot it? Use "Forgot Password?" on the sign-in screen.',
      'The Dark / Light button switches theme; the choice is remembered on this device.',
    ],
  },
]

export function sectionsForRole(role, user) {
  if (role === G) return HELP_SECTIONS.filter(s => s.role === G)          // signed out: landing-page guide only
  return HELP_SECTIONS.filter(s => (s.role === role || s.role === B) && (!s.adminOnly || user?.isAdmin))
}

// Best section for the current page: first section (for this role) whose routes match the pathname.
export function sectionForPath(pathname, role, user) {
  const list = sectionsForRole(role, user)
  return list.find(s => s.routes.some(r => r.test(pathname))) || list[0] || null
}

export function searchSections(sections, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return sections
  return sections.filter(s => s.title.toLowerCase().includes(q) || s.body.some(line => line.toLowerCase().includes(q)))
}
