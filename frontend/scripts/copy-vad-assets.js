import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Resolve frontend directory and workspace root directory
const frontendDir = path.resolve(__dirname, '..')
const rootDir = path.resolve(frontendDir, '..')
const targetDir = path.join(frontendDir, 'public', 'vad')

console.log('[VAD Asset Copy] Target directory:', targetDir)

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true })
} else {
  // Clean target directory to avoid stale or mismatched version artifacts
  const existingFiles = fs.readdirSync(targetDir)
  for (const file of existingFiles) {
    fs.unlinkSync(path.join(targetDir, file))
  }
}

// Candidate search locations for package dist directories (supporting monorepo hoisting)
const candidateVadDirs = [
  path.join(rootDir, 'node_modules', '@ricky0123', 'vad-web', 'dist'),
  path.join(frontendDir, 'node_modules', '@ricky0123', 'vad-web', 'dist')
]

const candidateOnnxDirs = [
  // 1. vad-web's own onnxruntime-web dist (contains matched .mjs and .wasm files)
  path.join(rootDir, 'node_modules', '@ricky0123', 'vad-web', 'node_modules', 'onnxruntime-web', 'dist'),
  path.join(frontendDir, 'node_modules', '@ricky0123', 'vad-web', 'node_modules', 'onnxruntime-web', 'dist'),
  // 2. root or frontend hoisted onnxruntime-web (fallback)
  path.join(rootDir, 'node_modules', 'onnxruntime-web', 'dist'),
  path.join(frontendDir, 'node_modules', 'onnxruntime-web', 'dist')
]

const copiedFiles = new Set()

function copyMatchingFiles(sourceDir, extensions) {
  if (!fs.existsSync(sourceDir)) {
    return 0
  }

  console.log(`[VAD Asset Copy] Syncing from ${sourceDir}`)
  const files = fs.readdirSync(sourceDir)
  let count = 0

  for (const file of files) {
    const ext = path.extname(file)
    if (extensions.includes(ext) || file.endsWith('.worker.js') || file.includes('bundle')) {
      const srcPath = path.join(sourceDir, file)
      const stat = fs.statSync(srcPath)
      if (stat.isFile()) {
        const destPath = path.join(targetDir, file)
        fs.copyFileSync(srcPath, destPath)
        copiedFiles.add(file)
        count++
      }
    }
  }
  return count
}

// 1. Copy Silero models and worklet from @ricky0123/vad-web/dist (use first valid location)
for (const vadDir of candidateVadDirs) {
  if (fs.existsSync(vadDir)) {
    copyMatchingFiles(vadDir, ['.onnx', '.js'])
    break
  }
}

// 2. Copy matching ONNX runtime .mjs, .wasm, .js loaders (use first valid location to prevent version mismatch)
for (const onnxDir of candidateOnnxDirs) {
  if (fs.existsSync(onnxDir)) {
    copyMatchingFiles(onnxDir, ['.wasm', '.mjs', '.js'])
    break
  }
}

console.log(`[VAD Asset Copy] Successfully synced ${copiedFiles.size} assets to public/vad:`)
Array.from(copiedFiles).sort().forEach(f => console.log(`  - ${f}`))
