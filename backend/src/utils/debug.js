// Debug logger: no-ops in production, console.log everywhere else.
//
// Use this for HIGH-FREQUENCY / hot-path debug lines that must NOT run in production. At classroom
// scale a single poll transition fires the /responses read path hundreds of times, each emitting
// ~30+ log lines; console.log is a synchronous write, so in aggregate that spam starves the event
// loop and delays the next poll's broadcast. Gating it on NODE_ENV keeps the lines available for
// local debugging (NODE_ENV != 'production') while eliminating the cost in prod.
//
// Errors and warnings should keep using console.error / console.warn DIRECTLY so they always
// surface — including in production. Only wrap noisy, non-actionable debug lines with debug().
export const debug = process.env.NODE_ENV === 'production'
  ? () => {}
  : (...args) => console.log(...args)
