/**
 * Companion Mock Server (Node.js)
 * Simulates a companion app for development/testing
 */

import * as WebSocket from 'ws';

const PORT = 8080;

const wss = new WebSocket.Server({ port: PORT });

console.log(`Companion Mock Server listening on ws://localhost:${PORT}/trainer`);

// Mock trainer device
const mockDevice = {
  id: 'mock-trainer-1',
  name: 'Mock Smart Trainer',
  capabilities: {
    erg: true,
    resistance: true,
    slope: false,
    supportsControlPoint: true,
    telemetry: {
      power: true,
      cadence: true,
      speed: true,
      hr: false,
    },
    powerRange: {
      min: 0,
      max: 2000,
    },
  },
};

let connected = false;
let currentPower = 0;
let mockPower = 100;
let mockCadence = 80;
let mockSpeed = 25;

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected to companion mock server');

  // Send mock telemetry every second
  const telemetryInterval = setInterval(() => {
    if (connected) {
      // Simulate power around target with some variation
      if (currentPower > 0) {
        mockPower = currentPower + (Math.random() - 0.5) * 20;
        mockPower = Math.max(0, Math.min(2000, mockPower));
      }
      mockCadence = 75 + (Math.random() - 0.5) * 10;
      mockSpeed = 20 + (mockPower / 100) * 0.5 + (Math.random() - 0.5) * 2;

      ws.send(JSON.stringify({
        type: 'telemetry',
        telemetry: {
          ts: Date.now(),
          power: Math.round(mockPower),
          cadence: Math.round(mockCadence),
          speed: Math.round(mockSpeed * 10) / 10,
          connected: true,
        },
      }));
    }
  }, 1000);

  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data.type);

      switch (data.type) {
        case 'scan':
          ws.send(JSON.stringify({
            type: 'scanResult',
            requestId: data.requestId,
            devices: [{
              id: mockDevice.id,
              name: mockDevice.name,
              rssi: -50,
            }],
          }));
          break;

        case 'connect':
          connected = true;
          ws.send(JSON.stringify({
            type: 'connected',
            requestId: data.requestId,
            deviceId: mockDevice.id,
            capabilities: mockDevice.capabilities,
          }));
          break;

        case 'disconnect':
          connected = false;
          ws.send(JSON.stringify({
            type: 'disconnected',
          }));
          break;

        case 'setErg':
          currentPower = data.watts;
          ws.send(JSON.stringify({
            type: 'ack',
            requestId: data.requestId,
            ok: true,
          }));
          console.log(`Set ERG to ${data.watts}W`);
          break;

        case 'requestControl':
          ws.send(JSON.stringify({
            type: 'ack',
            requestId: data.requestId,
            ok: true,
          }));
          break;

        case 'start':
          ws.send(JSON.stringify({
            type: 'ack',
            requestId: data.requestId,
            ok: true,
          }));
          break;

        default:
          ws.send(JSON.stringify({
            type: 'ack',
            requestId: data.requestId,
            ok: false,
            error: 'Unknown command',
          }));
      }
    } catch (e) {
      console.error('Error handling message:', e);
      ws.send(JSON.stringify({
        type: 'error',
        error: String(e),
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from companion mock server');
    clearInterval(telemetryInterval);
    connected = false;
  });
});

// Keep process alive
process.on('SIGINT', () => {
  console.log('\nShutting down companion mock server...');
  wss.close(() => {
    process.exit(0);
  });
});
