# Trainer Connectivity Layer

Universal smart trainer control for LaChart web app. Supports multiple platforms and protocols.

## Features

- **FTMS (Fitness Machine Service)** - Web Bluetooth for Chrome/Edge/Android
- **Companion Adapter** - WebSocket-based for iOS and universal access
- **ANT+ FE-C** - Stub for future desktop bridge support
- **React Hook** - Easy integration with React components
- **TypeScript** - Full type safety

## Quick Start

### Basic Usage

```typescript
import { useTrainer } from './trainer/react/useTrainer';

function MyComponent() {
  const {
    devices,
    connectedDevice,
    telemetry,
    capabilities,
    status,
    error,
    scan,
    connect,
    disconnect,
    setErgWatts,
    requestControl,
    start,
  } = useTrainer();

  return (
    <div>
      <button onClick={scan}>Scan</button>
      {devices.map(device => (
        <button key={device.id} onClick={() => connect(device.id)}>
          {device.name}
        </button>
      ))}
      {telemetry && (
        <div>
          Power: {telemetry.power}W
          Cadence: {telemetry.cadence}rpm
        </div>
      )}
      {capabilities?.erg && (
        <button onClick={() => setErgWatts(200)}>Set 200W</button>
      )}
    </div>
  );
}
```

### Using the Modal Component

```typescript
import { TrainerConnectModal } from './trainer/react/TrainerConnectModal';

function App() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button onClick={() => setShowModal(true)}>Connect Trainer</button>
      <TrainerConnectModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
```

### Platform Detection

```typescript
import { getPlatformMessage, hasWebBluetooth } from './trainer';

if (!hasWebBluetooth()) {
  const message = getPlatformMessage();
  // "iOS requires LaChart Link companion app for trainer connectivity."
}
```

## Architecture

### Adapter Interface

All adapters implement `TrainerAdapter`:

```typescript
interface TrainerAdapter {
  scan(): Promise<DeviceInfo[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getCapabilities(): TrainerCapabilities | null;
  subscribeTelemetry(cb: (t: Telemetry) => void): UnsubscribeFn;
  setErgWatts(watts: number): Promise<void>;
  requestControl?(): Promise<void>;
  start?(): Promise<void>;
}
```

### Factory Pattern

The factory automatically selects the best adapter:

```typescript
import { createTrainerClient } from './trainer';

// Auto-select (prefers FTMS if Web Bluetooth available)
const adapter = createTrainerClient();

// Force specific adapter
const companionAdapter = createTrainerClient({ preferred: 'companion' });
const ftmsAdapter = createTrainerClient({ preferred: 'ftms' });
```

## Development

### Running Mock Companion Server

For testing without a real trainer:

```bash
# Install dependencies
npm install ws @types/ws

# Run mock server
node client/src/trainer/companion/mockServer.ts
```

The mock server simulates a trainer at `ws://localhost:8080/trainer`.

### Testing FTMS Adapter

1. Use Chrome/Edge browser
2. Enable Web Bluetooth (usually enabled by default)
3. Have an FTMS-compatible trainer nearby
4. Call `scan()` to find devices

## Protocol Details

### FTMS

- Service UUID: `0x1826`
- Indoor Bike Data: `0x2AD2` (notify)
- Control Point: `0x2AD9` (write/indicate)

### Companion Protocol

WebSocket messages (JSON):

```typescript
// Scan
{ type: 'scan', requestId: '...' }
{ type: 'scanResult', devices: [...], requestId: '...' }

// Connect
{ type: 'connect', deviceId: '...', requestId: '...' }
{ type: 'connected', deviceId: '...', capabilities: {...}, requestId: '...' }

// Telemetry
{ type: 'telemetry', telemetry: { ts, power, cadence, speed, hr, connected } }

// Set ERG
{ type: 'setErg', watts: 200, requestId: '...' }
{ type: 'ack', ok: true, requestId: '...' }
```

## Error Handling

All methods throw errors that should be caught:

```typescript
try {
  await connect(deviceId);
  await requestControl();
  await setErgWatts(200);
} catch (error) {
  console.error('Trainer error:', error.message);
}
```

Common errors:
- `Web Bluetooth not available` - Use Chrome/Edge or Companion adapter
- `Control not granted` - Trainer rejected control request
- `Operation not supported` - Trainer doesn't support ERG mode
- `Connection failed` - Device disconnected or unreachable

## Status States

- `disconnected` - No connection
- `connecting` - Establishing connection
- `ready` - Connected, telemetry available
- `controlled` - Control granted
- `erg_active` - ERG mode active
- `error` - Error occurred

## Limitations

- iOS Safari: Requires Companion adapter (no Web Bluetooth)
- ANT+: Stub only, requires desktop bridge
- Reconnection: Automatic with exponential backoff (max 5 attempts)

## Future Enhancements

- [ ] Full ANT+ FE-C support
- [ ] Resistance and slope control
- [ ] Workout mode support
- [ ] Calibration routines
- [ ] Multiple trainer support
- [ ] Telemetry recording/playback
