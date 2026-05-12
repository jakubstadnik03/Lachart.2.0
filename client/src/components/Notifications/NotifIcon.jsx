import React from 'react';

// Shared SVG icon set for notifications. Used by both the PC header bell
// (NotificationBell) and the native mobile sheet (NativeLayout) so the visual
// language is identical across platforms — no emoji, sport-aware tint.
const NOTIF_ICONS = {
  bell:    { color: '#5E6590', d: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0' },
  comment: { color: '#5E6590', d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  lactate: { color: '#B45309', d: 'M9 2v6L4 18a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L15 8V2 M6.5 13h11 M9 2h6' },
  strava:  { color: '#FC4C02', d: 'M11 1L4 14h4l3-6 3 6h4z M14 14l-3 6-3-6' },
  upload:  { color: '#0891b2', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12' },
  run:     { color: '#f97316', d: 'M13 4a3 3 0 1 0-6 0 3 3 0 0 0 6 0z M5 22l5-7 4 5 5-3' },
  test:    { color: '#5E6590', d: 'M3 20h2V10H3v10z M7 20h2V4H7v16z M11 20h2v-7h-2v7z M15 20h2V7h-2v13z M19 20h2v-4h-2v4z' },
  plan:    { color: '#5E6590', d: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18' },
  coach:   { color: '#5E6590', d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
};

export function notifTypeKey(type) {
  if (!type) return 'bell';
  if (type.includes('comment'))  return 'comment';
  if (type.includes('lactate'))  return 'lactate';
  if (type.includes('strava'))   return 'strava';
  if (type.includes('fit'))      return 'upload';
  if (type.includes('training')) return 'run';
  if (type.includes('test'))     return 'test';
  if (type.includes('plan'))     return 'plan';
  if (type.includes('coach'))    return 'coach';
  return 'bell';
}

export default function NotifIcon({ type, size = 18 }) {
  const key = notifTypeKey(type);
  const def = NOTIF_ICONS[key] || NOTIF_ICONS.bell;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={def.color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d={def.d} />
    </svg>
  );
}
