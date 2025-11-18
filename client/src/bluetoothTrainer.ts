// src/bluetoothTrainer.ts

export type TrainerSample = {
  t: number;         // čas od startu v sekundách
  power: number | null;
  speed: number | null;
  cadence: number | null;
};

let startTimestamp: number | null = null;
let onSampleCallback: ((sample: TrainerSample) => void) | null = null;

let lastPower: number | null = null;
let lastSpeed: number | null = null;
let lastCadence: number | null = null;

// GATT objekty
let server: BluetoothRemoteGATTServer | null = null;
let cscMeasurementChar: BluetoothRemoteGATTCharacteristic | null = null;
let powerMeasurementChar: BluetoothRemoteGATTCharacteristic | null = null;
let controlPointChar: BluetoothRemoteGATTCharacteristic | null = null;

// Track previous CSC values for calculating speed and cadence
let cscPreviousValues: {
  wheelRevolutions: number | null;
  lastWheelTime: number | null;
  crankRevolutions: number | null;
  lastCrankTime: number | null;
  timestamp: number;
} | null = null;

// Track target power for verification
let targetPower: number | null = null;
let lastPowerSetTime: number | null = null;
let controlRequested: boolean = false;
let ergoModeSet: boolean = false;

function nowSecondsFromStart(): number {
  if (startTimestamp === null) {
    startTimestamp = performance.now();
  }
  return (performance.now() - startTimestamp) / 1000;
}

function emitSample() {
  if (!onSampleCallback) return;
  const t = nowSecondsFromStart();
  onSampleCallback({
    t,
    power: lastPower,
    speed: lastSpeed,
    cadence: lastCadence,
  });
}

export function setOnSampleCallback(cb: (sample: TrainerSample) => void) {
  onSampleCallback = cb;
}

// Připojení k trenažeru a inicializace služeb
export async function connectTrainer(): Promise<void> {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth není v tomhle prohlížeči k dispozici.");
  }

  const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: "Tacx" }],
    optionalServices: [
      0x1816, // CSC (Cycling Speed and Cadence)
      0x1818, // Cycling Power Service
      0x1826, // FTMS (Fitness Machine Service) – pro jistotu
    ],
  });

  server = await device.gatt!.connect();

  // Reset state
  startTimestamp = null;
  lastPower = lastSpeed = lastCadence = null;
  cscPreviousValues = null;
  targetPower = null;
  lastPowerSetTime = null;
  controlRequested = false;
  ergoModeSet = false;

  // CSC service – rychlost, kadence, control point
  const cscService = await server.getPrimaryService(0x1816);
  cscMeasurementChar = await cscService.getCharacteristic(0x2a5b);
  
  // Try to get Control Point for FE-C control
  try {
    controlPointChar = await cscService.getCharacteristic(0x2a55);
    console.log('Found CSC Control Point for FE-C control');
    
    // Try to enable notifications on Control Point to receive responses
    try {
      const properties = controlPointChar.properties;
      if (properties.notify || properties.indicate) {
        await controlPointChar.startNotifications();
        controlPointChar.addEventListener('characteristicvaluechanged', (event) => {
          const char = event.target as BluetoothRemoteGATTCharacteristic;
          const value = char.value;
          if (value && value.byteLength > 0) {
            const dataView = new DataView(value.buffer);
            const opcode = dataView.getUint8(0);
            console.log(`[FE-C Control Point Response] Opcode: 0x${opcode.toString(16).padStart(2, '0')}`);
            
            if (opcode === 0x01 && dataView.byteLength >= 6) {
              const responsePower = dataView.getUint16(4, true) / 10;
              console.log(`[FE-C] Power set confirmed: ${responsePower}W`);
            } else if (opcode === 0x05 && dataView.byteLength >= 5) {
              const mode = dataView.getUint8(4);
              if (mode === 0x04) {
                console.log('✅ ERGO mode confirmed by trainer');
              }
            }
          }
        });
        console.log('✅ Started notifications on Control Point');
      }
    } catch (notifError) {
      console.warn('⚠️ Could not start notifications on Control Point:', notifError);
    }
  } catch (error) {
    console.warn('CSC Control Point not found - ERGO mode control may not be available:', error);
    // Try alternative UUID
    try {
      controlPointChar = await cscService.getCharacteristic(0x2a5b);
      console.log('Found alternative Control Point for FE-C control');
    } catch (error2) {
      console.warn('Alternative Control Point also not found:', error2);
    }
  }

  await cscMeasurementChar.startNotifications();
  cscMeasurementChar.addEventListener(
    "characteristicvaluechanged",
    handleCscNotification
  );

  // Cycling Power Service – watty
  try {
    const powerService = await server.getPrimaryService(0x1818);
    powerMeasurementChar = await powerService.getCharacteristic(0x2a63);
    await powerMeasurementChar.startNotifications();
    powerMeasurementChar.addEventListener(
      "characteristicvaluechanged",
      handlePowerNotification
    );
    console.log('✅ Connected to Cycling Power Service');
  } catch (e) {
    console.warn("Cycling Power Service není k dispozici:", e);
  }
}

