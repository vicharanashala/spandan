// Watches THIS process (the load generator) and the machine, once a second, so the report can
// tell "the server is slow" apart from "my laptop could not keep up generating load".
//
//   processCpu   CPU used by this Node process, as % of ONE core. Node runs the simulator's JS on
//                one thread, so ~100% here means the generator itself is the bottleneck.
//   machineCpu   whole-machine CPU busy %, across all cores. Locally the Spandan server and
//                MongoDB share this machine, so a high value means everything is competing.
//   loopLag      this process's event-loop delay. High lag = timers and socket events are handled
//                late, which inflates every latency the simulator measures.
import os from 'node:os'
import { monitorEventLoopDelay } from 'node:perf_hooks'

const cpuTotals = () => {
  let idle = 0, total = 0
  for (const c of os.cpus()) {
    const t = c.times
    idle += t.idle
    total += t.user + t.nice + t.sys + t.idle + t.irq
  }
  return { idle, total }
}

// Thresholds for the bottleneck warning.
export const GENERATOR_LIMITS = Object.freeze({
  processCpuPct: 85,   // of one core
  machineCpuPct: 90,   // all cores
  loopLagP99Ms: 200,
  sustainedFraction: 0.2 // warn if above a limit for >= 20% of samples
})

export function startMonitor(recorder, { intervalMs = 1000, extraGauges = () => ({}) } = {}) {
  const samples = []
  const loop = monitorEventLoopDelay({ resolution: 20 })
  loop.enable()
  let lastCpu = process.cpuUsage()
  let lastWall = performance.now()
  let lastMachine = cpuTotals()

  const timer = setInterval(() => {
    const wall = performance.now()
    const cpu = process.cpuUsage(lastCpu) // microseconds since last sample
    const elapsedUs = (wall - lastWall) * 1000
    const processCpu = elapsedUs > 0 ? ((cpu.user + cpu.system) / elapsedUs) * 100 : 0
    const m = cpuTotals()
    const dTotal = m.total - lastMachine.total
    const machineCpu = dTotal > 0 ? (1 - (m.idle - lastMachine.idle) / dTotal) * 100 : 0
    const lagP99 = loop.percentile(99) / 1e6
    const rssMb = process.memoryUsage().rss / 1048576
    loop.reset()
    lastCpu = process.cpuUsage()
    lastWall = wall
    lastMachine = m

    const s = {
      processCpu: Math.round(processCpu * 10) / 10,
      machineCpu: Math.round(machineCpu * 10) / 10,
      loopLagP99Ms: Math.round(lagP99 * 10) / 10,
      rssMb: Math.round(rssMb)
    }
    samples.push(s)
    recorder.gauge({ genCpu: s.processCpu, machineCpu: s.machineCpu, genLoopLagMs: s.loopLagP99Ms, ...extraGauges() })
  }, intervalMs)
  timer.unref()

  return {
    stop() {
      clearInterval(timer)
      loop.disable()
      return analyzeGenerator(samples)
    }
  }
}

const peak = (arr, k) => arr.reduce((m, s) => Math.max(m, s[k]), 0)
const avg = (arr, k) => (arr.length ? Math.round((arr.reduce((a, s) => a + s[k], 0) / arr.length) * 10) / 10 : 0)

/** Summarize generator samples and decide whether the local machine may have skewed the results. */
export function analyzeGenerator(samples, limits = GENERATOR_LIMITS) {
  const frac = (pred) => (samples.length ? samples.filter(pred).length / samples.length : 0)
  const warnings = []
  const hotProcess = frac(s => s.processCpu >= limits.processCpuPct)
  const hotMachine = frac(s => s.machineCpu >= limits.machineCpuPct)
  const laggy = frac(s => s.loopLagP99Ms >= limits.loopLagP99Ms)

  if (hotProcess >= limits.sustainedFraction) {
    warnings.push(`The load generator used >=${limits.processCpuPct}% of a CPU core for ${Math.round(hotProcess * 100)}% of the run: it may be the bottleneck, not the server. Reduce --students or run the generator on another machine.`)
  }
  if (hotMachine >= limits.sustainedFraction) {
    warnings.push(`The whole machine was >=${limits.machineCpuPct}% busy for ${Math.round(hotMachine * 100)}% of the run. The server, MongoDB and the generator share this laptop, so latencies are inflated by CPU contention.`)
  }
  if (laggy >= limits.sustainedFraction) {
    warnings.push(`The generator's event loop lagged >=${limits.loopLagP99Ms}ms (p99) for ${Math.round(laggy * 100)}% of the run, so measured latencies include the generator's own delay.`)
  }

  return {
    samples: samples.length,
    cores: os.cpus().length,
    processCpuAvg: avg(samples, 'processCpu'),
    processCpuPeak: peak(samples, 'processCpu'),
    machineCpuAvg: avg(samples, 'machineCpu'),
    machineCpuPeak: peak(samples, 'machineCpu'),
    loopLagP99PeakMs: peak(samples, 'loopLagP99Ms'),
    rssPeakMb: peak(samples, 'rssMb'),
    possibleBottleneck: warnings.length > 0,
    warnings
  }
}
