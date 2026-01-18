/**
 * FTMS Indoor Bike Data Parser
 * Parses the Indoor Bike Data characteristic according to FTMS spec
 */

import { logger } from '../logger.js';

export interface ParsedIndoorBikeData {
  speed?: number; // m/s
  cadence?: number; // rpm
  power?: number; // watts
  heartRate?: number; // bpm
  elapsedTime?: number; // seconds
  distance?: number; // meters
}

/**
 * Parse FTMS Indoor Bike Data characteristic
 * @param data DataView from characteristic notification
 * @returns Parsed data or null if invalid
 */
export function parseIndoorBikeData(data: DataView): ParsedIndoorBikeData | null {
  if (data.byteLength < 2) {
    logger.warn('Indoor Bike Data too short:', data.byteLength);
    return null;
  }

  const result: ParsedIndoorBikeData = {};
  let offset = 0;

  // Read flags (2 bytes, little-endian)
  const flags = data.getUint16(offset, true);
  offset += 2;

  // Flag bits (from FTMS spec)
  const MORE_DATA = 0x01;
  const AVERAGE_SPEED_PRESENT = 0x02;
  const INSTANTANEOUS_CADENCE_PRESENT = 0x04;
  const AVERAGE_CADENCE_PRESENT = 0x08;
  const TOTAL_DISTANCE_PRESENT = 0x10;
  const RESISTANCE_LEVEL_PRESENT = 0x20;
  const INSTANTANEOUS_POWER_PRESENT = 0x40;
  const AVERAGE_POWER_PRESENT = 0x80;
  const EXPENDED_ENERGY_PRESENT = 0x100;
  const HEART_RATE_PRESENT = 0x200;
  const ELAPSED_TIME_PRESENT = 0x400;
  const REMAINING_TIME_PRESENT = 0x800;
  const INSTANTANEOUS_SPEED_PRESENT = 0x1000;

  // Parse fields in order (per FTMS spec)
  
  // More Data (1 byte) - skip if present
  if (flags & MORE_DATA) {
    if (offset + 1 > data.byteLength) {
      logger.warn('Buffer too short for More Data');
      return result;
    }
    offset += 1;
  }

  // Instantaneous Speed (2 bytes, unit: 0.01 m/s)
  if (flags & INSTANTANEOUS_SPEED_PRESENT) {
    if (offset + 2 > data.byteLength) {
      logger.warn('Buffer too short for Instantaneous Speed');
      return result;
    }
    const speedValue = data.getUint16(offset, true);
    result.speed = speedValue / 100.0; // Convert to m/s
    offset += 2;
  }

  // Average Speed (2 bytes) - skip if present
  if (flags & AVERAGE_SPEED_PRESENT) {
    if (offset + 2 > data.byteLength) {
      logger.warn('Buffer too short for Average Speed');
      return result;
    }
    offset += 2;
  }

  // Instantaneous Cadence (2 bytes, unit: 0.5 rpm)
  if (flags & INSTANTANEOUS_CADENCE_PRESENT) {
    if (offset + 2 > data.byteLength) {
      logger.warn('Buffer too short for Instantaneous Cadence');
      return result;
    }
    const cadenceValue = data.getUint16(offset, true);
    result.cadence = cadenceValue / 2.0; // Convert to rpm
    offset += 2;
  }

  // Average Cadence (2 bytes) - skip if present
  if (flags & AVERAGE_CADENCE_PRESENT) {
    if (offset + 2 > data.byteLength) {
      logger.warn('Buffer too short for Average Cadence');
      return result;
    }
    offset += 2;
  }

  // Total Distance (3 bytes) - skip if present
  if (flags & TOTAL_DISTANCE_PRESENT) {
    if (offset + 3 > data.byteLength) {
      logger.warn('Buffer too short for Total Distance');
      return result;
    }
    offset += 3;
  }

  // Resistance Level (2 bytes) - skip if present
  if (flags & RESISTANCE_LEVEL_PRESENT) {
    if (offset + 2 > data.byteLength) {
      logger.warn('Buffer too short for Resistance Level');
      return result;
    }
    offset += 2;
  }

  // Instantaneous Power (2 bytes, signed, watts)
  if (flags & INSTANTANEOUS_POWER_PRESENT) {
    if (offset + 2 > data.byteLength) {
      logger.warn('Buffer too short for Instantaneous Power');
      return result;
    }
    const powerValue = data.getInt16(offset, true);
    result.power = Math.max(0, powerValue); // Clamp to non-negative
    offset += 2;
  }

  // Average Power (2 bytes) - skip if present
  if (flags & AVERAGE_POWER_PRESENT) {
    if (offset + 2 > data.byteLength) {
      logger.warn('Buffer too short for Average Power');
      return result;
    }
    offset += 2;
  }

  // Expended Energy (2 or 4 bytes) - skip if present
  if (flags & EXPENDED_ENERGY_PRESENT) {
    if (offset + 2 > data.byteLength) {
      logger.warn('Buffer too short for Expended Energy');
      return result;
    }
    // Check if 4-byte format (bit 1 of first byte)
    const firstByte = data.getUint8(offset);
    const energyBytes = (firstByte & 0x01) ? 4 : 2;
    offset += energyBytes;
  }

  // Heart Rate (1 byte, bpm)
  if (flags & HEART_RATE_PRESENT) {
    if (offset + 1 > data.byteLength) {
      logger.warn('Buffer too short for Heart Rate');
      return result;
    }
    result.heartRate = data.getUint8(offset);
    offset += 1;
  }

  // Elapsed Time (2 bytes, seconds)
  if (flags & ELAPSED_TIME_PRESENT) {
    if (offset + 2 > data.byteLength) {
      logger.warn('Buffer too short for Elapsed Time');
      return result;
    }
    result.elapsedTime = data.getUint16(offset, true);
    offset += 2;
  }

  // Remaining Time (2 bytes) - skip if present
  if (flags & REMAINING_TIME_PRESENT) {
    if (offset + 2 > data.byteLength) {
      logger.warn('Buffer too short for Remaining Time');
      return result;
    }
    offset += 2;
  }

  logger.debug('Parsed Indoor Bike Data:', result);
  return result;
}