function handlePowerNotification(event: Event) {
  const char = event.target as BluetoothRemoteGATTCharacteristic;
  const dv = char.value!;
  
  if (dv.byteLength < 4) {
    return;
  }
  
  // Parse Cycling Power Measurement (CPM) - Bluetooth SIG standard
  // Format: [Flags (2 bytes), Instantaneous Power (2 bytes, Int16 LE, in W), ...]
  const flags = dv.getUint16(0, true);
  const instantaneousPower = dv.getInt16(2, true); // W
  
  lastPower = instantaneousPower;
  
  // Log power for debugging (log every 10th reading or if power changed significantly)
  const shouldLog = !lastPower || Math.abs(instantaneousPower - lastPower) > 10;
  if (shouldLog) {
    console.log(`[CPS] Power: ${instantaneousPower}W, Flags: 0x${flags.toString(16)}`);
    
    // Check if power matches target (if set recently)
    if (targetPower !== null && lastPowerSetTime !== null) {
      const timeSinceSet = Date.now() - lastPowerSetTime;
      if (timeSinceSet < 5000) {
        const diff = Math.abs(instantaneousPower - targetPower);
        const tolerance = 30; // 30W tolerance
        if (diff <= tolerance) {
          console.log(`✅ Power verification: Actual ${instantaneousPower}W matches target ${targetPower}W (within ${tolerance}W, ${(timeSinceSet/1000).toFixed(1)}s after set)`);
        } else if (timeSinceSet > 2000) {
          console.warn(`⚠️ Power verification: Actual ${instantaneousPower}W differs from target ${targetPower}W by ${diff}W (${(timeSinceSet/1000).toFixed(1)}s after set)`);
        }
      }
    }
  }
  
  emitSample();
}

function handleCscNotification(event: Event) {
  const char = event.target as BluetoothRemoteGATTCharacteristic;
  const dv = char.value!;
  
  if (dv.byteLength < 1) {
    return;
  }
  
  // Parse Cycling Speed and Cadence (CSC) Measurement - Bluetooth SIG standard
  // Format: [Flags (1 byte), Cumulative Wheel Revolutions (4 bytes, optional), Last Wheel Event Time (2 bytes, optional), Cumulative Crank Revolutions (2 bytes, optional), Last Crank Event Time (2 bytes, optional)]
  const flagsCSC = dv.getUint8(0);
  const wheelRevPresent = flagsCSC & 0x01;
  const crankRevPresent = flagsCSC & 0x02;
  
  let wheelRevolutions: number | null = null;
  let lastWheelTime: number | null = null;
  let crankRevolutions: number | null = null;
  let lastCrankTime: number | null = null;
  let offset = 1;
  
  // Wheel revolutions data (if present)
  if (wheelRevPresent && dv.byteLength >= offset + 6) {
    wheelRevolutions = dv.getUint32(offset, true);
    lastWheelTime = dv.getUint16(offset + 4, true);
    offset += 6;
  }
  
  // Crank revolutions data (if present)
  if (crankRevPresent && dv.byteLength >= offset + 4) {
    crankRevolutions = dv.getUint16(offset, true);
    lastCrankTime = dv.getUint16(offset + 2, true);
  }
  
  // Calculate speed and cadence from deltas
  const prev = cscPreviousValues;
  const now = Date.now();
  let speed: number | null = null;
  let cadence: number | null = null;
  
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
  cscPreviousValues = {
    wheelRevolutions,
    lastWheelTime,
    crankRevolutions,
    lastCrankTime,
    timestamp: now
  };
  
  lastSpeed = speed;
  lastCadence = cadence;
  emitSample();
}

