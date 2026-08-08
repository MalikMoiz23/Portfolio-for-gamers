/* ============================================================================
 * PROCEDURAL AUDIO
 * ----------------------------------------------------------------------------
 * No audio files. Everything is synthesised with WebAudio: the sub-bass under
 * the building, ventilation hiss, an evolving pad, distant structural knocks
 * and metal groans, whispers you are not quite sure you heard, footsteps on wet
 * concrete at walking and running pace, breathing when you run, fluorescent
 * ticks, and doors that open like they weigh eighty kilos.
 *
 * Everything is fed through a procedurally generated convolution reverb, which
 * is what actually makes it sound like a corridor rather than a set of beeps.
 *
 * Browsers refuse to start audio without a gesture, so nothing exists until
 * start() is called from a click.
 * ========================================================================== */

let ctx = null
let master = null // everything lands here
let dry = null // straight to the limiter
let wet = null // via the convolver
let limiter = null
let noiseBuf = null
let running = false
let bedBuilt = false

/* Brown-ish noise: integrate white and leak. Heavier and less hissy than white,
 * which is what most of these sounds actually need. */
function noiseBuffer() {
  if (noiseBuf) return noiseBuf
  const len = ctx.sampleRate * 3
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    d[i] = last * 3.5
  }
  return noiseBuf
}

/* A corridor impulse response: a few discrete early reflections off the walls,
 * then an exponentially decaying noise tail. */
function impulse(seconds = 2.4, decay = 3.0) {
  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = ctx.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const t = i / len
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay)
    }
    // early reflections — the parallel walls of a narrow corridor
    for (const [ms, amp] of [
      [11, 0.5],
      [19, 0.38],
      [31, 0.3],
      [47, 0.22],
      [67, 0.16],
      [96, 0.1],
    ]) {
      const i = Math.floor((ms / 1000) * rate) + (ch ? 37 : 0)
      if (i < len) d[i] += amp * (Math.random() > 0.5 ? 1 : -1)
    }
  }
  return buf
}

const now = () => ctx.currentTime

export function isRunning() {
  return running
}

export function start() {
  if (running) return
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  if (!ctx) {
    ctx = new AC()

    // a limiter on the end, so the bed can sit loud without anything clipping
    limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -6
    limiter.knee.value = 4
    limiter.ratio.value = 12
    limiter.attack.value = 0.003
    limiter.release.value = 0.22

    master = ctx.createGain()
    master.gain.value = 0
    master.connect(limiter)
    limiter.connect(ctx.destination)

    dry = ctx.createGain()
    dry.gain.value = 1
    dry.connect(master)

    const convolver = ctx.createConvolver()
    convolver.buffer = impulse()
    wet = ctx.createGain()
    wet.gain.value = 0.34
    wet.connect(convolver)
    convolver.connect(master)
  }
  ctx.resume()
  running = true
  master.gain.cancelScheduledValues(now())
  master.gain.setTargetAtTime(1.6, now(), 1.4)
  if (!bedBuilt) {
    buildBed()
    bedBuilt = true
  }
}

export function stop() {
  if (!ctx || !running) return
  running = false
  master.gain.cancelScheduledValues(now())
  master.gain.setTargetAtTime(0, now(), 0.4)
}

export function toggle() {
  if (running) stop()
  else start()
  return running
}

/* Route a node to both the direct path and the reverb, with a per-sound
 * balance. Close, dry things (footsteps) send little; big things (doors) send
 * a lot, which is what makes them sound like they are in a large space. */
function out(node, send = 0.25) {
  node.connect(dry)
  const s = ctx.createGain()
  s.gain.value = send
  node.connect(s)
  s.connect(wet)
}

/* ---- the permanent bed --------------------------------------------------- */

