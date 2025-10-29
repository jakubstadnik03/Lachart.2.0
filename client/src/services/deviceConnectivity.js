/**
 * Device Connectivity Service
 * Handles Web Bluetooth API and WebSocket connections for real-time sensor data
 */

// Configuration: Set to false to disable simulated/mock data
// When false, devices will only work with real Web Bluetooth connections
const ENABLE_SIMULATED_DATA = false; // Set to true to enable mock data for testing

class DeviceConnectivityService {
  constructor() {
    this.connections = new Map();
    this.dataCallbacks = new Map();
    this.wsConnection = null;
    this.isWebSocketConnected = false;
  }

  /**
   * Connect to device via Web Bluetooth API
   * @param {string} deviceType - Type of device (bikeTrainer, heartRate, moxy, etc.)
   * @param {Function} onData - Callback function for receiving data
   * @returns {Promise<boolean>} - Success status
   */
  async connectWebBluetooth(deviceType, onData) {
    if (!navigator.bluetooth) {
      console.warn('Web Bluetooth API not supported in this browser');
      throw new Error('Web Bluetooth API not supported in this browser. Please use Chrome, Edge, or Opera.');
    }

    try {
      const deviceService = this.getDeviceServiceInfo(deviceType);
      if (!deviceService) {
        console.error(`Unknown device type: ${deviceType}`);
        throw new Error(`Unknown device type: ${deviceType}`);
      }

      // Request device connection
      let device;
      try {
        device = await navigator.bluetooth.requestDevice({
          filters: deviceService.filters,
          optionalServices: deviceService.optionalServices || []
        });
      } catch (error) {
        if (error.name === 'NotFoundError') {
          throw new Error('No device found. Please make sure your device is turned on and in pairing mode.');
        } else if (error.name === 'SecurityError') {
          throw new Error('Permission denied. Please allow Bluetooth access.');
        } else if (error.name === 'InvalidStateError') {
          throw new Error('Device already connected or pairing in progress.');
        }
        throw error;
      }

      // Handle device disconnection
      device.addEventListener('gattserverdisconnected', () => {
        console.log(`Device ${deviceType} disconnected`);
        this.connections.delete(deviceType);
        this.dataCallbacks.delete(deviceType);
      });

      // Connect to GATT server
      let server;
      try {
        server = await device.gatt.connect();
      } catch (error) {
        throw new Error(`Failed to connect to device: ${error.message}`);
      }

      // Get primary service
      let service;
      try {
        service = await server.getPrimaryService(deviceService.serviceUUID);
      } catch (error) {
        await server.disconnect();
        throw new Error(`Service not found. Your device may not support ${deviceType}.`);
      }

      // Register data callback
      if (onData) {
        this.dataCallbacks.set(deviceType, onData);
      }

      // Start notifications for characteristic updates
      if (deviceService.characteristics && deviceService.characteristics.length > 0) {
        for (const charInfo of deviceService.characteristics) {
          try {
            const characteristic = await service.getCharacteristic(charInfo.uuid);
            await characteristic.startNotifications();
            
            characteristic.addEventListener('characteristicvaluechanged', (event) => {
              try {
                const data = this.parseCharacteristicData(deviceType, event.target.value);
                if (onData) {
                  onData(data);
                }
              } catch (error) {
                console.error(`Error parsing data from ${deviceType}:`, error);
              }
            });
          } catch (error) {
            console.warn(`Could not start notifications for characteristic ${charInfo.uuid}:`, error);
            // Continue with other characteristics
          }
        }
      }

      this.connections.set(deviceType, { device, server, service });
      return true;
    } catch (error) {
      console.error(`Error connecting to ${deviceType}:`, error);
      // Clean up on error
      const connection = this.connections.get(deviceType);
      if (connection) {
        try {
          if (connection.server?.connected) {
            await connection.server.disconnect();
          }
        } catch (e) {
          // Ignore cleanup errors
        }
        this.connections.delete(deviceType);
        this.dataCallbacks.delete(deviceType);
      }
      throw error; // Re-throw to let caller handle it
    }
  }

  /**
   * Connect via WebSocket for devices that require server-side handling
   */
  connectWebSocket(serverUrl, onData) {
    try {
      this.wsConnection = new WebSocket(serverUrl);

      this.wsConnection.onopen = () => {
        console.log('WebSocket connected');
        this.isWebSocketConnected = true;
      };

      this.wsConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (onData) {
            onData(data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket data:', error);
        }
      };

      this.wsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isWebSocketConnected = false;
      };

      this.wsConnection.onclose = () => {
        console.log('WebSocket disconnected');
        this.isWebSocketConnected = false;
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
    }
  }

