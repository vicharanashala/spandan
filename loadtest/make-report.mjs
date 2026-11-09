#!/usr/bin/env node
// Build the offline HTML report for a saved run.
//
//   npm run report                                   # newest results/*.json -> same name .html
//   npm run report -- results/2026-11-06T02-15-30Z.json
//   npm run report -- results/<file>.json --out report.html
//
// Entry point only: it always runs. The reusable functions live in lib/reportFile.mjs (import those,
// not this file). There is deliberately no "am I the main module?" path comparison, which silently
// did nothing when launched through a symlink or a Windows directory junction.
import { buildReport, newestResult } from './lib/reportFile.mjs'

async function main(argv) {
  let input = null, out = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Usage: npm run report -- [results/<file>.json] [--out <file>.html]\nWithout a file, uses the newest result in results/.')
      return 0
    }
    if (argv[i] === '--out') { out = argv[++i]; if (!out) throw new Error('--out needs a file name.'); continue }
    if (argv[i].startsWith('--')) throw new Error(`Unknown option ${argv[i]}.`)
    input = argv[i]
  }
  input = input || await newestResult()
  if (!input) throw new Error('No results/*.json found. Run a load test first (npm start).')
  const file = await buildReport(input, out || undefined)
  console.log(`Report written: ${file}\nOpen it in a browser (it works offline; no network access needed).`)
  return 0
}

main(process.argv.slice(2))
  .then((code) => { process.exitCode = code })
  .catch((err) => { console.error(err.message); process.exitCode = 2 })
