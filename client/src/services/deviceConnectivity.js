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
    // Track previous Power Service values for calculating cadence
    this.powerPreviousValues = new Map(); // deviceType -> { crankRevolutions, lastCrankTime, timestamp }
    // Queue for GATT operations to prevent "operation already in progress" errors
    this.gattOperationQueue = new Map(); // deviceType -> Promise queue
    // Combined data for bikeTrainer (combines CPS and CSC data)
    this.combinedTrainerData = {}; // Stores combined power, cadence, speed from multiple characteristics
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
        // For bikeTrainer, ensure we request CPS and FTMS services for power reading
        let optionalServices = deviceService.optionalServices || [];
        if (deviceType === 'bikeTrainer') {
          // Add Cycling Power Service (CPS) and FTMS if not already present
          const requiredServices = [
            '00001816-0000-1000-8000-00805f9b34fb', // CSCS - speed/cadence + FE-C control point
            '00001818-0000-1000-8000-00805f9b34fb', // CPS - Cycling Power Service (watts)
            '00001826-0000-1000-8000-00805f9b34fb', // FTMS - Fitness Machine Service (alternative power source)
            '0000180a-0000-1000-8000-00805f9b34fb'  // Device Information (optional)
          ];
          // Merge with existing optionalServices, avoiding duplicates
          optionalServices = [...new Set([...optionalServices, ...requiredServices])];
        }
        
        device = await navigator.bluetooth.requestDevice({
          filters: deviceService.filters,
          optionalServices: optionalServices
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
        this.powerPreviousValues.delete(deviceType); // Clear Power Service tracking data
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
      let powerService = null;
      let cscService = null;
      
      // For bikeTrainer, try to connect to both Power Service and CSC Service simultaneously
      if (deviceType === 'bikeTrainer') {
        // First, get all available services for diagnostics
        let availableServices = [];
        try {
          const allServices = await server.getPrimaryServices();
          availableServices = allServices.map(s => s.uuid);
          console.log('All available services on device:', availableServices);
        } catch (e) {
          console.warn('Could not list available services:', e);
        }
        
        // Try to get Cycling Power Service (CPS) - UUID 0x1818
        try {
          powerService = await server.getPrimaryService('00001818-0000-1000-8000-00805f9b34fb'); // Cycling Power Service (CPS)
          console.log('Found Cycling Power Service (CPS)');
        } catch (error) {
          console.warn('Cycling Power Service (CPS) not found, trying FTMS...');
          // Try FTMS as alternative
          try {
            powerService = await server.getPrimaryService('00001826-0000-1000-8000-00805f9b34fb'); // FTMS
            console.log('Found FTMS (Fitness Machine Service)');
          } catch (error2) {
            console.warn('FTMS also not found. Power data will not be available via Bluetooth.');
          }
        }
        
        try {
          cscService = await server.getPrimaryService('00001816-0000-1000-8000-00805f9b34fb'); // Cycling Speed and Cadence Service
          console.log('Found Cycling Speed and Cadence Service');
        } catch (error) {
          console.warn('Cycling Speed and Cadence Service not found');
        }
        
        // Use Power Service as primary if available, otherwise use CSC Service
        service = powerService || cscService;
        
        if (!service) {
          await server.disconnect();
          const errorMsg = `No compatible service found. Your device may not support ${deviceType}.${availableServices.length > 0 ? ` Available services: ${availableServices.join(', ')}` : ''}`;
          throw new Error(errorMsg);
        }
        
        // Warn if power is not available
        if (!powerService && cscService) {
          console.warn('⚠️ Power data is not available via Bluetooth. This Tacx trainer only provides speed and cadence through CSC Service. Power may need to be calculated from speed/resistance or obtained from a separate power meter.');
        }
      } else {
        // For other device types, use standard service lookup
        const serviceUUIDs = [deviceService.serviceUUID];
        if (deviceService.optionalServices) {
          serviceUUIDs.push(...deviceService.optionalServices.filter(s => typeof s === 'string'));
        }
        
        for (const uuid of serviceUUIDs) {
          try {
            service = await server.getPrimaryService(uuid);
            console.log(`Found service: ${uuid} for ${deviceType}`);
            break;
          } catch (error) {
            console.warn(`Service ${uuid} not found, trying next...`);
            continue;
          }
        }
        
        if (!service) {
          await server.disconnect();
          throw new Error(`Service not found. Your device may not support ${deviceType}.`);
        }
      }

      // Register data callback
      if (onData) {
        this.dataCallbacks.set(deviceType, onData);
      }

      // Start notifications for characteristic updates
      // For bikeTrainer, try to connect to both Power and CSC services if available
      let characteristicsToTry = [];
      
      if (deviceType === 'bikeTrainer') {
        // If we have Power Service (CPS), connect to Cycling Power Measurement
        if (powerService) {
          const powerServiceUUID = powerService.uuid;
          if (powerServiceUUID === '00001818-0000-1000-8000-00805f9b34fb') {
            // Cycling Power Service (CPS) - use Cycling Power Measurement characteristic
            characteristicsToTry.push({
              uuid: '00002a63-0000-1000-8000-00805f9b34fb', // Cycling Power Measurement
              type: 'power',
              service: powerService
            });
          } else if (powerServiceUUID === '00001826-0000-1000-8000-00805f9b34fb') {
            // FTMS - use Fitness Machine Status/Measurement characteristic
            characteristicsToTry.push({
              uuid: '00002ad9-0000-1000-8000-00805f9b34fb', // FTMS Measurement
              type: 'ftms',
              service: powerService
            });
          }
        }
        
        // If we have CSC Service, connect to CSC Measurement
        if (cscService) {
          characteristicsToTry.push({
            uuid: '00002a5b-0000-1000-8000-00805f9b34fb', // CSC Measurement
            type: 'csc',
            service: cscService
          });
        }
        
        // If no services found, try default
        if (characteristicsToTry.length === 0) {
          const serviceUUID = service.uuid;
          if (serviceUUID === '00001818-0000-1000-8000-00805f9b34fb' || serviceUUID === '00001826-0000-1000-8000-00805f9b34fb') {
            characteristicsToTry.push({
              uuid: serviceUUID === '00001818-0000-1000-8000-00805f9b34fb' 
                ? '00002a63-0000-1000-8000-00805f9b34fb'  // CPS Power Measurement
                : '00002ad9-0000-1000-8000-00805f9b34fb', // FTMS Measurement
              type: serviceUUID === '00001818-0000-1000-8000-00805f9b34fb' ? 'power' : 'ftms',
              service: service
            });
          } else if (serviceUUID === '00001816-0000-1000-8000-00805f9b34fb') {
            characteristicsToTry.push({
              uuid: '00002a5b-0000-1000-8000-00805f9b34fb',
              type: 'csc',
              service: service
            });
          }
        }
      } else {
        // For other device types, use configured characteristics
        characteristicsToTry = (deviceService.characteristics || []).map(c => ({
          ...c,
          type: 'default',
          service: service
        }));
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
      
      // Initialize combined data for bikeTrainer if needed
      if (deviceType === 'bikeTrainer') {
        this.combinedTrainerData = { power: null, cadence: null, speed: null };
      }
      
      let notificationStarted = false;
      for (const charInfo of characteristicsToTry) {
        try {
          const charService = charInfo.service || service;
          const characteristic = await charService.getCharacteristic(charInfo.uuid);
          await characteristic.startNotifications();
          
          characteristic.addEventListener('characteristicvaluechanged', (event) => {
            try {
              // Pass the characteristic type to parser
              const data = this.parseCharacteristicData(deviceType, event.target.value, charInfo.type);
              
              // For bikeTrainer, combine data from multiple characteristics
              if (deviceType === 'bikeTrainer') {
                // Initialize if not exists
                if (!this.combinedTrainerData) {
                  this.combinedTrainerData = { power: null, cadence: null, speed: null };
                }
                
                if (charInfo.type === 'power' || charInfo.type === 'ftms') {
                  // Update power and cadence from Power Service (CPS) or FTMS
                  if (data.power !== undefined && data.power !== null) {
                    this.combinedTrainerData.power = data.power;
                  }
                  if (data.cadence !== undefined && data.cadence !== null) {
                    this.combinedTrainerData.cadence = data.cadence;
                  }
                } else if (charInfo.type === 'csc') {
                  // Update speed and cadence from CSC Service
                  if (data.speed !== undefined && data.speed !== null) {
                    this.combinedTrainerData.speed = data.speed;
                  }
                  if (data.cadence !== undefined && data.cadence !== null) {
                    this.combinedTrainerData.cadence = data.cadence;
                  }
                }
                
                // Send combined data every time we get an update
                if (onData) {
                  const dataToSend = { ...this.combinedTrainerData };
                  // Debug logging - log more frequently to help debug
                  if (Math.random() < 0.1) { // Log ~10% of updates
                    console.log(`[deviceConnectivity] 📡 Sending combined bikeTrainer data:`, dataToSend);
                  }
                  onData(dataToSend);
                }
              } else {
                // For other devices, send data directly
                if (onData) {
                  onData(data);
                }
              }
            } catch (error) {
              console.error(`Error parsing data from ${deviceType}:`, error);
            }
          });
          
          console.log(`Successfully started notifications for characteristic ${charInfo.uuid} (type: ${charInfo.type})`);
          notificationStarted = true;
        } catch (error) {
          console.warn(`Could not start notifications for characteristic ${charInfo.uuid}:`, error);
          // Continue with other characteristics
        }
      }
      
      if (!notificationStarted && characteristicsToTry.length > 0) {
        console.warn('No characteristics could be started for notifications. Device may not support data streaming.');
      }

      // Store connection info - for bikeTrainer, store both services if available
      const connectionInfo = { device, server, service };
      if (deviceType === 'bikeTrainer') {
        if (powerService) connectionInfo.powerService = powerService;
        if (cscService) {
          connectionInfo.cscService = cscService;
          // Try to get CSC Control Point for FE-C control
          // Control Point UUID is different from Measurement UUID
          try {
            const controlPoint = await cscService.getCharacteristic('00002a55-0000-1000-8000-00805f9b34fb');
            connectionInfo.controlPoint = controlPoint;
            connectionInfo.controlPointType = 'csc';
            connectionInfo.targetPower = null; // Track target power for verification
            connectionInfo.lastPowerSetTime = null; // Track when power was last set
            console.log('Found CSC Control Point for FE-C control');
            
            // Try to enable notifications on Control Point to receive responses
            // Note: Not all trainers support notifications on Control Point
            try {
              // Check if Control Point supports notifications
              const properties = controlPoint.properties;
              if (properties.notify || properties.indicate) {
                await controlPoint.startNotifications();
                controlPoint.addEventListener('characteristicvaluechanged', (event) => {
                  const value = event.target.value;
                  if (value && value.byteLength > 0) {
                    const dataView = new DataView(value.buffer);
                    const opcode = dataView.getUint8(0);
                    console.log(`[FE-C Control Point Response] Opcode: 0x${opcode.toString(16).padStart(2, '0')}, Data:`, Array.from(new Uint8Array(value.buffer)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                    
                    // Parse response based on opcode
                    if (opcode === 0x01) {
                      // Response to Set Target Power
                      if (dataView.byteLength >= 6) {
                        const responsePower = dataView.getUint16(4, true) / 10; // Power in 0.1W units
                        console.log(`[FE-C Control Point] Power set confirmed: ${responsePower}W`);
                        if (connectionInfo.targetPower !== null) {
                          const diff = Math.abs(responsePower - connectionInfo.targetPower);
                          if (diff < 5) { // Within 5W tolerance
                            console.log(`✅ Power successfully set to ${responsePower}W (target: ${connectionInfo.targetPower}W)`);
                          } else {
                            console.warn(`⚠️ Power set to ${responsePower}W but target was ${connectionInfo.targetPower}W`);
                          }
                        }
                      }
                    } else if (opcode === 0x05) {
                      // Response to Set Training Mode
                      if (dataView.byteLength >= 5) {
                        const mode = dataView.getUint8(4);
                        console.log(`[FE-C Control Point] Training mode set confirmed: 0x${mode.toString(16)}`);
                        if (mode === 0x04) {
                          console.log('✅ ERGO mode confirmed by trainer');
                        }
                      }
                    } else if (opcode === 0x00) {
                      // Response to Request Control
                      console.log(`[FE-C Control Point] Control request response received`);
                    }
                  }
                });
                console.log('✅ Started notifications on Control Point for response monitoring');
              } else {
                console.log('ℹ️ Control Point does not support notifications - responses will not be available');
              }
            } catch (notifError) {
              console.warn('⚠️ Could not start notifications on Control Point (responses may not be available):', notifError);
            }
          } catch (error) {
            console.warn('CSC Control Point not found - ERGO mode control may not be available:', error);
            // Some trainers might use a different UUID, try alternative
            try {
              const controlPoint = await cscService.getCharacteristic('00002a5b-0000-1000-8000-00805f9b34fb');
              connectionInfo.controlPoint = controlPoint;
              connectionInfo.controlPointType = 'csc-alt';
              connectionInfo.targetPower = null;
              connectionInfo.lastPowerSetTime = null;
              console.log('Found alternative Control Point for FE-C control');
            } catch (error2) {
              console.warn('Alternative Control Point also not found:', error2);
            }
          }
        }
        
        // Also try FTMS Control Point if FTMS service is available
        if (powerService && powerService.uuid === '00001826-0000-1000-8000-00805f9b34fb') {
          try {
            const ftmsControlPoint = await powerService.getCharacteristic('00002ad9-0000-1000-8000-00805f9b34fb');
            // Check if it supports write (control)
            const properties = ftmsControlPoint.properties;
            if (properties.write || properties.writeWithoutResponse) {
              connectionInfo.ftmsControlPoint = ftmsControlPoint;
              connectionInfo.controlPointType = 'ftms';
              console.log('Found FTMS Control Point for trainer control');
            }
          } catch (error) {
            console.warn('FTMS Control Point not found:', error);
          }
        }
      }
      this.connections.set(deviceType, connectionInfo);
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
        this.powerPreviousValues.delete(deviceType); // Clear Power Service tracking data
        return true;
      } catch (error) {
        console.error(`Error disconnecting ${deviceType}:`, error);
        // Still clean up local state
        this.connections.delete(deviceType);
        this.dataCallbacks.delete(deviceType);
        this.cscPreviousValues.delete(deviceType); // Clear CSC tracking data
        this.powerPreviousValues.delete(deviceType); // Clear Power Service tracking data
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
              
              // Sanity check: timeDeltaSeconds should be reasonable (between 0.01s and 10s)
              // If it's too large or too small, skip this calculation
              if (timeDeltaSeconds > 0.01 && timeDeltaSeconds < 10.0 && wheelDelta > 0) {
                // Standard wheel circumference: ~2.1m for 700c wheel
                const wheelCircumference = 2.1; // meters
                const speed_ms = (wheelDelta * wheelCircumference) / timeDeltaSeconds;
                speed = speed_ms * 3.6; // Convert to km/h
                
                // Sanity check: speed should be reasonable (0-100 km/h for bike trainer)
                if (speed < 0 || speed > 100) {
                  console.warn(`[CSC] Invalid speed calculated: ${speed} km/h (wheelDelta: ${wheelDelta}, timeDelta: ${timeDeltaSeconds}s)`);
                  speed = null; // Don't use invalid speed
                }
              } else {
                // Invalid time delta, skip speed calculation
                if (timeDeltaSeconds <= 0.01 || timeDeltaSeconds >= 10.0) {
                  console.warn(`[CSC] Invalid timeDelta: ${timeDeltaSeconds}s, skipping speed calculation`);
                }
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
              
              // Sanity check: timeDeltaSeconds should be reasonable (between 0.01s and 10s)
              if (timeDeltaSeconds > 0.01 && timeDeltaSeconds < 10.0 && crankDelta > 0) {
                cadence = (crankDelta / timeDeltaSeconds) * 60; // Convert to RPM
                
                // Sanity check: cadence should be reasonable (0-200 RPM)
                if (cadence < 0 || cadence > 200) {
                  console.warn(`[CSC] Invalid cadence calculated: ${cadence} RPM (crankDelta: ${crankDelta}, timeDelta: ${timeDeltaSeconds}s)`);
                  cadence = null; // Don't use invalid cadence
                }
              } else {
                // Invalid time delta, skip cadence calculation
                if (timeDeltaSeconds <= 0.01 || timeDeltaSeconds >= 10.0) {
                  console.warn(`[CSC] Invalid timeDelta: ${timeDeltaSeconds}s, skipping cadence calculation`);
                }
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
          } else if (charType === 'ftms') {
            // Parse FTMS (Fitness Machine Service) Measurement
            // Format varies, but typically includes instantaneous power
            if (dataView.byteLength < 4) {
              console.warn('FTMS data too short');
              return {};
            }
            
            // FTMS Measurement format: [Flags (2 bytes), ...]
            // Instantaneous power is typically at offset 2-3 (Int16 LE) or later depending on flags
            // This is a simplified parser - full FTMS spec is more complex
            let instantPower = null;
            if (dataView.byteLength >= 4) {
              // Try to read power from common FTMS positions
              // Position 2-3 is often instantaneous power (Int16 LE)
              instantPower = dataView.getInt16(2, true);
              if (instantPower < 0 || instantPower > 2000) {
                // If value seems invalid, try other positions
                if (dataView.byteLength >= 6) {
                  instantPower = dataView.getInt16(4, true);
                }
              }
            }
            
            return { power: instantPower, cadence: null };
          } else {
            // Parse Cycling Power Measurement (CPM) - Bluetooth SIG standard
            // Format: [Flags (2 bytes), Instantaneous Power (2 bytes, Int16 LE, in W), ...]
            if (dataView.byteLength < 4) {
              console.warn('Power data too short');
              return {};
            }
            
            const flags = dataView.getUint16(0, true);
            // Instantaneous Power is Int16 (signed) at offset 2, little-endian, in watts
            const instantPower = dataView.getInt16(2, true);
            
            // Log power for debugging (log more frequently to help verify power setting)
            // Log every 10th reading or if power changed significantly
            const connection = this.connections.get('bikeTrainer');
            const lastLoggedPower = connection?.lastLoggedPower || null;
            const shouldLog = !lastLoggedPower || 
                             Math.abs(instantPower - lastLoggedPower) > 10 || 
                             (connection?.logCounter || 0) % 10 === 0;
            
            if (shouldLog) {
              console.log(`[CPS] Power: ${instantPower}W, Flags: 0x${flags.toString(16)}`);
              if (connection) {
                connection.lastLoggedPower = instantPower;
                connection.logCounter = (connection.logCounter || 0) + 1;
                
                // Check if power matches target (if set recently)
                if (connection.targetPower !== null && connection.lastPowerSetTime !== null) {
                  const timeSinceSet = Date.now() - connection.lastPowerSetTime;
                  // Check within 5 seconds of setting power
                  if (timeSinceSet < 5000) {
                    const diff = Math.abs(instantPower - connection.targetPower);
                    const tolerance = 30; // 30W tolerance (trainer needs time to adjust)
                    if (diff <= tolerance) {
                      console.log(`✅ Power verification: Actual ${instantPower}W matches target ${connection.targetPower}W (within ${tolerance}W, ${(timeSinceSet/1000).toFixed(1)}s after set)`);
                    } else if (timeSinceSet > 2000) {
                      // Only warn after 2 seconds (give trainer time to adjust)
                      console.warn(`⚠️ Power verification: Actual ${instantPower}W differs from target ${connection.targetPower}W by ${diff}W (${(timeSinceSet/1000).toFixed(1)}s after set)`);
                    }
                  }
                }
              }
            }
            
            let cadence = null;
            let offset = 4;
            
            // If wheel revolutions present
            if (flags & 0x10 && dataView.byteLength >= offset + 6) {
              offset += 6; // 4 bytes cumulative + 2 bytes last event time
            }
            
            // If crank revolutions present (for cadence)
            if (flags & 0x20 && dataView.byteLength >= offset + 4) {
              const crankRevolutions = dataView.getUint16(offset, true);
              const lastCrankEventTime = dataView.getUint16(offset + 2, true);
              
              // Calculate cadence from delta of crank revolutions over time
              const prev = this.powerPreviousValues.get('bikeTrainer');
              const now = Date.now();
              
              if (prev && prev.crankRevolutions !== null && prev.lastCrankTime !== null) {
                // Handle rollover for crank revolutions (16-bit, max 65535)
                let crankDelta = crankRevolutions - prev.crankRevolutions;
                if (crankDelta < 0) {
                  crankDelta += 65536; // Rollover handling
                }
                
                // Handle rollover for time (lastCrankEventTime is in 1/1024 seconds, max 65535)
                let timeDelta = lastCrankEventTime - prev.lastCrankTime;
                if (timeDelta < 0) {
                  timeDelta += 65536; // Rollover handling
                }
                const timeDeltaSeconds = timeDelta / 1024.0;
                
                if (timeDeltaSeconds > 0 && crankDelta > 0) {
                  cadence = (crankDelta / timeDeltaSeconds) * 60; // Convert to RPM
                }
              }
              
              // Store current values for next calculation
              this.powerPreviousValues.set('bikeTrainer', {
                crankRevolutions,
                lastCrankTime: lastCrankEventTime,
                timestamp: now
              });
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

  /**
   * Queue GATT operation to prevent "operation already in progress" errors
   * @param {string} deviceType - Device type
   * @param {Function} operation - Async function to execute
   * @returns {Promise} - Result of operation
   */
  async queueGattOperation(deviceType, operation) {
    // Get or create queue for this device
    if (!this.gattOperationQueue.has(deviceType)) {
      this.gattOperationQueue.set(deviceType, Promise.resolve());
    }
    
    // Chain the new operation after the previous one
    const queue = this.gattOperationQueue.get(deviceType);
    const newOperation = queue.then(() => operation()).catch(err => {
      console.error(`GATT operation failed for ${deviceType}:`, err);
      throw err;
    });
    
    this.gattOperationQueue.set(deviceType, newOperation);
    return newOperation;
  }

  /**
   * Set target power on trainer (ERGO mode) using FE-C protocol
   * @param {string} deviceType - Type of device (should be 'bikeTrainer')
   * @param {number} powerWatts - Target power in watts
   * @returns {Promise<boolean>} - Success status
   */
  async setPower(deviceType, powerWatts) {
    return this.queueGattOperation(deviceType, async () => {
      const connection = this.connections.get(deviceType);
      if (!connection) {
        throw new Error(`Device ${deviceType} is not connected`);
      }

      if (deviceType !== 'bikeTrainer') {
        throw new Error('setPower is only available for bikeTrainer devices');
      }

      // Check if we have control point for FE-C
      if (!connection.controlPoint) {
        // Try to get control point if we have CSC service
        if (connection.cscService) {
          try {
            // Try standard Control Point UUID first
            connection.controlPoint = await connection.cscService.getCharacteristic('00002a55-0000-1000-8000-00805f9b34fb');
            console.log('Found CSC Control Point for FE-C control');
          } catch (error) {
            // Try alternative UUID (some trainers use Measurement UUID for control)
            try {
              connection.controlPoint = await connection.cscService.getCharacteristic('00002a5b-0000-1000-8000-00805f9b34fb');
              console.log('Found alternative Control Point for FE-C control');
            } catch (error2) {
              throw new Error('CSC Control Point not available - cannot set power. Make sure your trainer supports FE-C protocol.');
            }
          }
        } else {
          throw new Error('CSC Service not available - cannot set power. Make sure your trainer supports FE-C protocol.');
        }
      }

      try {
        // FE-C protocol for Tacx trainers:
        // 1. Request Control (opcode 0x00) - some trainers need this first
        // 2. Set Training Mode to ERGO (opcode 0x05, value 0x04) - optional but recommended
        // 3. Set Target Power (opcode 0x01)
        
        // Step 1: Request Control (if not already done)
        if (!connection.controlRequested) {
          try {
            const requestControl = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            console.log('[FE-C] Sending Request Control command...');
            await connection.controlPoint.writeValue(requestControl);
            await new Promise(resolve => setTimeout(resolve, 300)); // Wait longer for response
            connection.controlRequested = true;
            console.log('✅ Requested control from trainer');
          } catch (e) {
            // Request control might not be needed or might fail - continue anyway
            console.warn('⚠️ Request control skipped or failed:', e.message);
            connection.controlRequested = true; // Mark as attempted
          }
        }

        // Step 2: Set Training Mode to ERGO (0x04 = ERGO mode)
        // Opcode 0x05 = Set Training Mode
        // Always set ERGO mode before setting power to ensure trainer is in correct mode
        // Set ERGO mode every time (don't check flag) to ensure trainer is in correct mode
        try {
          const setErgoMode = new Uint8Array([
            0x05,        // Opcode: Set Training Mode
            0x00,        // Reserved
            0x00,        // Reserved
            0x00,        // Reserved
            0x04,        // Training Mode: 0x04 = ERGO mode
            0x00         // Reserved
          ]);
          console.log('[FE-C] Sending Set Training Mode to ERGO command...');
          console.log('[FE-C] Command bytes:', Array.from(setErgoMode).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
          await connection.controlPoint.writeValue(setErgoMode);
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait longer for response
          connection.ergoModeSet = true;
          console.log('✅ Set training mode to ERGO');
        } catch (e) {
          // Setting training mode might not be needed - continue
          console.warn('⚠️ Set training mode skipped or failed:', e.message);
          connection.ergoModeSet = true; // Mark as attempted
        }

        // Step 3: Set Target Power
        // FE-C Set Target Power command format:
        // [Opcode (1 byte), Reserved (3 bytes), Power (2 bytes, little-endian, in 0.1W units)]
        // Opcode 0x01 = Set Target Power (ERGO mode)
        const powerInTenths = Math.round(powerWatts * 10); // Convert to 0.1W units
        const powerLow = powerInTenths & 0xFF;
        const powerHigh = (powerInTenths >> 8) & 0xFF;

        const command = new Uint8Array([
          0x01,        // Opcode: Set Target Power (ERGO mode)
          0x00,        // Reserved
          0x00,        // Reserved
          0x00,        // Reserved
          powerLow,    // Power low byte (0.1W units)
          powerHigh    // Power high byte (0.1W units)
        ]);

        // Store target power for verification
        connection.targetPower = powerWatts;
        connection.lastPowerSetTime = Date.now();
        
        console.log('[FE-C] Sending Set Target Power command...');
        console.log('[FE-C] Target power:', powerWatts, 'W =', powerInTenths, 'x 0.1W');
        console.log('[FE-C] Command bytes:', Array.from(command).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        console.log('[FE-C] Power bytes: Low=', '0x' + powerLow.toString(16).padStart(2, '0'), 'High=', '0x' + powerHigh.toString(16).padStart(2, '0'));
        
        await connection.controlPoint.writeValue(command);
        await new Promise(resolve => setTimeout(resolve, 600)); // Wait longer for command to process
        
        // Step 4: Re-confirm ERGO mode after setting power (some trainers need this)
        try {
          await new Promise(resolve => setTimeout(resolve, 200));
          const reconfirmErgo = new Uint8Array([0x05, 0x00, 0x00, 0x00, 0x04, 0x00]);
          await connection.controlPoint.writeValue(reconfirmErgo);
          await new Promise(resolve => setTimeout(resolve, 300));
          console.log('[FE-C] ✅ Re-confirmed ERGO mode after setting power');
        } catch (e) {
          console.warn('[FE-C] ⚠️ Re-confirm ERGO mode failed (non-critical):', e.message);
        }
        
        console.log(`✅ Set target power to ${powerWatts}W (${powerInTenths} x 0.1W) on trainer`);
        
        // Power verification will be done in CPS data handler (see parseCharacteristicData)
        // This allows real-time monitoring as power data comes in
        
        return true;
      } catch (error) {
        console.error(`Error setting power on trainer:`, error);
        // If it's a "GATT operation already in progress" error, wait and retry once
        if (error.message && error.message.includes('already in progress')) {
          console.log('GATT operation in progress, waiting and retrying...');
          await new Promise(resolve => setTimeout(resolve, 300));
          try {
            const powerInTenths = Math.round(powerWatts * 10);
            const powerLow = powerInTenths & 0xFF;
            const powerHigh = (powerInTenths >> 8) & 0xFF;
            const command = new Uint8Array([0x01, 0x00, 0x00, 0x00, powerLow, powerHigh]);
            await connection.controlPoint.writeValue(command);
            console.log(`Retry: Set target power to ${powerWatts}W on trainer`);
            return true;
          } catch (retryError) {
            throw new Error(`Failed to set power after retry: ${retryError.message}`);
          }
        }
        throw new Error(`Failed to set power: ${error.message}`);
      }
    });
  }

  /**
   * Get target power that was set on trainer
   * @param {string} deviceType - Type of device (should be 'bikeTrainer')
   * @returns {number|null} - Target power in watts, or null if not set
   */
  getTargetPower(deviceType) {
    const connection = this.connections.get(deviceType);
    return connection?.targetPower || null;
  }
  
  /**
   * Request current power from trainer (if available via FE-C or Power Service)
   * @param {string} deviceType - Type of device (should be 'bikeTrainer')
   * @returns {Promise<number|null>} - Current power in watts, or null if not available
   */
  async getCurrentPower(deviceType) {
    const connection = this.connections.get(deviceType);
    if (!connection) {
      return null;
    }

    // If we have Power Service, power should be coming through notifications
    // This method is mainly for requesting power if needed
    // For now, return null and rely on notification data
    return null;
  }

  /**
   * Check if trainer supports ERGO mode control (FE-C)
   * @param {string} deviceType - Type of device (should be 'bikeTrainer')
   * @returns {boolean} - True if ERGO mode is supported
   */
  supportsErgoMode(deviceType) {
    const connection = this.connections.get(deviceType);
    return !!(connection && connection.controlPoint);
  }
}

// Export singleton instance
const deviceConnectivityService = new DeviceConnectivityService();
export default deviceConnectivityService;

