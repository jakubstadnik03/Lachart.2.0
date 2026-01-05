## LaChart Mobile (Expo)

This folder contains the React Native mobile app.

### Important: Expo Go compatibility (iOS)
Expo Go on iOS only supports the **latest SDK**. Your device shows Expo Go **SDK 54**, so this app must be on **SDK 54** as well.

### Prerequisites
- **Node 20.19+** (Expo SDK 54 / RN 0.81 requires Node 20+)
- Backend running locally (`server/`)
- Phone on the same Wi‑Fi as your computer (for Expo Go)

### Run backend
```bash
cd ../server
npm start
```

### Run mobile app (Expo Go)
1) Start Expo with your backend URL (use your LAN IP, not localhost):
```bash
cd ../app
EXPO_PUBLIC_API_URL="http://<YOUR_LAN_IP>:8000" npm start
```

2) Open Expo Go and scan the QR code.

### Fix dependencies after SDK bump
If `npm start` reports missing Expo packages or version mismatch, run:
```bash
cd ../app
rm -rf node_modules package-lock.json
npm install
npx expo install expo-asset expo-constants expo-device expo-notifications expo-secure-store react-native-gesture-handler react-native-reanimated react-native-safe-area-context react-native-screens
```



