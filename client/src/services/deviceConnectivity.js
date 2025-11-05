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
    // Track previous CSC values for calculating speed and cadence
    this.cscPreviousValues = new Map(); // deviceType -> { wheelRevolutions, lastWheelTime, crankRevolutions, lastCrankTime, timestamp }
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
        this.cscPreviousValues.delete(deviceType); // Clear CSC tracking data
      });

      // Connect to GATT server
      let server;
      try {
        server = await device.gatt.connect();
      } catch (error) {
        throw new Error(`Failed to connect to device: ${error.message}`);
      }

      // Get primary service - try multiple services for bikeTrainer
      let service;
      let serviceUUIDs = [deviceService.serviceUUID];
      
      // For bikeTrainer, try alternative services if primary not found
      if (deviceType === 'bikeTrainer') {
        // Try primary service first, then optional services
        serviceUUIDs = [
          deviceService.serviceUUID, // Cycling Power Service (primary)
          '00001816-0000-1000-8000-00805f9b34fb' // Cycling Speed and Cadence Service (alternative)
        ];
        // Also try optional services if defined
        if (deviceService.optionalServices) {
          serviceUUIDs.push(...deviceService.optionalServices.filter(s => typeof s === 'string'));
        }
      }
      
      for (const uuid of serviceUUIDs) {
        try {
          service = await server.getPrimaryService(uuid);
          console.log(`Found service: ${uuid} for ${deviceType}`);
          break; // Success, exit loop
        } catch (error) {
          console.warn(`Service ${uuid} not found, trying next...`);
          continue;
        }
      }
      
      if (!service) {
        // Get available services for better error message
        let availableServices = [];
        try {
          const services = await server.getPrimaryServices();
          availableServices = services.map(s => s.uuid);
          console.log('Available services on device:', availableServices);
        } catch (e) {
          console.warn('Could not list available services:', e);
        }
        
        await server.disconnect();
        const errorMsg = `Service not found. Your device may not support ${deviceType}.${availableServices.length > 0 ? ` Available services: ${availableServices.join(', ')}` : ''}`;
        throw new Error(errorMsg);
      }

      // Register data callback
      if (onData) {
        this.dataCallbacks.set(deviceType, onData);
      }

      // Start notifications for characteristic updates
      // For bikeTrainer, try to find appropriate characteristics based on found service
      let characteristicsToTry = [];
      
      if (deviceType === 'bikeTrainer') {
        // Check which service we found
        const serviceUUID = service.uuid;
        
        if (serviceUUID === '00001826-0000-1000-8000-00805f9b34fb') {
          // Cycling Power Service - use power measurement characteristic
          characteristicsToTry = [
            { uuid: '00002a63-0000-1000-8000-00805f9b34fb', type: 'power' } // Cycling Power Measurement
          ];
        } else if (serviceUUID === '00001816-0000-1000-8000-00805f9b34fb') {
          // Cycling Speed and Cadence Service - use CSC measurement characteristic
          characteristicsToTry = [
            { uuid: '00002a5b-0000-1000-8000-00805f9b34fb', type: 'csc' } // CSC Measurement
          ];
        } else {
          // Try default characteristics from config
          characteristicsToTry = (deviceService.characteristics || []).map(c => ({ ...c, type: 'default' }));
        }
      } else {
        // For other device types, use configured characteristics
        characteristicsToTry = (deviceService.characteristics || []).map(c => ({ ...c, type: 'default' }));
      }
      
      // If no characteristics found, try to discover available characteristics
      if (characteristicsToTry.length === 0) {
        try {
          const characteristics = await service.getCharacteristics();
          console.log(`Found ${characteristics.length} characteristics in service ${service.uuid}`);
          for (const char of characteristics) {
            characteristicsToTry.push({ uuid: char.uuid, type: 'discovered' });
          }
        } catch (error) {
          console.warn('Could not discover characteristics:', error);
        }
      }
      
      let notificationStarted = false;
      for (const charInfo of characteristicsToTry) {
        try {
          const characteristic = await service.getCharacteristic(charInfo.uuid);
          await characteristic.startNotifications();
          
          characteristic.addEventListener('characteristicvaluechanged', (event) => {
            try {
              // Pass the characteristic type to parser
              const data = this.parseCharacteristicData(deviceType, event.target.value, charInfo.type);
              if (onData) {
                onData(data);
              }
            } catch (error) {
              console.error(`Error parsing data from ${deviceType}:`, error);
            }
          });
          
          console.log(`Successfully started notifications for characteristic ${charInfo.uuid}`);
          notificationStarted = true;
        } catch (error) {
          console.warn(`Could not start notifications for characteristic ${charInfo.uuid}:`, error);
          // Continue with other characteristics
        }
      }
      
      if (!notificationStarted && characteristicsToTry.length > 0) {
        console.warn('No characteristics could be started for notifications. Device may not support data streaming.');
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
        this.cscPreviousValues.delete(deviceType); // Clear CSC tracking data
        return true;
      } catch (error) {
        console.error(`Error disconnecting ${deviceType}:`, error);
        // Still clean up local state
        this.connections.delete(deviceType);
        this.dataCallbacks.delete(deviceType);
        this.cscPreviousValues.delete(deviceType); // Clear CSC tracking data
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
        optionalServices: [
          'battery_service', 
          '0000180f-0000-1000-8000-00805f9b34fb',
          '00001816-0000-1000-8000-00805f9b34fb' // Cycling Speed and Cadence Service (for control)
        ],
        characteristics: [
          { uuid: '00002a63-0000-1000-8000-00805f9b34fb' } // Cycling Power Measurement
        ],
        controlServiceUUID: '00001816-0000-1000-8000-00805f9b34fb', // Cycling Speed and Cadence Service
        controlCharacteristicUUID: '00002a5b-0000-1000-8000-00805f9b34fb' // CSC Control Point (for Tacx/Wahoo ergo mode)
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
   * @param {string} deviceType - Type of device
   * @param {DataView} dataView - Data view from characteristic
   * @param {string} charType - Type of characteristic ('power', 'csc', 'default', etc.)
   */
  parseCharacteristicData(deviceType, dataView, charType = 'default') {
    try {
      switch (deviceType) {
        case 'bikeTrainer':
          if (charType === 'csc') {
            // Parse Cycling Speed and Cadence (CSC) Measurement - Bluetooth SIG standard
            // Format: [Flags (1 byte), Cumulative Wheel Revolutions (4 bytes, optional), Last Wheel Event Time (2 bytes, optional), Cumulative Crank Revolutions (2 bytes, optional), Last Crank Event Time (2 bytes, optional)]
            if (dataView.byteLength < 1) {
              console.warn('CSC data too short');
              return {};
            }
            
            const flagsCSC = dataView.getUint8(0);
            const wheelRevPresent = flagsCSC & 0x01;
            const crankRevPresent = flagsCSC & 0x02;
            
            let wheelRevolutions = null;
            let lastWheelTime = null;
            let crankRevolutions = null;
            let lastCrankTime = null;
            let offset = 1;
            
            // Wheel revolutions data (if present)
            if (wheelRevPresent && dataView.byteLength >= offset + 6) {
              wheelRevolutions = dataView.getUint32(offset, true);
              lastWheelTime = dataView.getUint16(offset + 4, true);
              offset += 6;
            }
            
            // Crank revolutions data (if present)
            if (crankRevPresent && dataView.byteLength >= offset + 4) {
              crankRevolutions = dataView.getUint16(offset, true);
              lastCrankTime = dataView.getUint16(offset + 2, true);
            }
            
            // Calculate speed and cadence from deltas
            const prev = this.cscPreviousValues.get('bikeTrainer');
            const now = Date.now();
            let speed = null;
            let cadence = null;
            let power = null; // Power not available from CSC, would need power meter
            
            // Calculate speed from wheel revolutions (assuming standard wheel circumference)
            if (wheelRevPresent && prev && prev.wheelRevolutions !== null && prev.lastWheelTime !== null && 
                wheelRevolutions !== null && lastWheelTime !== null) {
              // Handle rollover for wheel revolutions (32-bit, max 4294967295)
              let wheelDelta = wheelRevolutions - prev.wheelRevolutions;
              if (wheelDelta < 0) {
                wheelDelta += 4294967296; // Rollover handling
              }
              
              // Handle rollover for time (lastWheelTime is in 1/1024 seconds, max 65535)
              let timeDelta = lastWheelTime - prev.lastWheelTime;
              if (timeDelta < 0) {
                timeDelta += 65536; // Rollover handling
              }
              const timeDeltaSeconds = timeDelta / 1024.0;
              
              if (timeDeltaSeconds > 0 && wheelDelta > 0) {
                // Standard wheel circumference: ~2.1m for 700c wheel
                const wheelCircumference = 2.1; // meters
                const speed_ms = (wheelDelta * wheelCircumference) / timeDeltaSeconds;
                speed = speed_ms * 3.6; // Convert to km/h
              }
            }
            
            // Calculate cadence from crank revolutions
            if (crankRevPresent && prev && prev.crankRevolutions !== null && prev.lastCrankTime !== null &&
                crankRevolutions !== null && lastCrankTime !== null) {
              // Handle rollover for crank revolutions (16-bit, max 65535)
              let crankDelta = crankRevolutions - prev.crankRevolutions;
              if (crankDelta < 0) {
                crankDelta += 65536; // Rollover handling
              }
              
              // Handle rollover for time (lastCrankTime is in 1/1024 seconds, max 65535)
              let timeDelta = lastCrankTime - prev.lastCrankTime;
              if (timeDelta < 0) {
                timeDelta += 65536; // Rollover handling
              }
              const timeDeltaSeconds = timeDelta / 1024.0;
              
              if (timeDeltaSeconds > 0 && crankDelta > 0) {
                cadence = (crankDelta / timeDeltaSeconds) * 60; // Convert to RPM
              }
            }
            
            // Store current values for next calculation
            this.cscPreviousValues.set('bikeTrainer', {
              wheelRevolutions,
              lastWheelTime,
              crankRevolutions,
              lastCrankTime,
              timestamp: now
            });
            
            return {
              speed, // km/h
              cadence, // RPM
              power, // null - not available from CSC
              wheelRevolutions,
              lastWheelTime,
              crankRevolutions,
              lastCrankTime
            };
          } else {
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
          }

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

