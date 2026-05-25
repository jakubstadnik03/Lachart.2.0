/**
 * testAudio.js
 * ─────────────
 * Lightweight Web Audio API beep synthesiser for the Lactate Testing page.
 * All sounds are synthesised on-the-fly (no audio files needed).
 *
 * AudioContext is lazily created on first use and shared across calls.
 * On iOS, the context must be created (or resumed) inside a user gesture,
 * so `unlock()` should be called once from a tap handler.
 */

let _ctx = null;

/** Return the shared AudioContext, creating it on first call. */
function getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // iOS can suspend the context automatically — resume it.
  if (_ctx.state === 'suspended') {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

/**
 * Call once from a user-gesture handler (e.g. the Start Test button click)
 * so iOS will allow audio playback.
 */
export function unlockAudio() {
  try {
    const ctx = getCtx();
    // Play a silent 1-sample buffer to satisfy iOS gesture requirement.
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch (e) {
    // Silently ignore — non-critical
  }
}

/**
 * Core beep primitive.
 * @param {number}  freq      - Frequency in Hz (default 880)
 * @param {number}  dur       - Duration in seconds (default 0.15)
 * @param {number}  vol       - Peak gain 0-1 (default 0.35)
 * @param {string}  type      - OscillatorType (default 'sine')
 * @param {number}  delayMs   - Delay in ms before playing (default 0)
 */
function beep(freq = 880, dur = 0.15, vol = 0.35, type = 'sine', delayMs = 0) {
  try {
    const fn = () => {
      const ctx   = getCtx();
      const t     = ctx.currentTime;
      const osc   = ctx.createOscillator();
      const gain  = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type            = type;
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.start(t);
      osc.stop(t + dur + 0.02);
    };

    if (delayMs > 0) {
      setTimeout(fn, delayMs);
    } else {
      fn();
    }
  } catch (e) {
    // Swallow — audio is non-critical
  }
}

// ─── Named events ─────────────────────────────────────────────────────────────

/** Played when a work interval ends → transitioning to recovery. */
export function playIntervalEnd() {
  beep(880, 0.12, 0.45, 'sine',    0);
  beep(660, 0.18, 0.35, 'sine',  160);
}

/** Played when recovery timer runs out → about to start next interval. */
export function playRecoveryEnd() {
  beep(660, 0.10, 0.30, 'sine',    0);
  beep(880, 0.10, 0.30, 'sine',  140);
  beep(1100, 0.25, 0.45, 'sine', 280);
}

/** Short tick for countdown 3 and 2. */
export function playCountdownTick() {
  beep(440, 0.08, 0.30, 'square', 0);
}

/** Higher-pitched tick for countdown 1 (last tick before interval starts). */
export function playCountdownGo() {
  beep(880, 0.20, 0.50, 'square', 0);
}

/** Played at warmup-skip or warmup-complete. */
export function playWarmupComplete() {
  beep(523, 0.12, 0.35, 'sine',   0);
  beep(659, 0.12, 0.35, 'sine', 160);
  beep(784, 0.22, 0.40, 'sine', 320);
}

/** Ascending 4-note jingle when the full test completes. */
export function playTestComplete() {
  beep(523,  0.14, 0.40, 'sine',   0);   // C5
  beep(659,  0.14, 0.40, 'sine', 180);   // E5
  beep(784,  0.14, 0.40, 'sine', 360);   // G5
  beep(1047, 0.35, 0.50, 'sine', 540);   // C6
}

/** Short confirmation beep when lactate is saved. */
export function playLactateSaved() {
  beep(880, 0.10, 0.25, 'sine',   0);
  beep(1100, 0.14, 0.25, 'sine', 120);
}
