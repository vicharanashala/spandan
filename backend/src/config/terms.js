// Current version of the Spandan Terms of Use and Privacy Notice (frontend: src/content/terms.js).
// Every user must have accepted THIS version: bump it on any material change to the terms and every
// existing account is asked to accept again on its next request (see middleware/auth.js). Keep it in
// sync with the frontend copy; a test asserts the two match.
export const TERMS_VERSION = '1.0'

export const hasAcceptedCurrentTerms = (user) => !!user && user.termsVersion === TERMS_VERSION
