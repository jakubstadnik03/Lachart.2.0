/**
 * WidgetDebugBanner — temporary in-app diagnostic for the iOS widget pipeline.
 *
 * The home-screen widget keeps showing "Open LaChart to sync data" because
 * `SharedStorage.loadFormFitness()` reads nil from the App Group cache.
 * Without Mac + Safari Web Inspector the user can't see whether the JS-side
 * write actually fired, so this banner runs the same probes the inspector
 * would and renders the result inline at the top of the native dashboard.
 *
 * Tap "Run again" to re-run on demand. Tap × to dismiss for this session.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { isCapacitorNative } from '../../utils/isNativeApp';
import { LaChartShared } from '../../utils/widgetCache';

export default function WidgetDebugBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState({ phase: 'idle', message: 'Tap to run diagnostic' });

  const run = useCallback(async () => {
    setState({ phase: 'running', message: 'Probing native plugin…' });

    if (!isCapacitorNative()) {
      setState({ phase: 'skip', message: 'Web build — widget pipeline not applicable.' });
      return;
    }

    if (!Capacitor.isPluginAvailable('LaChartShared')) {
      setState({
        phase: 'fail-plugin',
        message: 'LaChartShared NOT registered. Xcode → App target → Build Phases → Compile Sources MUST include LaChartSharedPlugin.swift + LaChartSharedPlugin.m. Clean build and re-run.',
      });
      return;
    }

    try {
      const probe = {
        fitness: 1, fatigue: 1, form: 0, formDelta: 0,
        sparkline: [], todayCompleted: [], todayPlanned: [],
      };
      const res = await LaChartShared.setFormFitness(probe);
      const bytes = res?.bytes ?? '?';
      setState({
        phase: 'ok',
        message: `Plugin OK — wrote ${bytes} bytes to App Group. If widget still shows "Open LaChart", the WIDGET target's App Group entitlement is missing (group.com.lachart.app must be ticked on LaChartWidgetExtension target).`,
      });
    } catch (e) {
      const m = e?.message || e?.errorMessage || String(e);
      // Classify the most common reject reasons.
      if (/App Group/i.test(m)) {
        setState({
          phase: 'fail-appgroup',
          message: `App Group entitlement MISSING on App target. ${m}`,
        });
      } else {
        setState({
          phase: 'fail-other',
          message: `setFormFitness rejected: ${m}`,
        });
      }
    }
  }, []);

  // Auto-run on mount.
  useEffect(() => { run(); }, [run]);

  if (dismissed) return null;
  if (!isCapacitorNative()) return null;
  // The widget pipeline is iOS-only — LaChartShared is the WidgetKit bridge
  // and no equivalent exists on Android (no home-screen widget there yet).
  // Show the banner only on iOS so Android doesn't display a confusing
  // "plugin missing" error for something that's intentionally absent.
  if (Capacitor.getPlatform() !== 'ios') return null;

  const palette = {
    idle:           { bg: '#EEF0F8', fg: '#5E6590', accent: '#5E6590' },
    running:        { bg: '#EEF0F8', fg: '#5E6590', accent: '#5E6590' },
    ok:             { bg: '#DCFCE7', fg: '#14532D', accent: '#15803D' },
    skip:           { bg: '#F3F4F6', fg: '#374151', accent: '#6B7280' },
    'fail-plugin':  { bg: '#FEE2E2', fg: '#7F1D1D', accent: '#B91C1C' },
    'fail-appgroup':{ bg: '#FEE2E2', fg: '#7F1D1D', accent: '#B91C1C' },
    'fail-other':   { bg: '#FEF3C7', fg: '#78350F', accent: '#B45309' },
  }[state.phase] || { bg: '#EEF0F8', fg: '#5E6590', accent: '#5E6590' };

  const label = {
    idle: 'WIDGET PROBE',
    running: 'CHECKING…',
    ok: '✓ PLUGIN OK',
    skip: 'WEB BUILD',
    'fail-plugin': '× PLUGIN MISSING',
    'fail-appgroup': '× APP GROUP MISSING',
    'fail-other': '! PLUGIN ERROR',
  }[state.phase] || state.phase;

  return (
    <div style={{
      position: 'relative',
      margin: '12px 16px 6px',
      background: palette.bg,
      borderRadius: 14,
      padding: '12px 14px 14px',
      border: `1px solid ${palette.accent}33`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 800, color: palette.accent,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>{label}</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={run}
          style={{
            fontSize: 11, fontWeight: 700, color: palette.accent,
            background: 'transparent', border: `1px solid ${palette.accent}55`,
            borderRadius: 999, padding: '3px 10px', cursor: 'pointer',
          }}
        >
          Run again
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          style={{
            fontSize: 14, color: palette.accent,
            background: 'transparent', border: 'none', padding: 4, cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      <div style={{
        fontSize: 12.5, color: palette.fg, lineHeight: 1.45, fontWeight: 500,
      }}>
        {state.message}
      </div>
    </div>
  );
}
