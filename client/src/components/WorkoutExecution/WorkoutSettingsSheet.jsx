/**
 * WorkoutSettingsSheet
 * ────────────────────
 * Bottom-sheet modal opened from the workout-execution Settings (gear)
 * button. Centralises all live-workout configuration so the always-on
 * header stays minimal:
 *
 *   • Device connections (trainer / HR strap / CORE body temperature),
 *     each with a live connected-pill + connect/disconnect button.
 *   • ERG mode toggle + bias adjuster (±5 % per tap, 50-150 %).
 *   • Display toggles (chart / laps sidebar).
 *
 * Designed for one-handed phone use — large tap targets, content
 * scrolls inside a fixed-height sheet so the close button stays
 * reachable even with a tall device list.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { BoltIcon as BoltSolid } from '@heroicons/react/24/solid';
import { TrainerConnectModal } from '../../trainer/react/TrainerConnectModal.jsx';

function DevicePill({ label, sublabel, color, connected, connecting, onConnect, onDisconnect, icon }) {
  return (
    <div
      className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border"
      style={{
        borderColor: connected ? color + '66' : 'rgba(255,255,255,0.12)',
        background: connected ? color + '15' : 'rgba(255,255,255,0.03)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: connected ? color + '22' : 'rgba(255,255,255,0.05)' }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-white truncate">{label}</div>
          <div className="text-[11px] text-gray-400 truncate">{sublabel}</div>
        </div>
      </div>
      {connecting ? (
        <div className="flex items-center gap-1.5 text-xs text-gray-400 px-3 py-2">
          <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
          …
        </div>
      ) : connected ? (
        <button
          onClick={onDisconnect}
          className="px-4 py-2 rounded-xl text-xs font-bold border min-w-[88px]"
          style={{
            color,
            borderColor: color + '66',
            background: color + '10',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={onConnect}
          className="px-4 py-2 rounded-xl text-xs font-bold text-white border border-white/20 hover:bg-white/10 active:bg-white/15 min-w-[88px]"
          style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
        >
          Connect
        </button>
      )}
    </div>
  );
}

export default function WorkoutSettingsSheet({
  open,
  onClose,
  // Device hooks (each provides { status, deviceName, connect, disconnect, data, error, _hook })
  trainer,
  hrStrap,
  coreTemp,
  liveHr,
  // ERG state
  ergMode,
  setErgMode,
  ergBias,
  bumpErgBias,
  ergStep = 0.05,
  ergMin = 0.5,
  ergMax = 1.5,
  effectiveErgWatts = null,
  // Display toggles
  showChart,
  setShowChart,
  showLapsSidebar,
  setShowLapsSidebar,
  // Coach / safety
  audioEnabled,
  setAudioEnabled,
  voiceEnabled,
  setVoiceEnabled,
  wakeLockEnabled,
  setWakeLockEnabled,
  wakeLockSupported,
  autoPauseEnabled,
  setAutoPauseEnabled,
}) {
  const [showTrainerModal, setShowTrainerModal] = useState(false);

  return (
    <>
    {/* TrainerConnectModal — same UI as LactateTestingPage */}
    <TrainerConnectModal
      isOpen={showTrainerModal}
      onClose={() => setShowTrainerModal(false)}
      trainer={trainer._hook}
    />
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[10000] bg-black/60 flex items-end justify-center"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-gray-900 border border-white/10 rounded-t-3xl flex flex-col"
            style={{
              maxHeight: '85vh',
              paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 pb-2 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/15" />
            </div>

            {/* Header — close button is a 44 × 44 hit target */}
            <div className="flex items-center justify-between px-5 pb-2 flex-shrink-0">
              <h3 className="text-base font-bold text-white">Workout Settings</h3>
              <button
                onClick={onClose}
                aria-label="Close settings"
                className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/15 text-white"
                style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="px-5 pb-2 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>

              {/* ── Devices ──────────────────────────────────────────── */}
              <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mt-2 mb-2">
                Devices
              </h4>
              <div className="space-y-2.5">
                <DevicePill
                  label={trainer.status === 'connected' ? (trainer.deviceName || 'Smart Trainer') : 'Smart Trainer'}
                  sublabel={
                    trainer.status === 'connected'
                      ? trainer.protocol === 'cps-readonly'
                        ? 'CPS · power only — no ERG'
                        : trainer.protocol === 'ftms'
                          ? 'FTMS · power, cadence, ERG'
                          : 'Connecting…'
                      : 'FTMS · power, cadence, ERG'
                  }
                  color="#a78bfa"
                  icon={<BoltSolid className="w-5 h-5" />}
                  connected={trainer.status === 'connected'}
                  connecting={trainer.status === 'connecting'}
                  onConnect={() => {
                    onClose();
                    setTimeout(() => setShowTrainerModal(true), 50);
                  }}
                  onDisconnect={trainer.disconnect}
                />
                <DevicePill
                  label={hrStrap.status === 'connected' ? (hrStrap.deviceName || 'Heart Rate') : 'Heart Rate Strap'}
                  sublabel={liveHr != null && hrStrap.status === 'connected' ? `Live: ${Math.round(liveHr)} bpm` : 'Polar / Wahoo TICKR / Garmin / Coros'}
                  color="#fb7185"
                  icon={<span className="text-lg leading-none">♥</span>}
                  connected={hrStrap.status === 'connected'}
                  connecting={hrStrap.status === 'connecting'}
                  onConnect={hrStrap.connect}
                  onDisconnect={hrStrap.disconnect}
                />
                <DevicePill
                  label={coreTemp.status === 'connected' ? (coreTemp.deviceName || 'CORE Body Temp') : 'CORE Body Temp'}
                  sublabel={
                    coreTemp.status === 'connected' && coreTemp.data?.coreTemp != null
                      ? `Live: ${coreTemp.data.coreTemp.toFixed(2)} °C${coreTemp.data.hsi != null ? ` · HSI ${coreTemp.data.hsi.toFixed(1)}` : ''}`
                      : 'greenTEG CORE — heat training'
                  }
                  color="#f97316"
                  icon={
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8 7 7 11 7 14a5 5 0 1 0 10 0c0-3-1-7-5-12z"/></svg>
                  }
                  connected={coreTemp.status === 'connected'}
                  connecting={coreTemp.status === 'connecting'}
                  onConnect={coreTemp.connect}
                  onDisconnect={coreTemp.disconnect}
                />
              </div>
              {(trainer.error || hrStrap.error || coreTemp.error) && (
                <p className="text-[11px] text-rose-400 mt-3 px-1">
                  {trainer.error || hrStrap.error || coreTemp.error}
                </p>
              )}

              {/* ── ERG mode ─────────────────────────────────────────── */}
              <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mt-6 mb-2">
                ERG Mode
              </h4>
              <div className="p-3.5 rounded-2xl border border-white/10 bg-white/[0.03]">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-sm font-bold text-white">Auto power control</div>
                    <div className="text-[11px] text-gray-400">Trainer holds prescribed wattage automatically.</div>
                  </div>
                  <button
                    onClick={() => setErgMode(!ergMode)}
                    role="switch"
                    aria-checked={ergMode}
                    className="relative w-12 h-7 rounded-full transition-colors flex-shrink-0"
                    style={{
                      background: ergMode ? '#a78bfa' : 'rgba(255,255,255,0.15)',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform"
                      style={{ transform: ergMode ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </button>
                </div>

                {/* ERG status feedback — shows why ERG may not be sending */}
                {(() => {
                  const trainerConnected = trainer.status === 'connected';
                  const isFtms = trainer.protocol === 'ftms' || trainer.ergCapable;
                  const isCpsOnly = trainerConnected && !isFtms && trainer.protocol;

                  if (!trainerConnected) {
                    return (
                      <div className="flex items-center gap-2 text-[11px] text-amber-400 bg-amber-400/10 rounded-xl px-3 py-2 mb-1">
                        <span className="text-base leading-none">⚡</span>
                        <span>Connect a trainer to use ERG mode</span>
                      </div>
                    );
                  }
                  if (isCpsOnly) {
                    return (
                      <div className="flex items-center gap-2 text-[11px] text-rose-400 bg-rose-400/10 rounded-xl px-3 py-2 mb-1">
                        <span className="text-base leading-none">⚠</span>
                        <span>This trainer is read-only (CPS) — ERG control not supported. Reconnect via FTMS for ERG.</span>
                      </div>
                    );
                  }
                  if (isFtms && ergMode && effectiveErgWatts == null) {
                    return (
                      <div className="flex items-center gap-2 text-[11px] text-amber-400 bg-amber-400/10 rounded-xl px-3 py-2 mb-1">
                        <span className="text-base leading-none">⚡</span>
                        <span>ERG on — no power target for current step (open power)</span>
                      </div>
                    );
                  }
                  if (isFtms && ergMode && effectiveErgWatts != null) {
                    return (
                      <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-400/10 rounded-xl px-3 py-2 mb-1">
                        <span className="text-base leading-none">✓</span>
                        <span>ERG active — sending <strong>{effectiveErgWatts} W</strong> to trainer</span>
                      </div>
                    );
                  }
                  if (isFtms && !ergMode) {
                    return (
                      <div className="flex items-center gap-2 text-[11px] text-gray-500 rounded-xl px-3 py-2 mb-1">
                        <span className="text-base leading-none">⚡</span>
                        <span>Trainer supports ERG — toggle on to enable auto power</span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {ergMode && (
                  <div className="flex items-center justify-between gap-2 mt-2 p-1 rounded-xl bg-white/5">
                    <button
                      onClick={() => bumpErgBias(-ergStep)}
                      disabled={ergBias <= ergMin + 1e-6}
                      aria-label="Decrease ERG intensity"
                      className="w-12 h-12 rounded-xl bg-primary/20 text-primary text-2xl font-bold hover:bg-primary/30 active:bg-primary/40 disabled:opacity-40"
                      style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                    >
                      −
                    </button>
                    <div className="text-center flex-1">
                      <div className="text-3xl font-black text-white tabular-nums leading-none">
                        {Math.round(ergBias * 100)}%
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">
                        of prescribed power
                      </div>
                    </div>
                    <button
                      onClick={() => bumpErgBias(ergStep)}
                      disabled={ergBias >= ergMax - 1e-6}
                      aria-label="Increase ERG intensity"
                      className="w-12 h-12 rounded-xl bg-primary/20 text-primary text-2xl font-bold hover:bg-primary/30 active:bg-primary/40 disabled:opacity-40"
                      style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                    >
                      +
                    </button>
                  </div>
                )}
              </div>

              {/* ── Coach (audio + safety) ───────────────────────────── */}
              <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mt-6 mb-2">
                Coach &amp; Safety
              </h4>
              <div className="space-y-2">
                {[
                  {
                    label: 'Audio cues',
                    sublabel: '3-2-1 countdown · off-target alerts · interval chime',
                    value: audioEnabled,
                    setter: setAudioEnabled,
                  },
                  {
                    label: 'Voice prompts',
                    sublabel: '"Next: 3 minutes at 280 watts"',
                    value: voiceEnabled,
                    setter: setVoiceEnabled,
                    disabled: !audioEnabled,
                  },
                  {
                    label: 'Keep screen on',
                    sublabel: wakeLockSupported
                      ? 'Phone stays awake for the whole workout'
                      : 'Not supported in this browser',
                    value: wakeLockEnabled,
                    setter: setWakeLockEnabled,
                    disabled: !wakeLockSupported,
                  },
                  {
                    label: 'Auto-pause',
                    sublabel: 'Pause when power < 30 W and cadence < 30 rpm for 10 s',
                    value: autoPauseEnabled,
                    setter: setAutoPauseEnabled,
                  },
                ].map((toggle) => (
                  <button
                    key={toggle.label}
                    onClick={() => !toggle.disabled && toggle.setter(!toggle.value)}
                    disabled={toggle.disabled}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl border border-white/10 bg-white/[0.03] active:bg-white/[0.06] disabled:opacity-50"
                    style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                  >
                    <div className="min-w-0 text-left">
                      <div className="text-sm text-white">{toggle.label}</div>
                      {toggle.sublabel && (
                        <div className="text-[11px] text-gray-500 mt-0.5">{toggle.sublabel}</div>
                      )}
                    </div>
                    <span
                      role="switch"
                      aria-checked={toggle.value}
                      className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                      style={{ background: toggle.value && !toggle.disabled ? '#a78bfa' : 'rgba(255,255,255,0.15)' }}
                    >
                      <span
                        className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                        style={{ transform: toggle.value ? 'translateX(20px)' : 'translateX(0)' }}
                      />
                    </span>
                  </button>
                ))}
              </div>

              {/* ── Display ──────────────────────────────────────────── */}
              <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mt-6 mb-2">
                Display
              </h4>
              <div className="space-y-2">
                {[
                  { label: 'Live power + HR chart', value: showChart, setter: setShowChart },
                  { label: 'Step navigator sidebar', value: showLapsSidebar, setter: setShowLapsSidebar },
                ].map((toggle) => (
                  <button
                    key={toggle.label}
                    onClick={() => toggle.setter(!toggle.value)}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl border border-white/10 bg-white/[0.03] active:bg-white/[0.06]"
                    style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                  >
                    <span className="text-sm text-white">{toggle.label}</span>
                    <span
                      role="switch"
                      aria-checked={toggle.value}
                      className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                      style={{ background: toggle.value ? '#a78bfa' : 'rgba(255,255,255,0.15)' }}
                    >
                      <span
                        className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                        style={{ transform: toggle.value ? 'translateX(20px)' : 'translateX(0)' }}
                      />
                    </span>
                  </button>
                ))}
              </div>

              <div className="h-2" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
