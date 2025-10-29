import React from 'react';
import { motion } from 'framer-motion';
import {
  SignalIcon,
  SignalSlashIcon,
  WifiIcon
} from '@heroicons/react/24/outline';

const DeviceConnectionPanel = ({ devices, onDeviceConnect, onDeviceDisconnect }) => {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow-md p-6"
    >
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <WifiIcon className="w-6 h-6" />
        Device Connections
      </h2>

      <div className="space-y-3">
        {deviceList.map((device) => {
          const deviceState = devices[device.key];
          const isConnected = deviceState?.connected || false;

          return (
            <div
              key={device.key}
              className={`p-4 rounded-lg border-2 transition-all ${
                isConnected
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{device.icon}</span>
                  <div>
                    <div className="font-semibold text-gray-900">{device.name}</div>
                    <div className="text-sm text-gray-600">{device.description}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <SignalIcon className="w-5 h-5 text-green-500" />
                      <button
                        onClick={() => onDeviceDisconnect(device.key)}
                        className="px-3 py-1 text-sm bg-red-500 text-white rounded-md hover:bg-red-600"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <SignalSlashIcon className="w-5 h-5 text-gray-400" />
                      <button
                        onClick={() => onDeviceConnect(device.key)}
                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600"
                      >
                        Connect
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isConnected && deviceState?.data && (
                <div className="mt-3 pt-3 border-t border-green-200">
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
  );
};

export default DeviceConnectionPanel;

