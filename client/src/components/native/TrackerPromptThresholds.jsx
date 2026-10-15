import React from 'react';
import {
  extractLactateThresholds,
  formatThresholdIntensity,
} from '../../utils/extractLactateThresholds';

/**
 * LT1/LT2 read off a test, for the native tracker-connect prompts.
 *
 * The prompt's whole argument is "here are your numbers and nothing is being
 * measured against them", so the numbers have to be on the sheet. A test too
 * sparse to fit a curve renders nothing and the prompt still works without it,
 * rather than showing a row of dashes.
 */
export default function TrackerPromptThresholds({ test, caption = 'From the test you just saved' }) {
  if (!test) return null;
  let thresholds = null;
  try {
    thresholds = extractLactateThresholds(test);
  } catch {
    return null;
  }
  const sport = thresholds?.sport;
  const lt1 = thresholds?.lt1 != null ? formatThresholdIntensity(thresholds.lt1, test, sport) : null;
  const lt2 = thresholds?.lt2 != null ? formatThresholdIntensity(thresholds.lt2, test, sport) : null;
  if (!lt1 && !lt2) return null;

  const cell = (label, value, hr) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {hr ? (
        <div style={{ fontSize: 11, color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{hr} bpm</div>
      ) : null}
    </div>
  );

  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 14, padding: 14 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
        color: '#9ca3af', marginBottom: 10,
      }}>
        {caption}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        {lt1 ? cell('LT1 · aerobic', lt1, thresholds?.lt1Hr) : null}
        {lt2 ? cell('LT2 · anaerobic', lt2, thresholds?.lt2Hr) : null}
      </div>
    </div>
  );
}
