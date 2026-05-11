// Full-height bottom sheet that wraps the existing NewTestingComponent so the
// native testing page can let users record a new lab test in one tap. On save,
// the test is sent through the same `addTest` API and bubbled back via
// `onCreated(test)` so the parent can refresh its list.

import React, { useState, useEffect } from 'react';
import NewTestingComponent from '../Testing-page/NewTestingComponent';
import { addTest } from '../../services/api';

const SHEET_KEYFRAMES = `
@keyframes ndSheetIn  { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes ndScrimIn  { from { opacity: 0; } to { opacity: 1; } }
`;

export default function NewTestSheet({
  open,
  onClose,
  onCreated,
  defaultSport = 'all',
  athleteId,
  user,
}) {
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  // Submit handler — mirrors TestingPage.handleAddTest but trimmed to the
  // bare essentials and adapted to native context.
  const handleSubmit = async (newTest) => {
    setSaving(true); setError(null);
    try {
      // Resolve which athlete this test belongs to
      const role = String(user?.role || '').toLowerCase();
      let athleteIdForSave;
      if (role === 'athlete') athleteIdForSave = user?._id;
      else if (role === 'tester' || role === 'testing') {
        if (!athleteId || String(athleteId) === String(user?._id)) {
          throw new Error('Select an athlete first — tester accounts cannot save tests to themselves.');
        }
        athleteIdForSave = athleteId;
      } else {
        athleteIdForSave = athleteId || user?._id;
      }
      if (!athleteIdForSave) throw new Error('Could not determine athlete for this test.');

      const processedTest = {
        ...newTest,
        athleteId: athleteIdForSave,
        results: (newTest.results || []).map(r => ({
          ...r,
          power:     Number(r.power)     || 0,
          heartRate: Number(r.heartRate) || 0,
          lactate:   Number(r.lactate)   || 0,
          glucose:   Number(r.glucose)   || 0,
          RPE:       Number(r.RPE)       || 0,
        })),
      };

      const response = await addTest(processedTest);
      const created = response?.data;
      if (created) onCreated && onCreated(created);
      onClose && onClose();
      return created;
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to save test';
      setError(msg);
      throw e;
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{SHEET_KEYFRAMES}</style>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(10,14,26,.45)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          animation: 'ndScrimIn .25s ease both',
        }}
      />

      {/* Sheet — nearly full-screen so the form has room */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 101,
          top: 'env(safe-area-inset-top, 0px)',
          background: 'linear-gradient(180deg, rgba(255,255,255,.96), rgba(238,240,244,.99))',
          backdropFilter: 'blur(28px) saturate(170%)',
          WebkitBackdropFilter: 'blur(28px) saturate(170%)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          boxShadow: '0 -10px 32px -8px rgba(10,14,26,.18)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          display: 'flex', flexDirection: 'column',
          animation: 'ndSheetIn .32s cubic-bezier(.22,1,.36,1) both',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
        }}
      >
        {/* Drag handle */}
        <div style={{
          width: 44, height: 4, borderRadius: 9999,
          background: 'rgba(118,126,181,.3)', margin: '8px auto 4px',
          flexShrink: 0,
        }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 18px 12px',
          borderBottom: '1px solid rgba(118,126,181,.12)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 800, color: '#7C3AED',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              Lab test
            </div>
            <div style={{
              fontSize: 17, fontWeight: 800, color: '#0A0E1A',
              letterSpacing: '-0.02em', marginTop: 1,
            }}>
              New test
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(118,126,181,.12)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#5E6590', cursor: 'pointer', fontFamily: 'inherit',
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {/* Saving / error feedback strip */}
        {(saving || error) && (
          <div style={{
            padding: '8px 18px',
            background: error ? '#FEF2F2' : '#F0F9FF',
            color: error ? '#B91C1C' : '#075985',
            fontSize: 12, fontWeight: 600,
            borderBottom: `1px solid ${error ? '#FECACA' : '#BAE6FD'}`,
            flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {error ? (
              <>
                {/* Alert-triangle SVG — replaces ⚠️ */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>{error}</span>
              </>
            ) : (
              <>
                {/* Spinner SVG — replaces ⏳ */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, animation: 'ndSpin 1s linear infinite' }}>
                  <line x1="12" y1="2"  x2="12" y2="6" />
                  <line x1="12" y1="18" x2="12" y2="22" />
                  <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                  <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                  <line x1="2" y1="12"  x2="6" y2="12" />
                  <line x1="18" y1="12" x2="22" y2="12" />
                  <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                  <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                </svg>
                <span>Saving test…</span>
              </>
            )}
          </div>
        )}

        {/* Form body — scrollable */}
        <div style={{
          flex: 1, minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '6px 6px 14px',
        }}>
          <NewTestingComponent
            selectedSport={defaultSport}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </>
  );
}