  /**
   * Disconnect device
   */
  async disconnectDevice(deviceType) {
    const connection = this.connections.get(deviceType);
    if (connection) {
      try {
        // Stop simulated data if applicable
        if (connection.simulated && connection.intervalId) {
          clearInterval(connection.intervalId);
        }
        
        // Disconnect real Bluetooth device
        if (connection.device && connection.device.gatt?.connected) {
          await connection.device.gatt.disconnect();
        }
        
        this.connections.delete(deviceType);
        this.dataCallbacks.delete(deviceType);
        return true;
      } catch (error) {
        console.error(`Error disconnecting ${deviceType}:`, error);
        // Still clean up local state
        this.connections.delete(deviceType);
        this.dataCallbacks.delete(deviceType);
        return false;
      }
    }
    return false;
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket() {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
      this.isWebSocketConnected = false;
    }
  }

  /**
   * Get device service information
   */
  getDeviceServiceInfo(deviceType) {
    const deviceConfigs = {
      bikeTrainer: {
        filters: [
          { services: ['00001826-0000-1000-8000-00805f9b34fb'] }, // Cycling Power Service
          { namePrefix: 'Smart' },
          { namePrefix: 'Wahoo' },
          { namePrefix: 'Tacx' },
          { namePrefix: 'Zwift' }
        ],
        serviceUUID: '00001826-0000-1000-8000-00805f9b34fb', // Cycling Power Service
        optionalServices: ['battery_service', '0000180f-0000-1000-8000-00805f9b34fb'],
        characteristics: [
          { uuid: '00002a63-0000-1000-8000-00805f9b34fb' } // Cycling Power Measurement
        ]
      },
      heartRate: {
        filters: [
          { services: ['0000180d-0000-1000-8000-00805f9b34fb'] }, // Heart Rate Service
          { namePrefix: 'Polar' },
          { namePrefix: 'Garmin' },
          { namePrefix: 'Wahoo' },
          { namePrefix: 'Suunto' }
        ],
        serviceUUID: '0000180d-0000-1000-8000-00805f9b34fb', // Heart Rate Service
        optionalServices: ['battery_service', '0000180f-0000-1000-8000-00805f9b34fb'],
        characteristics: [
          { uuid: '00002a37-0000-1000-8000-00805f9b34fb' } // Heart Rate Measurement
        ]
      },
      moxy: {
        filters: [
          { namePrefix: 'Moxy' },
          { services: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e'] }
        ],
        serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
        optionalServices: ['battery_service'],
        characteristics: [
          { uuid: '6e400003-b5a3-f393-e0a9-e50e24dcca9e' } // NUS RX Characteristic
        ]
      },
      coreTemp: {
        filters: [
          { namePrefix: 'CORE' },
          { namePrefix: 'Temp' }
        ],
        serviceUUID: '00001809-0000-1000-8000-00805f9b34fb', // Health Thermometer Service
        optionalServices: ['battery_service'],
        characteristics: [
          { uuid: '00002a1c-0000-1000-8000-00805f9b34fb' } // Temperature Measurement
        ]
      },
      vo2master: {
        filters: [
          { namePrefix: 'VO2Master' },
          { namePrefix: 'VO2' }
        ],
        serviceUUID: '0000180a-0000-1000-8000-00805f9b34fb', // Device Information Service
        optionalServices: ['battery_service'],
        characteristics: [
          { uuid: '00002a29-0000-1000-8000-00805f9b34fb' } // Manufacturer Name String
        ]
      }
    };

    return deviceConfigs[deviceType];
  }

  /**
   * Parse characteristic data based on device type
   */
  parseCharacteristicData(deviceType, dataView) {
    try {
      switch (deviceType) {
        case 'bikeTrainer':
          // Parse Cycling Power Measurement (CPM) - Bluetooth SIG standard
          // Format: [Flags (2 bytes), Instantaneous Power (2 bytes), Cumulative Wheel Revolutions (optional), Last Wheel Event Time (optional), Cumulative Crank Revolutions (optional), Last Crank Event Time (optional)]
          if (dataView.byteLength < 4) {
            console.warn('Power data too short');
            return {};
          }
          
          const flags = dataView.getUint16(0, true);
          const instantPower = dataView.getUint16(2, true);
          
          // Check if cadence data is present (bit 0 of flags)
          let cadence = null;
          let offset = 4;
          
          // If wheel revolutions present
          if (flags & 0x10 && dataView.byteLength >= offset + 6) {
            offset += 6; // 4 bytes cumulative + 2 bytes last event time
          }
          
          // If crank revolutions present (for cadence)
          if (flags & 0x20 && dataView.byteLength >= offset + 4) {
            // Note: Real cadence calculation would need previous values for RPM
            // For now, we'd need to track these values across notifications
            // const crankRevolutions = dataView.getUint16(offset, true);
            // const lastCrankEventTime = dataView.getUint16(offset + 2, true);
            // Simplified: cadence would be calculated from delta of crank revolutions over time
            cadence = null; // Would need to calculate from delta
          }
          
          return { power: instantPower, cadence };

        case 'heartRate':
          // Parse Heart Rate Measurement - Bluetooth SIG standard
          // Format: [Flags (1 byte), Heart Rate Value (1 or 2 bytes), Energy Expended (optional), RR-Interval (optional)]
          if (dataView.byteLength < 2) {
            console.warn('Heart rate data too short');
            return {};
          }
          
          const flagsHR = dataView.getUint8(0);
          const heartRateValueFormat = flagsHR & 0x01; // 0 = 8-bit, 1 = 16-bit
          
          let hrValue;
          if (heartRateValueFormat && dataView.byteLength >= 3) {
            hrValue = dataView.getUint16(1, true);
          } else {
            hrValue = dataView.getUint8(1);
          }
          
          return { heartRate: hrValue };

        case 'moxy':
          // Parse Moxy data - this is a simplified parser
          // Actual Moxy protocol may have different packet formats
          if (dataView.byteLength < 4) {
            console.warn('Moxy data too short');
            return {};
          }
          
          // Simplified parsing - actual format may vary
          const smo2 = dataView.getUint16(0, true) / 100;
          const thb = dataView.byteLength >= 4 ? dataView.getUint16(2, true) / 1000 : null;
          return { smo2, thb };

        case 'coreTemp':
          // Parse Health Thermometer - Bluetooth SIG standard
          // Format: [Flags (1 byte), Temperature Measurement Value (4 bytes IEEE-11073), Temperature Type (1 byte, optional)]
          if (dataView.byteLength < 5) {
            console.warn('Temperature data too short');
            return {};
          }
          
          // Temperature is in IEEE-11073 32-bit float format
          const tempValue = dataView.getUint32(1, true);
          // Convert from IEEE-11073 format (simplified - actual conversion is more complex)
          const coreTemp = tempValue / 100;
          
          return { coreTemp };

        case 'vo2master':
          // VO2Master may use custom protocol - simplified parsing
          // This would need actual device documentation for proper parsing
          console.warn('VO2Master parsing not fully implemented');
          return {};

        default:
          console.warn(`Unknown device type for parsing: ${deviceType}`);
          return {};
      }
    } catch (error) {
      console.error(`Error parsing ${deviceType} data:`, error);
      return {};
    }
  }

  /**
   * Simulate device data (for development/testing)
   * Only works if ENABLE_SIMULATED_DATA is true
   */
  simulateDeviceData(deviceType, onData, interval = 1000) {
    if (!ENABLE_SIMULATED_DATA) {
      console.warn('Simulated data is disabled. Set ENABLE_SIMULATED_DATA = true to enable.');
      return null;
    }
    
    const intervalId = setInterval(() => {
      const simulatedData = this.generateSimulatedData(deviceType);
      if (onData) {
        onData(simulatedData);
      }
    }, interval);

    this.connections.set(deviceType, { simulated: true, intervalId });
    return intervalId;
  }

  /**
   * Generate simulated device data
   * Only works if ENABLE_SIMULATED_DATA is true
   */
  generateSimulatedData(deviceType) {
    if (!ENABLE_SIMULATED_DATA) {
      console.warn('Simulated data generation is disabled');
      return {};
    }
    const baseData = {
      bikeTrainer: {
        power: Math.random() * 300 + 100,
        cadence: Math.random() * 40 + 70
      },
      heartRate: {
        heartRate: Math.random() * 50 + 120
      },
      moxy: {
        smo2: Math.random() * 20 + 60,
        thb: Math.random() * 10 + 80
      },
      coreTemp: {
        coreTemp: Math.random() * 2 + 37
      },
      vo2master: {
        vo2: Math.random() * 10 + 30,
        vco2: Math.random() * 8 + 25,
        ventilation: Math.random() * 30 + 60
      }
    };

    return baseData[deviceType] || {};
  }

  /**
   * Stop simulated device data
   */
  stopSimulatedData(deviceType) {
    const connection = this.connections.get(deviceType);
    if (connection?.simulated && connection.intervalId) {
      clearInterval(connection.intervalId);
      this.connections.delete(deviceType);
    }
  }

  /**
   * Check if device is connected
   */
  isDeviceConnected(deviceType) {
    return this.connections.has(deviceType);
  }
}

// Export singleton instance
const deviceConnectivityService = new DeviceConnectivityService();
export default deviceConnectivityService;

