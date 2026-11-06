#!/usr/bin/env node
// Build the offline HTML report for a saved run.
//
//   npm run report                                   # newest results/*.json -> same name .html
//   npm run report -- results/2026-11-06T02-15-30Z.json
//   npm run report -- results/<file>.json --out report.html
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { renderHtmlReport } from './lib/htmlReport.mjs'

const RESULTS_DIR = fileURLToPath(new URL('./results/', import.meta.url))

export async function newestResult(dir = RESULTS_DIR) {
  const files = (await readdir(dir).catch(() => [])).filter(f => f.endsWith('.json')).sort()
  return files.length ? path.join(dir, files[files.length - 1]) : null
}

export const htmlPathFor = (jsonPath) => jsonPath.replace(/\.json$/i, '') + '.html'

/** Read a saved result JSON and write its HTML report. Returns the output path. */
export async function buildReport(jsonPath, outPath = htmlPathFor(jsonPath)) {
  let result
  try {
    result = JSON.parse(await readFile(jsonPath, 'utf8'))
  } catch (err) {
    throw new Error(`Cannot read ${jsonPath} as a result file (${err.message}).`)
  }
  if (result?.tool !== 'spandan-loadtest') throw new Error(`${jsonPath} is not a spandan-loadtest result file.`)
  await writeFile(outPath, renderHtmlReport(result))
  return outPath
}

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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => { process.exitCode = code })
    .catch((err) => { console.error(err.message); process.exitCode = 2 })
}
