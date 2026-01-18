/**
 * ANT+ Bridge Server (Node.js Stub)
 * This is a minimal stub for development/testing
 * Real implementation would connect to ANT+ USB stick
 */

import * as http from 'http';
import * as WebSocket from 'ws';

const PORT = 8081;

const wss = new WebSocket.Server({ port: PORT });

console.log(`ANT+ Bridge Server (stub) listening on ws://localhost:${PORT}/ant`);

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected to ANT+ bridge');

  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data);

      // Stub responses
      if (data.type === 'scan') {
        ws.send(JSON.stringify({
          type: 'scanResult',
          devices: []
        }));
      } else if (data.type === 'connect') {
        ws.send(JSON.stringify({
          type: 'connected',
          deviceId: data.deviceId,
          capabilities: {
            erg: false,
            resistance: false,
            slope: false,
            supportsControlPoint: false,
            telemetry: {
              power: false,
              cadence: false,
              speed: false,
              hr: false
            }
          }
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'ack',
          requestId: data.requestId,
          ok: false,
          error: 'ANT+ adapter not implemented'
        }));
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from ANT+ bridge');
  });
});

// Keep process alive
process.on('SIGINT', () => {
  console.log('\nShutting down ANT+ bridge server...');
  wss.close(() => {
    process.exit(0);
  });
});
