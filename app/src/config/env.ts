export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  // NOTE: for a real device, set EXPO_PUBLIC_API_URL to your LAN IP like http://192.168.0.10:8000
  'http://localhost:8000';



