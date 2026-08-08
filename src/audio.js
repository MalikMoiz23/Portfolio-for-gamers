/* ============================================================================
 * PROCEDURAL AUDIO
 * ----------------------------------------------------------------------------
 * No audio files. Everything is synthesised with WebAudio: the sub-bass drone
 * under the building, the air-handling hiss, footsteps on concrete, the fluor-
 * escent buzz, door hinges and the stinger when a door opens.
 *
 * Browsers refuse to start audio without a gesture, so nothing is created
 * until start() is called from a click.
 * ========================================================================== */

let ctx = null
let master = null
let noiseBuf = null
let drone = null
let running = false

function noiseBuffer() {
  if (noiseBuf) return noiseBuf
  const len = ctx.sampleRate * 2
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1
    // brown-ish: integrate and leak, gives a heavier, less hissy bed
    last = (last + 0.02 * white) / 1.02
    d[i] = last * 3.5
  }
  return noiseBuf
}

function now() {
  return ctx.currentTime
}

export function isRunning() {
  return running
}

export function start() {
  if (running) return
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  if (!ctx) {
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
  }
  ctx.resume()
  running = true
  master.gain.cancelScheduledValues(now())
  master.gain.setTargetAtTime(0.85, now(), 1.2)
  if (!drone) buildBed()
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

/* The permanent bed: a detuned sub drone, a slow breathing filter, and the
 * hiss of ventilation that never quite switches off. */
function buildBed() {
  drone = ctx.createGain()
  drone.gain.value = 0.5
  drone.connect(master)

  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 180
  lp.Q.value = 6
  lp.connect(drone)

  for (const [freq, gain, type] of [
    [36.7, 0.5, 'sine'],
    [37.9, 0.42, 'sine'],
    [55.0, 0.16, 'triangle'],
    [73.4, 0.07, 'sawtooth'],
  ]) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = gain
    o.connect(g).connect(lp)
    o.start()
  }

  // very slow amplitude swell — the building breathing
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.055
  const lfoAmt = ctx.createGain()
  lfoAmt.gain.value = 0.22
  lfo.connect(lfoAmt).connect(drone.gain)
  lfo.start()

  // ventilation hiss
  const air = ctx.createBufferSource()
  air.buffer = noiseBuffer()
  air.loop = true
  const airFilter = ctx.createBiquadFilter()
  airFilter.type = 'bandpass'
  airFilter.frequency.value = 620
  airFilter.Q.value = 0.7
  const airGain = ctx.createGain()
  airGain.gain.value = 0.05
  air.connect(airFilter).connect(airGain).connect(master)
  air.start()

  // the occasional distant structural knock
  scheduleKnock()
}

function scheduleKnock() {
  if (!ctx) return
  const wait = 9000 + Math.random() * 26000
  setTimeout(() => {
    if (running) knock()
    scheduleKnock()
  }, wait)
}

function knock() {
  const t = now()
  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(90, t)
  o.frequency.exponentialRampToValueAtTime(38, t + 0.22)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + 0.55)
}

/* One boot hitting wet concrete: a filtered noise scuff over a soft thump. */
export function footstep(velocity = 1) {
  if (!running || !ctx) return
  const t = now()
  const v = Math.min(1, Math.max(0.15, velocity))

  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer()
  src.playbackRate.value = 0.8 + Math.random() * 0.5
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 900 + Math.random() * 700
  bp.Q.value = 1.1
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13)
  src.connect(bp).connect(g).connect(master)
  src.start(t, Math.random() * 1.5)
  src.stop(t + 0.2)

  const o = ctx.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(150, t)
  o.frequency.exponentialRampToValueAtTime(62, t + 0.1)
  const og = ctx.createGain()
  og.gain.setValueAtTime(0.0001, t)
  og.gain.exponentialRampToValueAtTime(0.1 * v, t + 0.008)
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.17)
  o.connect(og).connect(master)
  o.start(t)
  o.stop(t + 0.2)
}

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
  g.gain.setValueAtTime(0.09, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045)
  src.connect(hp).connect(g).connect(master)
  src.start(t, Math.random())
  src.stop(t + 0.06)
}

/* Hinges giving way, then the door hitting its stop. */
export function creak() {
  if (!running || !ctx) return
  const t = now()
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(150, t)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1500
  bp.Q.value = 9
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.05, t + 0.15)
  g.gain.linearRampToValueAtTime(0.035, t + 0.9)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3)
  // stuttering pitch is what makes it read as metal-on-metal
  for (let i = 0; i < 26; i++) {
    const tt = t + i * 0.05
    o.frequency.setValueAtTime(120 + Math.random() * 260 + i * 9, tt)
  }
  o.connect(bp).connect(g).connect(master)
  o.start(t)
  o.stop(t + 1.4)

  const th = ctx.createOscillator()
  th.type = 'sine'
  th.frequency.setValueAtTime(70, t + 1.15)
  th.frequency.exponentialRampToValueAtTime(34, t + 1.5)
  const tg = ctx.createGain()
  tg.gain.setValueAtTime(0.0001, t + 1.15)
  tg.gain.exponentialRampToValueAtTime(0.2, t + 1.17)
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 1.7)
  th.connect(tg).connect(master)
  th.start(t + 1.15)
  th.stop(t + 1.75)
}

/* Low swell when you cross a threshold. */
export function stinger() {
  if (!running || !ctx) return
  const t = now()
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(28, t)
  o.frequency.exponentialRampToValueAtTime(19, t + 2.2)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(600, t)
  lp.frequency.exponentialRampToValueAtTime(90, t + 2.2)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.3, t + 0.35)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4)
  o.connect(lp).connect(g).connect(master)
  o.start(t)
  o.stop(t + 2.5)
}
