/**
 * audioCoach — small dependency-free audio helper for in-workout cues.
 *
 * Two channels:
 *   • beep(freqHz, durationMs, volume)  — short sine tone via Web Audio API.
 *     Used for 3-2-1 countdowns, off-target alerts, step transitions.
 *   • speak(text, opts)                  — speech synthesis via the built-in
 *     `speechSynthesis` API. Used for "Next: 3 minutes at 280 watts".
 *
 * Both are no-ops when:
 *   • the browser doesn't support them (older WKWebView, server-side render),
 *   • the user has muted via a global module setting (`setEnabled(false)`),
 *   • or speech is called while another utterance is mid-flight (we cancel
 *     the in-flight one — newer prompts always win).
 *
 * iOS / Safari quirk: the AudioContext must be created or resumed inside a
 * user-gesture handler (tap), otherwise it stays in 'suspended' state and
 * every beep is silent. We expose `unlock()` to be called from any tap and
 * also auto-call it from beep() / speak() defensively.
 */

let _ctx = null;
let _enabled = true;
let _voiceEnabled = true;
let _volume = 0.4;

function getCtx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_ctx) {
    try { _ctx = new AC(); } catch (_) { _ctx = null; }
  }
  // Some browsers suspend the context when the page is hidden.
  if (_ctx && _ctx.state === 'suspended') {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

/** Call from a user-gesture handler (e.g. Start button) to unlock audio
 *  on iOS / Safari. Safe to call any time. */
export function unlock() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  // A near-silent tick primes the audio pipeline on iOS.
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
  } catch (_) { /* swallow */ }
}

export function setEnabled(on) { _enabled = !!on; }
export function setVoiceEnabled(on) { _voiceEnabled = !!on; }
export function setVolume(v) { _volume = Math.max(0, Math.min(1, Number(v) || 0)); }
export function isEnabled() { return _enabled; }

/**
 * Play a short sine beep.
 *   freq    — frequency in Hz (default 880 = A5)
 *   ms      — duration in milliseconds (default 120)
 *   gain    — 0..1 (default uses module `_volume`)
 */
export function beep(freq = 880, ms = 120, gain = null) {
  if (!_enabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const peak = gain != null ? gain : _volume;
    osc.type = 'sine';
    osc.frequency.value = freq;
    // Quick ASR envelope — no clicks, no sustained ringing.
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.01);
    env.gain.linearRampToValueAtTime(peak, now + ms / 1000 - 0.02);
    env.gain.linearRampToValueAtTime(0, now + ms / 1000);
    osc.connect(env).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + ms / 1000);
  } catch (_) { /* swallow */ }
}

/**
 * Speak text via the SpeechSynthesis API.
 *   text — string to speak
 *   opts.lang   — BCP-47 language (defaults to 'en-US')
 *   opts.rate   — 0.1..10 (default 1.05 — slightly faster than default reads naturally)
 *   opts.pitch  — 0..2 (default 1)
 *   opts.cancel — bool, cancel any in-flight utterance first (default true)
 */
export function speak(text, opts = {}) {
  if (!_enabled || !_voiceEnabled) return;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  if (!text || typeof text !== 'string') return;
  try {
    if (opts.cancel !== false) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang || 'en-US';
    u.rate = opts.rate != null ? opts.rate : 1.05;
    u.pitch = opts.pitch != null ? opts.pitch : 1;
    u.volume = opts.volume != null ? opts.volume : _volume;
    window.speechSynthesis.speak(u);
  } catch (_) { /* swallow */ }
}

/** Convenience cues used by the workout-execution page. */
export const cues = {
  countdown3() { beep(880, 80); },
  countdown2() { beep(880, 80); },
  countdown1() { beep(880, 80); },
  stepStart()  { beep(1320, 180, 0.5); },
  stepEnd()    { beep(660, 240, 0.5); },
  overTarget() { beep(440, 80, 0.35); },
  underTarget() { beep(330, 80, 0.35); },
  finished()   { beep(880, 120); setTimeout(() => beep(1320, 160), 140); setTimeout(() => beep(1760, 240), 320); },
};
