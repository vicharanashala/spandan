import crypto from 'crypto'
import EmailOtp from '../models/EmailOtp.js'
import { sendRegistrationOtp } from './emailService.js'

// --- Tunables (env-overridable; defaults per the agreed design) ---
const OTP_TTL_MS         = Number(process.env.OTP_TTL_MS)         || 10 * 60 * 1000 // 10 min
const OTP_RESEND_COOLDOWN_MS = Number(process.env.OTP_RESEND_COOLDOWN_MS) || 60 * 1000 // 60 s
const OTP_MAX_SENDS      = Number(process.env.OTP_MAX_SENDS)      || 5   // per email per window
const OTP_MAX_ATTEMPTS   = Number(process.env.OTP_MAX_ATTEMPTS)   || 5   // verify attempts per code

const norm = (e) => (e || '').trim().toLowerCase()
const genOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0') // crypto-random 000000–999999
// Hash at rest, salted by email so a leaked hash can't be reused for another address. A short-lived
// 6-digit code + the 5-attempt cap + TTL make sha256 sufficient (no need for a slow KDF here).
const hashOtp = (email, otp) => crypto.createHash('sha256').update(`${norm(email)}:${otp}`).digest('hex')

const fail = (msg, code) => { const e = new Error(msg); e.code = code; return e }

// Step 1: generate + email a code, enforcing resend cooldown and per-email send cap.
export async function requestRegistrationOtp(email, name) {
  const e = norm(email)
  const now = Date.now()
  const existing = await EmailOtp.findOne({ email: e })
  if (existing) {
    if (existing.lastSentAt && now - existing.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (now - existing.lastSentAt.getTime())) / 1000)
      throw fail(`Please wait ${wait}s before requesting another code.`, 'COOLDOWN')
    }
    if (existing.sendCount >= OTP_MAX_SENDS) {
      throw fail('Too many codes requested for this email. Please try again later.', 'SEND_CAP')
    }
  }
  const otp = genOtp()
  await EmailOtp.findOneAndUpdate(
    { email: e },
    {
      $set: { otpHash: hashOtp(e, otp), expiresAt: new Date(now + OTP_TTL_MS), attempts: 0, lastSentAt: new Date(now) },
      $inc: { sendCount: 1 },
      $setOnInsert: { email: e }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  await sendRegistrationOtp(e, name, otp) // throws if the email fails → route returns 500
  return { expiresInSec: Math.round(OTP_TTL_MS / 1000) }
}

// Step 2: verify a code. Throws (with .code) on invalid/expired/too-many-attempts; deletes the doc on
// success (single use) and when attempts are exhausted.
export async function verifyRegistrationOtp(email, otp) {
  const e = norm(email)
  const doc = await EmailOtp.findOne({ email: e })
  if (!doc || doc.expiresAt.getTime() < Date.now()) {
    throw fail('Your code has expired or was not found. Please request a new one.', 'INVALID')
  }
  if (doc.attempts >= OTP_MAX_ATTEMPTS) {
    await EmailOtp.deleteOne({ email: e })
    throw fail('Too many incorrect attempts. Please request a new code.', 'ATTEMPTS')
  }
  if (doc.otpHash !== hashOtp(e, String(otp))) {
    await EmailOtp.updateOne({ email: e }, { $inc: { attempts: 1 } })
    const left = OTP_MAX_ATTEMPTS - (doc.attempts + 1)
    throw fail(left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code.', 'MISMATCH')
  }
  await EmailOtp.deleteOne({ email: e }) // single-use
  return true
}