function buildBed() {
  /* sub drone — the building itself */
  const droneOut = ctx.createGain()
  droneOut.gain.value = 0.75
  out(droneOut, 0.18)

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 190
  lp.Q.value = 5
  lp.connect(droneOut)

  for (const [freq, gain, type] of [
    [36.7, 0.6, 'sine'],
    [37.9, 0.5, 'sine'],
    [55.0, 0.2, 'triangle'],
    [73.4, 0.09, 'sawtooth'],
  ]) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = gain
    o.connect(g).connect(lp)
    o.start()
  }

  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.055
  const lfoAmt = ctx.createGain()
  lfoAmt.gain.value = 0.3
  lfo.connect(lfoAmt).connect(droneOut.gain)
  lfo.start()

  /* a dissonant pad, drifting — the thing that makes it feel wrong rather than
   * merely dark. Minor second and tritone against the root. */
  const padOut = ctx.createGain()
  padOut.gain.value = 0.07
  out(padOut, 0.75)
  const padFilter = ctx.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.value = 420
  padFilter.Q.value = 3
  padFilter.connect(padOut)
  for (const [freq, det] of [
    [110, 0],
    [116.5, 7],
    [155.6, -5],
    [220, 3],
  ]) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = freq
    o.detune.value = det
    const g = ctx.createGain()
    g.gain.value = 0.25
    o.connect(g).connect(padFilter)
    o.start()
  }
  // slow filter sweep so the pad breathes instead of sitting still
  const sweep = ctx.createOscillator()
  sweep.type = 'sine'
  sweep.frequency.value = 0.021
  const sweepAmt = ctx.createGain()
  sweepAmt.gain.value = 260
  sweep.connect(sweepAmt).connect(padFilter.frequency)
  sweep.start()

  /* ventilation */
  const air = ctx.createBufferSource()
  air.buffer = noiseBuffer()
  air.loop = true
  const airFilter = ctx.createBiquadFilter()
  airFilter.type = 'bandpass'
  airFilter.frequency.value = 620
  airFilter.Q.value = 0.7
  const airGain = ctx.createGain()
  airGain.gain.value = 0.1
  air.connect(airFilter).connect(airGain)
  out(airGain, 0.3)
  air.start()

  /* a heartbeat, barely there, slightly too slow to be yours */
  const beat = () => {
    if (running) {
      thump(52, 0.1, 0.34)
      setTimeout(() => running && thump(46, 0.075, 0.26), 300)
    }
    setTimeout(beat, 1500 + Math.random() * 500)
  }
  setTimeout(beat, 4000)

  scheduleRandom(knock, 9000, 24000)
  scheduleRandom(groan, 16000, 40000)
  scheduleRandom(whisper, 21000, 52000)
}

function scheduleRandom(fn, min, max) {
  const go = () => {
    setTimeout(() => {
      if (running) fn()
      go()
    }, min + Math.random() * (max - min))
  }
  go()
}

function thump(freq, dur, amp) {
  const t = now()
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(freq, t)
  o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(amp, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 3)
  o.connect(g)
  out(g, 0.2)
  o.start(t)
  o.stop(t + dur * 3.2)
}

/* Something heavy shifting, a long way off. */
function knock() {
  const t = now()
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(96, t)
  o.frequency.exponentialRampToValueAtTime(38, t + 0.24)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.45, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
  o.connect(g)
  out(g, 0.85)
  o.start(t)
  o.stop(t + 0.7)
}

/* Metal under load, somewhere in the structure. */
function groan() {
  const t = now()
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  const base = 60 + Math.random() * 50
  o.frequency.setValueAtTime(base, t)
  o.frequency.linearRampToValueAtTime(base * 1.35, t + 2.2)
  o.frequency.linearRampToValueAtTime(base * 0.9, t + 3.6)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 300
  bp.Q.value = 11
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.16, t + 0.9)
  g.gain.linearRampToValueAtTime(0.11, t + 2.6)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8)
  o.connect(bp).connect(g)
  out(g, 0.9)
  o.start(t)
  o.stop(t + 4)
}

/* Not words. Just enough formant movement that your ear tries to make them. */
function whisper() {
  const t = now()
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer()
  src.playbackRate.value = 0.7 + Math.random() * 0.5
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 7
  bp.frequency.setValueAtTime(700, t)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  // syllables
  const n = 4 + Math.floor(Math.random() * 4)
  let tt = t
  for (let i = 0; i < n; i++) {
    const dur = 0.09 + Math.random() * 0.13
    bp.frequency.setValueAtTime(520 + Math.random() * 1500, tt)
    g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, tt + dur * 0.4)
    g.gain.linearRampToValueAtTime(0.004, tt + dur)
    tt += dur + Math.random() * 0.05
  }
  g.gain.linearRampToValueAtTime(0.0001, tt + 0.2)
  src.connect(bp).connect(g)
  out(g, 1.0)
  src.start(t, Math.random() * 2)
  src.stop(tt + 0.3)
}

/* ---- footsteps ----------------------------------------------------------- */

/* One boot on wet concrete. Running is not just faster — it is a harder heel
 * strike, more scuff, and more of the room. */
export function footstep(velocity = 1, sprint = false) {
  if (!running || !ctx) return
  const t = now()
  const v = Math.min(1, Math.max(0.2, velocity))
  const power = sprint ? 1.55 : 1

  // heel scuff
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer()
  src.playbackRate.value = (sprint ? 1.1 : 0.8) + Math.random() * 0.5
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = (sprint ? 1300 : 900) + Math.random() * 700
  bp.Q.value = sprint ? 0.8 : 1.1
  const g = ctx.createGain()
  const dur = sprint ? 0.1 : 0.14
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.34 * v * power, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(bp).connect(g)
  out(g, sprint ? 0.3 : 0.2)
  src.start(t, Math.random() * 2)
  src.stop(t + dur + 0.06)

  // body of the step
  const o = ctx.createOscillator()
  o.type = 'sine'
  const f0 = sprint ? 190 : 150
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(sprint ? 55 : 62, t + 0.1)
  const og = ctx.createGain()
  og.gain.setValueAtTime(0.0001, t)
  og.gain.exponentialRampToValueAtTime(0.3 * v * power, t + 0.007)
  og.gain.exponentialRampToValueAtTime(0.0001, t + (sprint ? 0.2 : 0.17))
  o.connect(og)
  out(og, 0.25)
  o.start(t)
  o.stop(t + 0.24)

  // running adds a slap of grit being kicked forward
  if (sprint) {
    const gr = ctx.createBufferSource()
    gr.buffer = noiseBuffer()
    gr.playbackRate.value = 2.2
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3200
    const gg = ctx.createGain()
    gg.gain.setValueAtTime(0.1 * v, t + 0.02)
    gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    gr.connect(hp).connect(gg)
    out(gg, 0.35)
    gr.start(t + 0.02, Math.random())
    gr.stop(t + 0.14)
  }
}

