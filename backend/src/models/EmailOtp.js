import mongoose from 'mongoose'

// One in-flight registration verification per email. Stores ONLY the hash of the 6-digit code — never
// the code itself, and never the user's name/password (the client re-submits those at the verify step,
// so nothing sensitive sits at rest here). The doc auto-expires via a TTL index, and tracks failed
// verify attempts + resend count to throttle OTP brute-force and email-bombing.
const emailOtpSchema = new mongoose.Schema({
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  otpHash:    { type: String, required: true },
  expiresAt:  { type: Date,   required: true },   // TTL index below removes the doc at this time
  attempts:   { type: Number, default: 0 },       // failed verify attempts (cap -> invalidate)
  lastSentAt: { type: Date,   default: Date.now },// resend cooldown
  sendCount:  { type: Number, default: 0 }        // total sends for this email in the window (cap -> block)
}, { timestamps: true })

// Mongo TTL monitor deletes the doc once expiresAt passes (expireAfterSeconds:0 = expire AT the date).
emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.model('EmailOtp', emailOtpSchema)
