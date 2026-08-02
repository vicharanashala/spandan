// Print the API's access policy, one line per route: `npm run routes`.
//
// The same inventory the boot guard checks and the route access matrix enumerates, in a form a
// human can read in a code review or hand to someone asking "who can call what?". It imports the
// routers without starting a server, so it is safe to run anywhere.
import 'dotenv/config'
import { API_ROUTES } from '../apiRoutes.js'
import { listRoutes } from '../middleware/routePolicy.js'

const routes = listRoutes(API_ROUTES)
const width = Math.max(...routes.map((r) => r.path.length))

for (const { method, path, policies } of routes) {
  console.log(`${method.padEnd(6)} ${path.padEnd(width)}  ${policies.join(' + ') || '** NO POLICY **'}`)
}

console.log(`\n${routes.length} routes`)
process.exit(0)
