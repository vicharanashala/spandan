// Guided tours: one per page, for teachers AND students. Each step points at an element carrying
// data-tour="<target>". A tour auto-runs the first time its page is opened (per user record, see
// stores/tourStore.js) and can be replayed from the ⓘ help popup. Steps whose target is not on the
// page (mode-specific buttons, empty lists) are skipped.
//
// { id: { role: 'teacher' | 'student', path: RegExp, steps: [{ target, title, body }] } }
export const TOURS = {
  // ───────────────────────────── Teacher ─────────────────────────────
  dashboard: {
    role: 'teacher', path: /^\/teacher\/?$/,
    steps: [
      { target: 'sidebar', title: 'Your menu',
        body: 'Dashboard, Create Room, Manage Room and Room History live here (admins also see Approvals). On a phone, open it with the ☰ button.' },
      { target: 'create-room', title: 'Create your first room',
        body: 'Give the room a name and pick Normal (your microphone) or Video (a YouTube video or live stream). You get a six-letter join code to share with students.' },
      { target: 'active-rooms', title: 'Your active rooms',
        body: 'Every open room appears here with its code and question count. Manage → takes you back into its live console at any time.' },
      { target: 'help-button', title: 'Help is one click away',
        body: 'The ⓘ button opens the guide for the page you are on, with search, and lets you replay any page\'s tour. Press ? to open it anywhere.' },
    ],
  },
  'create-room': {
    role: 'teacher', path: /^\/teacher\/create-room\/?$/,
    steps: [
      { target: 'room-name', title: 'Name the room', body: 'Your lecture topic works well. Students see this name when they join.' },
      { target: 'room-mode', title: 'Pick the content source',
        body: 'Normal listens to your microphone. Video plays a YouTube video or live stream and listens to its audio (needs Chrome or Edge). You can change the video link later from the console.' },
      { target: 'create-button', title: 'Create it',
        body: 'Spandan generates the join code and opens the live console, where you set up and run the session.' },
    ],
  },
  'manage-room': {
    role: 'teacher', path: /^\/teacher\/manage-room\/?$/,
    steps: [
      { target: 'room-list', title: 'Your open rooms', body: 'Each card is a room that has not been ended yet, with its join code and question count.' },
      { target: 'manage-button', title: 'Back to the console', body: 'Manage → reopens the live console for that room: transcription, questions, leaderboard, settings and End Room.' },
    ],
  },
  'room-history': {
    role: 'teacher', path: /^\/teacher\/room-history\/?$/,
    steps: [
      { target: 'history-list', title: 'Ended sessions', body: 'Every room you have ended, newest first, with its code and end date.' },
      { target: 'view-results', title: 'Reopen the analytics', body: 'View Results → shows the summary cards and the question-by-question correct rates for that session.' },
      { target: 'csv-button', title: 'Export the data', body: 'CSV downloads every response of the session as a spreadsheet — handy for an offline gradebook or your own analysis.' },
    ],
  },
  console: {
    role: 'teacher', path: /^\/teacher\/room\/[^/]+\/?$/,
    steps: [
      { target: 'room-code', title: 'Share the code',
        body: 'Students join with this code (Copy puts it on your clipboard). The Participants box next to it counts who is in the room right now.' },
      { target: 'settings', title: 'Set up the session first',
        body: 'Segment time, questions per segment, difficulty, question-type mix, time to answer, points and the anonymous leaderboard all live here. Adjust them before you start recording.' },
      { target: 'start-capture', title: 'Start teaching',
        body: 'Normal mode: click the microphone and talk. Video mode: Start Session, share this tab with its audio, and press play. Spandan transcribes as it goes.' },
      { target: 'transcript', title: 'Watch the transcript',
        body: 'Your words stream in here, segment by segment. When a segment ends, questions are generated automatically; Generate Q does it on demand.' },
      { target: 'paste-generate', title: 'Other ways to ask',
        body: 'Paste & Generate turns any text into questions. Create Q, next to it, lets you write a question yourself. A chime tells you (and students) when a generated batch is ready.' },
      { target: 'end-room', title: 'Finish up',
        body: 'End Room closes the session for everyone, settles the leaderboard and opens the results. You can revisit them later in Room History.' },
    ],
  },
  results: {
    role: 'teacher', path: /^\/teacher\/room\/[^/]+\/results\/?$/,
    steps: [
      { target: 'results-stats', title: 'The session at a glance', body: 'Students, questions and responses, participation, the class correct rate, the median response time, the score spread and the session length.' },
      { target: 'results-download', title: 'Take the questions with you', body: 'Download every question with its options as a PDF or CSV — as an answer key with explanations, or as a student copy without answers. Responses CSV exports every answer.' },
      { target: 'results-timeline', title: 'How the session unfolded', body: 'One column per poll at the minute it was launched; height is how many answered, colour is the correct-rate band. Below it, the join curve shows late joiners.' },
      { target: 'item-analysis', title: 'Question by question', body: 'Difficulty, discrimination, median time and flags for each question. Click a row for the answer distribution, the explanation and who got it wrong.' },
      { target: 'results-heatmap', title: 'Every student, every question', body: 'One cell per student per question — correct, wrong or no answer — sorted by points. The quickest way to see who needs a word.' },
    ],
  },
  admin: {
    role: 'teacher', path: /^\/admin\/?$/,
    steps: [
      { target: 'approvals-table', title: 'Pending teachers', body: 'New Teach-role sign-ups wait here. Until approved they cannot sign in.' },
      { target: 'approve-button', title: 'Approve or reject', body: 'Approve lets the teacher sign in immediately. Reject blocks the account; the person is told to contact an admin.' },
    ],
  },
  profile: {
    role: 'both', path: /^\/(teacher|student)\/profile\/?$/,
    steps: [
      { target: 'edit-profile', title: 'Your details', body: 'Edit your name, photo, contact details and bio here. Teachers can add department, employee ID and qualifications.' },
      { target: 'change-password', title: 'Change your password', body: 'Enter your current password and the new one twice. Forgot it? Use "Forgot Password?" on the sign-in screen.' },
    ],
  },

  // ───────────────────────────── Student ─────────────────────────────
  's-dashboard': {
    role: 'student', path: /^\/student\/?$/,
    steps: [
      { target: 'sidebar', title: 'Your menu', body: 'Dashboard, Join Room and Room History live here. On a phone, open it with the ☰ button.' },
      { target: 'quick-join', title: 'Join a session', body: 'Type the six-letter code your teacher shared and press Join Room — you land straight in the live session.' },
      { target: 'help-button', title: 'Help is one click away', body: 'The ⓘ button opens the guide for the page you are on, with search, and lets you replay any page\'s tour. Press ? to open it anywhere.' },
    ],
  },
  's-join-room': {
    role: 'student', path: /^\/student\/join-room\/?$/,
    steps: [
      { target: 'join-code', title: 'Enter the room code', body: 'Six letters or digits from your teacher. Capitals do not matter.' },
      { target: 'join-button', title: 'Join', body: 'You land in the live session and wait for the teacher\'s first question. Keep the tab open.' },
    ],
  },
  's-session': {
    role: 'student', path: /^\/student\/session\/[^/]+\/?$/,
    steps: [
      { target: 'status-row', title: 'You are connected',
        body: 'The green dot means you are live in the room. The bell button mutes the question-time chime on this device. Leave exits the session (not possible once you have answered).' },
      { target: 'question-area', title: 'Questions appear here',
        body: 'When the teacher launches a poll it takes over this screen with a countdown. Pick your answer before the timer ends — points reward speed as well as correctness.' },
      { target: 'past-questions', title: 'What you have answered', body: 'Your earlier questions, your answer and whether it was correct.' },
      { target: 'leaderboard', title: 'The leaderboard', body: 'Updates after each segment\'s questions close. Your teacher may hide names (Anonymous #rank).' },
    ],
  },
  's-room-history': {
    role: 'student', path: /^\/student\/room-history\/?$/,
    steps: [
      { target: 'history-list', title: 'Your past sessions', body: 'Every session you took part in, newest first.' },
      { target: 'view-results', title: 'Your results', body: 'View Results → reopens your rank, score and per-question breakdown for that session.' },
    ],
  },
  's-results': {
    role: 'student', path: /^\/student\/room\/[^/]+\/results\/?$/,
    steps: [
      { target: 'results-stats', title: 'How you did', body: 'Your rank, points, correct rate, median time, best streak and how many you answered, each next to the class figure. If the leaderboard is anonymous, your rank stays hidden.' },
      { target: 'results-timeline', title: 'You against the class', body: 'Your points through the session, and each question you got right or wrong next to how the class did.' },
      { target: 'question-analysis', title: 'Question by question', body: 'Your result, time and points on every question next to the class. Filter to Wrong or Not answered, and click a row for the correct answer, your pick and the explanation.' },
    ],
  },
}

// The tour for a page, for this role (null when the page has none).
export function tourForPath(pathname, role) {
  for (const [id, t] of Object.entries(TOURS)) {
    if ((t.role === role || t.role === 'both') && t.path.test(pathname)) return id
  }
  return null
}

export const tourSteps = (id) => TOURS[id]?.steps || null
