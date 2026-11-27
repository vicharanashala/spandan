// Spandan Terms of Use and Privacy Notice. Single source for the /terms page, the registration
// checkboxes and the accept-terms screen shown to existing accounts.
//
// TERMS_VERSION must match backend/src/config/terms.js (a test asserts this). Bump BOTH on any
// material change: every existing account is then asked to accept the new version.
export const TERMS_VERSION = '1.0'
export const TERMS_EFFECTIVE = '15 July 2026' // start of the current Spandan deployment (first prod account + session)
export const TERMS_OPERATOR = 'Vicharanashala Lab for Education Design (VLED), IIT Ropar'
export const TERMS_CONTACT_EMAIL = 'dled@iitrpr.ac.in'

// Remembers, for the duration of the tab, that the user ticked the box on the Register tab before
// leaving for Google, so the Google role screen can pre-tick it instead of asking twice.
export const TERMS_TICKED_KEY = 'spandan-terms-ticked'

export const TERMS_CHECKBOX_LABEL =
  'I confirm that I am 18 years of age or older and I agree to the Spandan Terms of Use and Privacy Notice.'

// Each section: { id, title, paragraphs?: string[], bullets?: string[], highlight?: boolean }.
// `highlight` renders the section in an accented box (used for Research).
export const TERMS_SECTIONS = [
  {
    id: 'about',
    title: '1. About Spandan',
    paragraphs: [
      `Spandan is a live classroom polling platform run by the ${TERMS_OPERATOR} ("we", "us"). Teachers run live sessions, Spandan prepares draft questions from the lecture, the teacher approves them, and students answer during class.`,
      'By creating an account and using Spandan, you agree to these terms.'
    ]
  },
  {
    id: 'eligibility',
    title: '2. Eligibility',
    paragraphs: [
      'You must be 18 years of age or older to use Spandan. By accepting these terms you declare that you are 18 or older.'
    ]
  },
  {
    id: 'accounts',
    title: '3. Your account',
    paragraphs: [
      'Give accurate details and use one account per person. Do not share your login, use another person\'s account, or sign in to more than one account to answer polls. Teacher accounts are activated only after an administrator approves them. You are responsible for all activity under your account.'
    ]
  },
  {
    id: 'acceptable-use',
    title: '4. Acceptable use',
    paragraphs: ['You agree not to:'],
    bullets: [
      'Answer on behalf of another person, or share live poll answers with others during a session.',
      'Use scripts, bots or other automated tools to join rooms or submit responses.',
      'Try to access accounts, rooms or data that are not yours, or interfere with the service.',
      'Post abusive, unlawful or misleading content.'
    ],
    after: ['We may suspend or remove accounts that break these rules.']
  },
  {
    id: 'teachers',
    title: '5. Teachers and classroom content',
    paragraphs: [
      'When a teacher runs a session, the lecture audio is transcribed so that questions can be prepared from it. Teachers confirm that they have the right to use their lecture material on Spandan and that their students know the session uses Spandan. Teachers review every question before it is shown and remain responsible for the questions they publish.'
    ]
  },
  {
    id: 'data',
    title: '6. What we collect',
    bullets: [
      'Account details: your name, email address and role. If you use "Continue with Google", we receive your name, email address and a Google account identifier.',
      'Profile details you choose to add.',
      'Session data: the rooms you join, your answers, response times and scores.',
      'For teachers: lecture transcripts and the questions prepared and approved in their sessions.',
      'Technical data needed to run the service securely, such as sign-in times.'
    ],
    after: ['We do not sell your data.']
  },
  {
    id: 'use',
    title: '7. How we use your data',
    paragraphs: [
      'We use your data to run sessions, show results and leaderboards, give teachers analytics on class engagement, keep the service secure, and improve Spandan.',
      'To prepare draft questions, lecture text is sent to an external AI service, which may process it outside India. Only lecture text is sent, before any names in it are removed; no account details or answers are sent.',
      'Your Spandan results may also be shown to you on the dashboard of a partner learning platform you are enrolled on.'
    ]
  },
  {
    id: 'research',
    title: '8. Research',
    highlight: true,
    paragraphs: [
      `Spandan sessions are part of an educational research study at the ${TERMS_OPERATOR}, approved by the Institutional Ethics Committee (Humans), IIT Ropar. Data from Spandan sessions (your answers, response times, scores and participation, and the session transcripts and questions) may be used in this research, only after a lab staff member outside the research team has removed names and email addresses and replaced them with codes.`,
      'Anything published or shared is anonymised or aggregated so that no individual can be identified.',
      'You can opt out of research use at any time until 30 days after your programme or course ends, with the Research opt-out button in the sidebar. Opting out does not affect your use of Spandan, your marks, points or certificates. Details are in the research notice.'
    ]
  },
  {
    id: 'visibility',
    title: '9. Who can see your activity',
    paragraphs: [
      'Your teacher can see your responses and scores in their rooms. Leaderboards may show your name, or an anonymised label, to others in the same room.'
    ]
  },
  {
    id: 'retention',
    title: '10. Data retention and your rights',
    paragraphs: [
      'We keep your account data for as long as you use Spandan and the lab runs the platform. When the platform is closed, your personal data is deleted.',
      `You may ask to access, correct or delete your data by writing to ${TERMS_CONTACT_EMAIL}. To stop research use of your data, use the Research opt-out button (Section 8).`
    ]
  },
  {
    id: 'availability',
    title: '11. Availability',
    paragraphs: [
      'Spandan is provided "as is" for educational use. We work to keep it reliable but cannot guarantee uninterrupted service, and we are not liable for lost responses or downtime.'
    ]
  },
  {
    id: 'changes',
    title: '12. Changes to these terms',
    paragraphs: [
      'If these terms change in any important way, you will be asked to accept them again the next time you use Spandan.'
    ]
  },
  {
    id: 'contact',
    title: '13. Contact and grievances',
    paragraphs: [
      `For questions, requests or complaints about Spandan or your data, contact the VLED team at ${TERMS_CONTACT_EMAIL}. For your rights as a research participant, you may contact the Institutional Ethics Committee (Humans), IIT Ropar, at comm.inst.ethics@iitrpr.ac.in. These terms are governed by the laws of India.`
    ]
  }
]
