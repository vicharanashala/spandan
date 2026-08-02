// Deny-by-default route policy.
//
// Every access-control bug found in this codebase so far has the same shape: a handler that simply
// did not say who may call it. /api/transcription/* shipped with no authentication for months, not
// because anyone decided it should be public, but because nothing required a decision. Reviewing
// harder does not fix that — an omission looks exactly like a file nobody thought about.
//
// So a route must now DECLARE its access policy, and the server refuses to start if one does not.
// A policy is declared by using a marked middleware: authenticate, authorize(), roomAccess(),
// requireResearchKey, or publicRoute for the handful of endpoints that are open by design. The
// marker is a symbol on the middleware function, so declaring a policy and enforcing it are the
// same act — there is no separate manifest to forget to update.
//
// WHAT THIS CATCHES: a route with no access control at all. That is the failure mode that has
// actually happened, and it becomes a failed deploy instead of a silent hole.
//
// WHAT THIS DOES NOT CATCH: a route that declares the WRONG policy — `authenticate` where
// `roomAccess('owner')` was meant, which is how GET /api/responses leaked a whole room. No static
// check can know the intent. That is the job of the route access matrix in
// __tests__/routeAccessMatrix.test.js, which pins the real answer for every route against every
// kind of caller, and fails when a new route is added without an entry.

const POLICY = Symbol('routePolicy')

/**
 * Mark a middleware as declaring an access policy. The description is only ever shown to a human
 * (boot errors, the route inventory), so make it read like the rule it enforces: 'authenticated',
 * 'role:teacher', 'room:owner'.
 */
export const declarePolicy = (middleware, description) =>
  Object.defineProperty(middleware, POLICY, { value: description, enumerable: false })

export const policyOf = (middleware) => (typeof middleware === 'function' ? middleware[POLICY] : undefined)

/**
 * Explicit opt-out, for endpoints that are unauthenticated by design — login, registration, the
 * health check. It does nothing at runtime; its entire purpose is to make "this is public" a
 * deliberate, greppable statement instead of the absence of one.
 */
export const publicRoute = declarePolicy((req, res, next) => next(), 'public')

/**
 * Flatten a mount table — [[basePath, router], ...] — into one entry per route:
 *   { method, path, policies }
 *
 * Walking the mount table rather than app._router means the paths are the real ones we mounted,
 * with no regex reverse-engineering, and the table cannot drift from what the server serves
 * because index.js mounts from the same array.
 *
 * A router-level `router.use(authenticate)` (how questions.js and responses.js authenticate their
 * whole surface) is treated as covering every route in that router. That is a simplification —
 * Express only applies a `use` to routes registered after it — but every router here puts its
 * router-level policy at the top, and a route registered above it would still have to declare its
 * own policy to pass this check.
 */
export const listRoutes = (mountTable) => {
  const routes = []

  for (const [basePath, router] of mountTable) {
    const routerWide = router.stack
      .filter((layer) => !layer.route && policyOf(layer.handle))
      .map((layer) => policyOf(layer.handle))

    for (const layer of router.stack) {
      if (!layer.route) continue

      const ownPolicies = layer.route.stack.map((h) => policyOf(h.handle)).filter(Boolean)
      const path = `${basePath}${layer.route.path}`.replace(/\/$/, '') || '/'

      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method: method.toUpperCase(), path, policies: [...routerWide, ...ownPolicies] })
      }
    }
  }

  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
}

/**
 * Boot guard. Throws if any route serves without declaring a policy, naming every offender so the
 * fix is obvious from the crash. Called from index.js immediately after mounting — a missing policy
 * is a deploy-time failure, exactly like a missing JWT_SECRET.
 */
export const assertRoutePoliciesDeclared = (mountTable) => {
  const undeclared = listRoutes(mountTable).filter((r) => r.policies.length === 0)

  if (undeclared.length > 0) {
    const list = undeclared.map((r) => `  ${r.method} ${r.path}`).join('\n')
    throw new Error(
      `${undeclared.length} route(s) serve without declaring an access policy:\n${list}\n` +
      'Add authenticate / authorize() / roomAccess(), or publicRoute if it is open by design.'
    )
  }
}
