/**
 * Trainer Connect Modal Component
 * Simple UI for connecting to trainers and controlling ERG mode
 */

import React, { useState, useEffect } from 'react';
import { useTrainer } from './useTrainer';

export function TrainerConnectModal({ isOpen, onClose, options }) {
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
    requestControl,
    start,
  } = useTrainer(options);

  const [targetWatts, setTargetWatts] = useState(100);
  const [isScanning, setIsScanning] = useState(false);

  // Auto-close modal when connection is established
  useEffect(() => {
    if (isOpen && (status === 'controlled' || status === 'ready' || status === 'erg_active') && connectedDevice) {
      const timer = setTimeout(() => {
        onClose();
      }, 1000);
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
      // Auto-request control and start
      if (requestControl) {
        await requestControl();
      }
      if (start) {
        await start();
      }
    } catch (err) {
      console.error('Connection error:', err);
    }
  };

  const handleSetErg = () => {
    if (setErgWatts) {
      setErgWatts(targetWatts);
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
      case 'ready':
      case 'controlled':
      case 'erg_active':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Connect Trainer</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* Status */}
        <div className="mb-4 flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
          <span className="text-sm font-medium capitalize">{status}</span>
          {error && (
            <span className="text-sm text-red-600 ml-2">{error}</span>
          )}
        </div>

        {/* Scan Section */}
        <div className="mb-4">
          <div className="mb-2">
            <button
              onClick={handleScan}
              disabled={isScanning || status === 'connecting'}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isScanning ? 'Opening Device Dialog...' : 'Scan for Trainers'}
            </button>
          </div>
          <p className="text-xs text-gray-600">
            Note: Web Bluetooth will open a device selection dialog. Make sure your trainer is turned on and in pairing mode, then select it from the list.
          </p>
        </div>

        {/* Device List */}
        {devices.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold mb-2">Found Devices:</h3>
            <div className="space-y-2">
              {devices.map(device => (
                <div
                  key={device.id}
                  className="flex items-center justify-between p-2 border rounded"
                >
                  <div>
                    <div className="font-medium">{device.name}</div>
                    <div className="text-xs text-gray-500">{device.transport}</div>
                  </div>
                  {connectedDevice?.id === device.id ? (
                    <button
                      onClick={disconnect}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(device.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm"
                    >
                      Connect
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connected Device Info */}
        {connectedDevice && (
          <div className="mb-4 p-4 bg-gray-50 rounded">
            <h3 className="text-sm font-semibold mb-2">Connected: {connectedDevice.name}</h3>
            
            {/* Capabilities */}
            {capabilities && (
              <div className="text-xs text-gray-600 mb-2">
                <div>ERG: {capabilities.erg ? '✓' : '✗'}</div>
                {capabilities.powerRange && (
                  <div>Power Range: {capabilities.powerRange.min}-{capabilities.powerRange.max}W</div>
                )}
              </div>
            )}

            {/* Telemetry */}
            {telemetry && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                {telemetry.power !== undefined && (
                  <div>Power: {telemetry.power.toFixed(0)}W</div>
                )}
                {telemetry.cadence !== undefined && (
                  <div>Cadence: {telemetry.cadence.toFixed(0)}rpm</div>
                )}
                {telemetry.speed !== undefined && (
                  <div>Speed: {telemetry.speed.toFixed(1)}km/h</div>
                )}
                {telemetry.hr !== undefined && (
                  <div>HR: {telemetry.hr}bpm</div>
                )}
              </div>
            )}

            {/* ERG Control */}
            {capabilities?.erg && (
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">
                  Target Power (W):
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={capabilities.powerRange?.min || 0}
                    max={capabilities.powerRange?.max || 2000}
                    value={targetWatts}
                    onChange={(e) => setTargetWatts(Number(e.target.value))}
                    className="flex-1 px-3 py-2 border rounded"
                  />
                  <button
                    onClick={handleSetErg}
                    className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
                  >
                    Set ERG
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Close Button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
