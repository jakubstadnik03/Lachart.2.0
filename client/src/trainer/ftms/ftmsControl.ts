/**
 * FTMS Control Point Commands
 */

import { logger } from '../logger.js';
import {
  FTMS_OPCODE_REQUEST_CONTROL,
  FTMS_OPCODE_SET_TARGET_POWER,
  FTMS_OPCODE_START_OR_RESUME,
  FTMS_OPCODE_RESPONSE_CODE,
  FTMS_RESPONSE_SUCCESS,
  FTMS_RESPONSE_NOT_SUPPORTED,
  FTMS_RESPONSE_INVALID_PARAMETER,
  FTMS_RESPONSE_OPERATION_FAILED,
  FTMS_RESPONSE_CONTROL_NOT_PERMITTED,
} from './ftmsUuids.ts';

export interface ControlResponse {
  opcode: number;
  status: number;
  success: boolean;
  error?: string;
}

/**
 * Build Request Control command
 */
export function buildRequestControlCommand(): Uint8Array {
  return new Uint8Array([FTMS_OPCODE_REQUEST_CONTROL]);
}

/**
 * Build Set Target Power command
 * @param watts Target power in watts (0-2000)
 */
export function buildSetTargetPowerCommand(watts: number): Uint8Array {
  const clampedWatts = Math.max(0, Math.min(2000, Math.round(watts)));
  const command = new Uint8Array(3);
  command[0] = FTMS_OPCODE_SET_TARGET_POWER;
  command[1] = clampedWatts & 0xff; // Low byte
  command[2] = (clampedWatts >> 8) & 0xff; // High byte
  logger.debug('Built Set Target Power command:', clampedWatts, 'W');
  return command;
}

/**
 * Build Start or Resume command
 */
export function buildStartOrResumeCommand(): Uint8Array {
  return new Uint8Array([FTMS_OPCODE_START_OR_RESUME]);
}

/**
 * Parse Control Point response
 */
export function parseControlResponse(data: DataView): ControlResponse | null {
  if (data.byteLength < 3) {
    logger.warn('Control response too short:', data.byteLength);
    return null;
  }

  const opcode = data.getUint8(0);
  const requestOpcode = data.getUint8(1);
  const status = data.getUint8(2);

  if (opcode !== FTMS_OPCODE_RESPONSE_CODE) {
    logger.warn('Unexpected response opcode:', opcode);
    return null;
  }

  let success = false;
  let error: string | undefined;

  switch (status) {
    case FTMS_RESPONSE_SUCCESS:
      success = true;
      break;
    case FTMS_RESPONSE_NOT_SUPPORTED:
      error = 'Operation not supported';
      break;
    case FTMS_RESPONSE_INVALID_PARAMETER:
      error = 'Invalid parameter';
      break;
    case FTMS_RESPONSE_OPERATION_FAILED:
      error = 'Operation failed';
      break;
    case FTMS_RESPONSE_CONTROL_NOT_PERMITTED:
      error = 'Control not permitted';
      break;
    default:
      error = `Unknown status: 0x${status.toString(16)}`;
  }

  return {
    opcode: requestOpcode,
    status,
    success,
    error,
  };
}

/**
 * Get error message for response
 */
export function getResponseErrorMessage(response: ControlResponse): string {
  if (response.success) return '';
  return response.error || `Control point error: status 0x${response.status.toString(16)}`;
}
