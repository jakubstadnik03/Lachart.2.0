/**
 * Trainer Connect Modal Component
 * Simple UI for connecting to trainers and controlling ERG mode
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTrainer } from './useTrainer';

/** Detect Capacitor native platform (iOS/Android) */
function isNativePlatform() {
  try {
    return !!(window?.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** Detect whether Web Bluetooth is available */
function hasWebBluetooth() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

/**
 * TrainerConnectModal accepts an optional `trainer` prop.
 * When provided the modal uses the caller's useTrainer instance so the
 * connection persists after the modal closes.  When omitted it falls back
 * to creating its own useTrainer (standalone / legacy usage).
 */
export function TrainerConnectModal({ isOpen, onClose, options, trainer: trainerProp }) {
  const internalTrainer = useTrainer(trainerProp ? null : options);
  const {
    devices,
    connectedDevice,
    telemetry,
    capabilities,
    status,
    error,
    scan,
    connect,
    disconnect,
    setErgWatts,
    setErgWattsImmediate,
    requestControl,
    start,
  } = trainerProp ?? internalTrainer;

  const [targetWatts, setTargetWatts] = useState(200);
  const [isScanning, setIsScanning] = useState(false);
  const [ergSetting, setErgSetting] = useState(false);
  const [ergFeedback, setErgFeedback] = useState(null);

  // Detect platform once
  const isNative = isNativePlatform();
  const isBluetoothAvailable = isNative || hasWebBluetooth();

  // Auto-close only on first connect (not when already in ERG — user may tap "Set ERG").
  const didAutoCloseRef = React.useRef(false);
  useEffect(() => {
    if (!isOpen) {
      didAutoCloseRef.current = false;
      return;
    }
    if (didAutoCloseRef.current) return;
    if ((status === 'ready' || status === 'controlled') && connectedDevice) {
      didAutoCloseRef.current = true;
      const timer = setTimeout(() => onClose(), 800);
      return () => clearTimeout(timer);
    }
  }, [isOpen, status, connectedDevice, onClose]);

  if (!isOpen) return null;

  const handleScan = async () => {
    setIsScanning(true);
    try {
      await scan();
    } finally {
      setIsScanning(false);
    }
  };

  const handleConnect = async (deviceId) => {
    try {
      await connect(deviceId);
      if (requestControl) await requestControl();
      if (start) await start();
    } catch (err) {
      console.error('Connection error:', err);
    }
  };

  const handleSetErg = async () => {
    const watts = Math.round(Number(targetWatts));
    if (!Number.isFinite(watts) || watts < 0) {
      setErgFeedback('Zadej platný výkon (W).');
      return;
    }
    const send = setErgWattsImmediate || setErgWatts;
    if (!send) {
      setErgFeedback('ERG není k dispozici.');
      return;
    }
    setErgSetting(true);
    setErgFeedback(null);
    try {
      if (status !== 'erg_active') {
        if (requestControl && status === 'ready') {
          await requestControl();
        }
        if (start && (status === 'ready' || status === 'controlled')) {
          try { await start(); } catch { /* optional */ }
        }
      }
      await send(watts);
      setErgFeedback(`Odesláno ${watts} W — sleduj konzoli / odpor na trenažéru.`);
      console.log('[TrainerConnectModal] Set ERG', watts, 'W');
    } catch (e) {
      console.error('[TrainerConnectModal] Set ERG failed:', e);
      setErgFeedback(e?.message || 'Nepodařilo se nastavit ERG.');
    } finally {
      setErgSetting(false);
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
      case 'ready':
      case 'controlled':
      case 'erg_active':
        return 'bg-green-500';
      case 'scanning':
      case 'connecting':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'scanning':   return 'Scanning...';
      case 'connecting': return 'Connecting...';
      case 'ready':      return 'Connected';
      case 'controlled': return 'Control active';
      case 'erg_active': return 'ERG active';
      case 'error':      return 'Error';
      default:           return 'Disconnected';
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10010] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Connect Trainer</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isNative ? 'Smart trainer via Bluetooth' : 'Smart trainer via Web Bluetooth'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Bluetooth not available warning (web only, non-Chrome desktop) */}
          {!isNative && !isBluetoothAvailable && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm space-y-1">
              <div className="font-semibold text-amber-900">Bluetooth not supported in this browser</div>
              <p className="text-amber-800 text-xs leading-relaxed">
                Web Bluetooth requires <strong>Chrome, Edge or Opera</strong> on desktop.
                Firefox and Safari do not support it.
              </p>
            </div>
          )}

          {/* Status row */}
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getStatusColor()}`} />
            <span className="text-sm font-medium text-gray-700">{getStatusLabel()}</span>
            {error && (
              <span className="text-xs text-red-600 ml-1 flex-1 truncate" title={error}>{error}</span>
            )}
          </div>

          {/* Scan button — shown when Bluetooth is available and not yet connected */}
          {isBluetoothAvailable && !connectedDevice && (
            <button
              onClick={handleScan}
              disabled={isScanning || status === 'connecting'}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
                isScanning || status === 'connecting'
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-primary text-white hover:bg-primary/90 shadow-sm'
              }`}
            >
              {isScanning ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Scanning...
                </span>
              ) : 'Scan for Trainer'}
            </button>
          )}

          {/* Helper text */}
          {isBluetoothAvailable && !connectedDevice && !isScanning && (
            <p className="text-xs text-gray-400 text-center">
              {isNative
                ? 'Turn on your trainer, then tap Scan to find it.'
                : 'A Bluetooth device picker will open. Select your trainer from the list.'}
            </p>
          )}

          {/* Device list */}
          {devices.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Found devices</p>
              {devices.map(device => (
                <div
                  key={device.id}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-gray-50"
                >
                  <div>
                    <div className="font-semibold text-sm text-gray-900">{device.name}</div>
                    <div className="text-xs text-gray-400">{device.transport}</div>
                  </div>
                  {connectedDevice?.id === device.id ? (
                    <button
                      onClick={disconnect}
                      className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(device.id)}
                      className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
                    >
                      Connect
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Connected device — telemetry + ERG control */}
          {connectedDevice && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">{connectedDevice.name}</div>
                <button
                  onClick={disconnect}
                  className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors"
                >
                  Disconnect
                </button>
              </div>

              {/* Capabilities */}
              {capabilities && (
                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                  <span className={`px-2 py-0.5 rounded-full font-medium ${capabilities.erg ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>
                    ERG {capabilities.erg ? 'on' : 'off'}
                  </span>
                  {capabilities.powerRange && (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100">
                      {capabilities.powerRange.min}–{capabilities.powerRange.max} W
                    </span>
                  )}
                </div>
              )}

              {/* Live telemetry */}
              {telemetry && (
                <div className="grid grid-cols-2 gap-2">
                  {telemetry.power != null && Number.isFinite(telemetry.power) && (
                    <div className="text-center p-2 bg-white rounded-lg border border-gray-100">
                      <div className="text-lg font-bold text-gray-900">{Math.round(telemetry.power)}</div>
                      <div className="text-xs text-gray-400">W</div>
                    </div>
                  )}
                  {telemetry.cadence != null && Number.isFinite(telemetry.cadence) && (
                    <div className="text-center p-2 bg-white rounded-lg border border-gray-100">
                      <div className="text-lg font-bold text-gray-900">{Math.round(telemetry.cadence)}</div>
                      <div className="text-xs text-gray-400">rpm</div>
                    </div>
                  )}
                  {telemetry.speed != null && Number.isFinite(telemetry.speed) && (
                    <div className="text-center p-2 bg-white rounded-lg border border-gray-100">
                      <div className="text-lg font-bold text-gray-900">{telemetry.speed.toFixed(1)}</div>
                      <div className="text-xs text-gray-400">km/h</div>
                    </div>
                  )}
                  {telemetry.hr != null && Number.isFinite(telemetry.hr) && (
                    <div className="text-center p-2 bg-white rounded-lg border border-gray-100">
                      <div className="text-lg font-bold text-gray-900">{telemetry.hr}</div>
                      <div className="text-xs text-gray-400">bpm</div>
                    </div>
                  )}
                </div>
              )}

              {/* ERG Control */}
              {capabilities?.erg && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-600">Target Power</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={capabilities.powerRange?.min || 0}
                      max={capabilities.powerRange?.max || 2000}
                      value={targetWatts}
                      onChange={(e) => {
                        setTargetWatts(Number(e.target.value));
                        setErgFeedback(null);
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSetErg(); }}
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <span className="flex items-center text-sm text-gray-500 font-medium">W</span>
                    <button
                      type="button"
                      onClick={() => { handleSetErg(); }}
                      disabled={ergSetting}
                      className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {ergSetting ? '…' : 'Set ERG'}
                    </button>
                  </div>
                  {ergFeedback && (
                    <p className={`text-xs ${ergFeedback.startsWith('Odesláno') ? 'text-green-600' : 'text-red-600'}`}>
                      {ergFeedback}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
