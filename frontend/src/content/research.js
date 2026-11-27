// Research notice (IEC Form, Annexure B.2). Shown once after sign-in (ResearchNoticeGate) and in the
// research opt-out dialog opened from the sidebar button (Terms of Use, Section 8).
// Keep the wording in step with the IEC form: change it only together with the form.
import { TERMS_CONTACT_EMAIL } from './terms.js'

// tourSeen key used to remember that the notice was shown (same per-user record as the guided tours).
export const RESEARCH_NOTICE_ID = 'research-notice'

export const RESEARCH_NOTICE_TITLE = 'Research on Spandan sessions'

export const RESEARCH_NOTICE_SECTIONS = [
  {
    id: 'about',
    paragraphs: [
      'Spandan sessions are part of a research study by the Vicharanashala Lab for Education Design, IIT Ropar, approved by the Institutional Ethics Committee (Humans), IIT Ropar. The study looks at how live polls are prepared from lectures and how learners answer them.'
    ]
  },
  {
    id: 'used',
    title: 'What is used',
    paragraphs: [
      'Your answers, response times, scores and the sessions you join; for teachers, the lecture transcripts and the questions they approve. To prepare draft questions, lecture text is sent to an external AI service before any names in it are removed; no account details or answers are sent.'
    ]
  },
  {
    id: 'protected',
    title: 'How you are protected',
    paragraphs: [
      'After your programme or course ends, a lab staff member who is not part of the research team removes names and email addresses and replaces them with codes. No list linking codes to people is kept, and the researchers see only the coded data. Results are published only as group totals, and any shared dataset is anonymised.'
    ]
  },
  {
    id: 'choice',
    title: 'Your choice',
    paragraphs: [
      'You can opt out at any time until 30 days after your programme or course ends, with the Research opt-out button in the sidebar. Opting out does not affect your use of Spandan, your marks, points or certificates, and your teacher will not know. After that date the data can no longer be linked to you and cannot be removed.'
    ]
  },
  {
    id: 'contact',
    title: 'Questions',
    paragraphs: [
      `Questions: ${TERMS_CONTACT_EMAIL}. Your rights as a research participant: Institutional Ethics Committee (Humans), IIT Ropar, comm.inst.ethics@iitrpr.ac.in.`
    ]
  }
]