// ERG mód – nastavení cílového výkonu
export async function setTargetPower(powerW: number): Promise<void> {
  if (!controlPointChar) {
    throw new Error("Control point není inicializovaný.");
  }

  try {
    // FE-C protocol for Tacx trainers:
    // 1. Request Control (opcode 0x00) - some trainers need this first
    // 2. Set Training Mode to ERGO (opcode 0x05, value 0x04) - optional but recommended
    // 3. Set Target Power (opcode 0x01)
    
    // Step 1: Request Control (if not already done)
    if (!controlRequested) {
      try {
        const requestControl = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
        await controlPointChar.writeValue(requestControl);
        await new Promise(resolve => setTimeout(resolve, 150));
        controlRequested = true;
        console.log('Requested control from trainer');
      } catch (e) {
        console.log('Request control skipped or failed, continuing...');
        controlRequested = true;
      }
    }

    // Step 2: Set Training Mode to ERGO (0x04 = ERGO mode)
    // Always set ERGO mode before setting power to ensure trainer is in correct mode
    try {
      const setErgoMode = new Uint8Array([
        0x05,        // Opcode: Set Training Mode
        0x00,        // Reserved
        0x00,        // Reserved
        0x00,        // Reserved
        0x04,        // Training Mode: 0x04 = ERGO mode
        0x00         // Reserved
      ]);
      await controlPointChar.writeValue(setErgoMode);
      await new Promise(resolve => setTimeout(resolve, 200));
      ergoModeSet = true;
      console.log('Set training mode to ERGO');
    } catch (e) {
      console.log('Set training mode skipped or failed, continuing...');
      ergoModeSet = true;
    }

    // Step 3: Set Target Power
    // FE-C Set Target Power command format:
    // [Opcode (1 byte), Reserved (3 bytes), Power (2 bytes, little-endian, in 0.1W units)]
    // Opcode 0x01 = Set Target Power (ERGO mode)
    const powerInTenths = Math.round(powerW * 10); // Convert to 0.1W units
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
    targetPower = powerW;
    lastPowerSetTime = Date.now();
    
    await controlPointChar.writeValue(command);
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log(`Set target power to ${powerW}W (${powerInTenths} x 0.1W) on trainer`);
  } catch (error: any) {
    console.error(`Error setting power on trainer:`, error);
    // If it's a "GATT operation already in progress" error, wait and retry once
    if (error.message && error.message.includes('already in progress')) {
      console.log('GATT operation in progress, waiting and retrying...');
      await new Promise(resolve => setTimeout(resolve, 300));
      try {
        const powerInTenths = Math.round(powerW * 10);
        const powerLow = powerInTenths & 0xFF;
        const powerHigh = (powerInTenths >> 8) & 0xFF;
        const command = new Uint8Array([0x01, 0x00, 0x00, 0x00, powerLow, powerHigh]);
        await controlPointChar.writeValue(command);
        targetPower = powerW;
        lastPowerSetTime = Date.now();
        console.log(`Retry: Set target power to ${powerW}W on trainer`);
      } catch (retryError) {
        throw new Error(`Failed to set power after retry: ${(retryError as Error).message}`);
      }
    } else {
      throw new Error(`Failed to set power: ${error.message}`);
    }
  }
}

export async function disconnectTrainer() {
  try {
    if (cscMeasurementChar) {
      cscMeasurementChar.removeEventListener(
        "characteristicvaluechanged",
        handleCscNotification
      );
    }
    if (powerMeasurementChar) {
      powerMeasurementChar.removeEventListener(
        "characteristicvaluechanged",
        handlePowerNotification
      );
    }
    if (server?.connected) {
      await server.disconnect();
    }
  } catch (e) {
    console.warn("Chyba při odpojení od trenažeru:", e);
  } finally {
    server = null;
    cscMeasurementChar = null;
    powerMeasurementChar = null;
    controlPointChar = null;
    startTimestamp = null;
    cscPreviousValues = null;
    targetPower = null;
    lastPowerSetTime = null;
    controlRequested = false;
    ergoModeSet = false;
  }
}