/* In and out, through the teeth. Called on alternate strides while sprinting. */
export function breath(inhale = true) {
  if (!running || !ctx) return
  const t = now()
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer()
  src.playbackRate.value = 1.4
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(inhale ? 700 : 480, t)
  bp.frequency.linearRampToValueAtTime(inhale ? 1250 : 320, t + 0.32)
  bp.Q.value = 1.4
  const g = ctx.createGain()
  const peak = inhale ? 0.13 : 0.1
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + (inhale ? 0.14 : 0.06))
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38)
  src.connect(bp).connect(g)
  out(g, 0.3)
  src.start(t, Math.random() * 2)
  src.stop(t + 0.42)
}

/* ---- doors --------------------------------------------------------------- */

/* Deliberately the loudest thing in the build: a latch letting go, eighty kilos
 * of steel swinging on dry hinges, and the whole corridor answering. */
export function doorOpen() {
  if (!running || !ctx) return
  const t = now()

  // latch mechanism — bright, mechanical, immediate
  for (const [off, freq, amp] of [
    [0, 2600, 0.5],
    [0.035, 1800, 0.36],
    [0.07, 3400, 0.28],
  ]) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer()
    src.playbackRate.value = 2.6
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = freq
    bp.Q.value = 3
    const g = ctx.createGain()
    g.gain.setValueAtTime(amp, t + off)
    g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.06)
    src.connect(bp).connect(g)
    out(g, 0.6)
    src.start(t + off, Math.random())
    src.stop(t + off + 0.09)
  }

  // the hinge — stuttered pitch is what reads as metal grinding on metal
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1400
  bp.Q.value = 8
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t + 0.06)
  g.gain.linearRampToValueAtTime(0.3, t + 0.3)
  g.gain.linearRampToValueAtTime(0.2, t + 1.1)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
  for (let i = 0; i < 34; i++) {
    const tt = t + 0.06 + i * 0.045
    o.frequency.setValueAtTime(110 + Math.random() * 320 + i * 11, tt)
  }
  o.connect(bp).connect(g)
  out(g, 0.85)
  o.start(t)
  o.stop(t + 1.7)

  // the leaf hitting its stop, and the corridor behind it
  const bt = t + 1.25
  const th = ctx.createOscillator()
  th.type = 'sine'
  th.frequency.setValueAtTime(85, bt)
  th.frequency.exponentialRampToValueAtTime(28, bt + 0.5)
  const tg = ctx.createGain()
  tg.gain.setValueAtTime(0.0001, bt)
  tg.gain.exponentialRampToValueAtTime(0.9, bt + 0.012)
  tg.gain.exponentialRampToValueAtTime(0.0001, bt + 0.9)
  th.connect(tg)
  out(tg, 1.0)
  th.start(bt)
  th.stop(bt + 1)

  const cl = ctx.createBufferSource()
  cl.buffer = noiseBuffer()
  cl.playbackRate.value = 1.1
  const clf = ctx.createBiquadFilter()
  clf.type = 'lowpass'
  clf.frequency.value = 1800
  const clg = ctx.createGain()
  clg.gain.setValueAtTime(0.55, bt)
  clg.gain.exponentialRampToValueAtTime(0.0001, bt + 0.4)
  cl.connect(clf).connect(clg)
  out(clg, 1.0)
  cl.start(bt, Math.random())
  cl.stop(bt + 0.5)
}

/* Pulled shut behind you. */
export function doorClose() {
  if (!running || !ctx) return
  const t = now()
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(110, t)
  o.frequency.exponentialRampToValueAtTime(34, t + 0.35)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.7, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
  o.connect(g)
  out(g, 0.9)
  o.start(t)
  o.stop(t + 0.8)
}

/* ---- incidentals --------------------------------------------------------- */

/* Dry electrical tick when a failing tube strikes. */
export function tick() {
  if (!running || !ctx) return
  const t = now()
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer()
  src.playbackRate.value = 2.4
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 2600
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.2, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
  src.connect(hp).connect(g)
  out(g, 0.45)
  src.start(t, Math.random())
  src.stop(t + 0.07)
}

/* Low swell when you cross a threshold. */
export function stinger() {
  if (!running || !ctx) return
  const t = now()
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(30, t)
  o.frequency.exponentialRampToValueAtTime(19, t + 2.4)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(700, t)
  lp.frequency.exponentialRampToValueAtTime(90, t + 2.4)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.5, t + 0.4)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
  o.connect(lp).connect(g)
  out(g, 0.7)
  o.start(t)
  o.stop(t + 2.7)
}
