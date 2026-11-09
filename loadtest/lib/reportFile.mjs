// Read a saved run (results/<timestamp>.json) and write its offline HTML report next to it.
// Used by run.mjs (after each run) and by make-report.mjs (`npm run report`). Kept out of
// make-report.mjs so that file can be a plain entry point that always runs main(): no "am I the
// main module?" path comparison, which fails through a symlink or a Windows junction. Import these
// from here; never import make-report.mjs.
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { renderHtmlReport } from './htmlReport.mjs'

export const RESULTS_DIR = fileURLToPath(new URL('../results/', import.meta.url))

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
