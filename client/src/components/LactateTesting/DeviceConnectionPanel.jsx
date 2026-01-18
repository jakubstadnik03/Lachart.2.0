import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SignalIcon,
  SignalSlashIcon,
  WifiIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';

const DeviceConnectionPanel = ({ devices, onDeviceConnect, onDeviceDisconnect }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const deviceList = [
    {
      key: 'bikeTrainer',
      name: 'Bike Trainer',
      icon: '🚴',
      description: 'Smart trainer via Bluetooth/ANT+'
    },
    {
      key: 'heartRate',
      name: 'Heart Rate Monitor',
      icon: '❤️',
      description: 'Heart rate strap/band'
    },
    {
      key: 'moxy',
      name: 'Moxy Monitor',
      icon: '📊',
      description: 'Muscle oxygenation sensor'
    },
    {
      key: 'coreTemp',
      name: 'Core Temperature',
      icon: '🌡️',
      description: 'Core body temperature sensor'
    },
    {
      key: 'vo2master',
      name: 'VO2Master',
      icon: '💨',
      description: 'Oxygen uptake & breathing data'
    }
  ];

  const connectedCount = Object.values(devices).filter(d => d?.connected).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl overflow-hidden"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <WifiIcon className="w-6 h-6" />
          <h2 className="text-xl font-bold">Device Connections</h2>
          {connectedCount > 0 && (
            <span className="px-2 py-0.5 bg-emerald-500 text-white text-xs font-semibold rounded-full">
              {connectedCount} connected
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUpIcon className="w-5 h-5 text-gray-600" />
        ) : (
          <ChevronDownIcon className="w-5 h-5 text-gray-600" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
        {deviceList.map((device) => {
          const deviceState = devices[device.key];
          const isConnected = deviceState?.connected || false;

          return (
            <div
              key={device.key}
              className={`p-4 rounded-2xl transition-all border ${
                isConnected
                  ? 'border-emerald-300 bg-emerald-50/60'
                  : 'border-white/40 bg-white/50 backdrop-blur'
              } shadow`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{device.icon}</span>
                  <div>
                    <div className="font-semibold text-gray-900">
                      {device.name}
                      {isConnected && deviceState?.name && (
                        <span className="text-emerald-600 text-sm ml-2">({deviceState.name})</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">{device.description}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <SignalIcon className="w-5 h-5 text-emerald-500" />
                      <button
                        onClick={() => onDeviceDisconnect(device.key)}
                        className="px-3 py-1.5 text-sm bg-white/70 text-rose-700 rounded-xl hover:bg-white border border-rose-200 shadow"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <SignalSlashIcon className="w-5 h-5 text-gray-400" />
                      <button
                        onClick={() => onDeviceConnect(device.key)}
                        className="px-3 py-1.5 text-sm bg-primary text-white rounded-xl hover:bg-primary/90 shadow"
                      >
                        Connect
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isConnected && deviceState?.data && (
                <div className="mt-3 pt-3 border-t border-emerald-200/60">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {device.key === 'bikeTrainer' && (
                      <>
                        <div>Power: <span className="font-semibold">{deviceState.data.power?.toFixed(0)} W</span></div>
                        <div>Cadence: <span className="font-semibold">{deviceState.data.cadence?.toFixed(0)} rpm</span></div>
                      </>
                    )}
                    {device.key === 'heartRate' && (
                      <div>HR: <span className="font-semibold">{deviceState.data.heartRate?.toFixed(0)} bpm</span></div>
                    )}
                    {device.key === 'moxy' && (
                      <>
                        <div>SmO2: <span className="font-semibold">{deviceState.data.smo2?.toFixed(1)}%</span></div>
                        <div>THb: <span className="font-semibold">{deviceState.data.thb?.toFixed(1)}</span></div>
                      </>
                    )}
                    {device.key === 'coreTemp' && (
                      <div>Temp: <span className="font-semibold">{deviceState.data.coreTemp?.toFixed(1)}°C</span></div>
                    )}
                    {device.key === 'vo2master' && (
                      <>
                        <div>VO2: <span className="font-semibold">{deviceState.data.vo2?.toFixed(1)}</span></div>
                        <div>VCO2: <span className="font-semibold">{deviceState.data.vco2?.toFixed(1)}</span></div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default DeviceConnectionPanel;

