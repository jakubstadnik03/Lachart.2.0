/**
 * ActivityShareSheet — Strava-style bottom sheet for sharing a finished
 * activity (or a lactate test) as a graphic.
 *
 * Carousel uses an index + translateX transform (no scroll-snap) because
 * iOS WKWebView's scroll-snap is unreliable inside a sub-scroll context —
 * the sheet would freeze mid-drag, swallowing taps for the action buttons.
 *
 * Capture pipeline: SVG → serialize → data-URL Image → draw on canvas →
 * PNG. Works without html2canvas because every template is pure SVG.
 *
 * Share targets:
 *   • iOS native → Filesystem.writeFile(Cache) + Capacitor Share.share()
 *   • Web Share API capable browsers → navigator.share({ files })
 *   • Everything else → download .png
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import RouteStatsTemplate from './templates/RouteStatsTemplate';
import StatsOnlyTemplate from './templates/StatsOnlyTemplate';
import LapsElevationLactateTemplate from './templates/LapsElevationLactateTemplate';
import LactateCurveTemplate from './templates/LactateCurveTemplate';

const TEMPLATE_W = 1080;
const TEMPLATE_H = 1920;
const PREVIEW_W = 252;
const PREVIEW_H = 448;

// ── Capture helpers ────────────────────────────────────────────────────────

function ensureSvgNamespaces(xml) {
  // Ensure xmlns is present — Safari refuses to load otherwise.
  if (!/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(xml)) {
    xml = xml.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  }
  if (!/\sxmlns:xlink="/.test(xml)) {
    xml = xml.replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ');
  }
  // Strip xmlns:NS1 garbage React occasionally leaves behind on nested SVGs
  xml = xml.replace(/xmlns:NS\d+="[^"]*"\s*/g, '').replace(/NS\d+:/g, '');
  return xml;
}

// Blob URL is much lighter on iOS WebView memory than a base64 <img src> —
// the dataUrl decodes via a different path that keeps a large string alive
// in memory for as long as the <img> is mounted, which was making rapid
// re-renders sluggish.
function blobToObjectUrl(blob) {
  try { return URL.createObjectURL(blob); } catch { return null; }
}

async function svgMarkupToPng(rawMarkup) {
  console.log('[share] svgMarkupToPng: markup length=', rawMarkup.length);
  const xml = ensureSvgNamespaces(rawMarkup);
  // Use UTF-8 data URL — avoids the URL.createObjectURL → blob race
  // condition I saw on iOS where the Image onload sometimes never fires.
  const dataUrl =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  // Race the load against a 6 s timeout. Some iOS WKWebView builds silently
  // hang on Image.src for SVGs with certain text declarations — without the
  // race, the share button would just spin forever with no visible error.
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('SVG render timed out (6 s)')), 6000);
    img.onload = () => { clearTimeout(t); resolve(); };
    img.onerror = () => { clearTimeout(t); reject(new Error('Image decode failed')); };
    img.src = dataUrl;
  });
  console.log('[share] svgToPng: image loaded, drawing to canvas');

  const canvas = document.createElement('canvas');
  canvas.width = TEMPLATE_W;
  canvas.height = TEMPLATE_H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, TEMPLATE_W, TEMPLATE_H);
  const pngDataUrl = canvas.toDataURL('image/png');
  console.log('[share] svgToPng: PNG dataUrl length=', pngDataUrl.length);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  console.log('[share] svgToPng: blob size=', blob?.size);
  const objectUrl = blob ? blobToObjectUrl(blob) : null;
  return { dataUrl: pngDataUrl, blob, objectUrl };
}

function dataUrlToBase64(dataUrl) {
  const idx = dataUrl.indexOf(',');
  return idx === -1 ? dataUrl : dataUrl.slice(idx + 1);
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ActivityShareSheet({
  open,
  onClose,
  activity = null,
  gpsPoints = [],
  laps = [],
  records = null,
  test = null,
  thresholds = null,
  accent = '#FC4C02',
}) {
  const templates = useMemo(() => {
    const out = [];
    if (test) {
      out.push({ id: 'lactate', label: 'Lactate curve', node: <LactateCurveTemplate test={test} thresholds={thresholds} accent={accent} /> });
      return out;
    }
    if (Array.isArray(gpsPoints) && gpsPoints.length > 1) {
      out.push({ id: 'route', label: 'Route + stats', node: <RouteStatsTemplate activity={activity || {}} gpsPoints={gpsPoints} accent={accent} /> });
    }
    out.push({ id: 'stats', label: 'Stats', node: <StatsOnlyTemplate activity={activity || {}} accent={accent} /> });
    if (Array.isArray(laps) && laps.length >= 2) {
      out.push({ id: 'laps', label: 'Laps + elevation + lactate', node: <LapsElevationLactateTemplate activity={activity || {}} laps={laps} records={records} accent={accent} /> });
    }
    return out;
  }, [activity, gpsPoints, laps, records, test, thresholds, accent]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  // Cached PNG data URLs per template idx — built once via offscreen SVG
  // render. After this the SVG can be unmounted; the preview shows the
  // PNG and share/save/copy reuse it. Keeping a live 1080×1920 SVG in
  // the DOM was what kept locking iOS WebView even with downsampled GPS.
  const [pngCache, setPngCache] = useState({});
  // Mirror in a ref so async polling in captureActive sees the latest value
  // without being blocked by stale state closure.
  const pngCacheRef = useRef({});
  useEffect(() => { pngCacheRef.current = pngCache; }, [pngCache]);
  const touchStart = useRef({ x: 0, y: 0, active: false });
  // Sync guard so a single tap can't double-invoke (touchEnd → synthesised
  // click both firing handleShare). Cleared in finally blocks.
  const inflightRef = useRef(false);

  // Reset state when the sheet (re)opens. Revoke any cached blob URLs from
  // the previous session — leaving them around would leak the underlying
  // PNG buffers (~340 kB × N templates) until the WebView is killed.
  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      setPngCache(prev => {
        Object.values(prev).forEach(p => {
          if (p?.objectUrl) URL.revokeObjectURL(p.objectUrl);
        });
        return {};
      });
    }
    return () => {
      if (!open) return;
      setPngCache(prev => {
        Object.values(prev).forEach(p => {
          if (p?.objectUrl) URL.revokeObjectURL(p.objectUrl);
        });
        return {};
      });
    };
  }, [open, templates.length]);

  // Generate PNG for the active template when not yet cached.
  // We use renderToStaticMarkup() to build the SVG as a *string* without
  // ever mounting it in the DOM — this is what finally unblocked iOS
  // WebView. The mere presence of a 1080×1920 SVG in the layout tree,
  // even off-screen with pointer-events:none, was enough to stall the
  // main thread for tens of seconds on FIT-imported activities.
  useEffect(() => {
    if (!open) return;
    const tmpl = templates[activeIdx];
    if (!tmpl) return;
    if (pngCacheRef.current[tmpl.id]) return; // already done
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        console.log('[share] rendering template to markup:', tmpl.id);
        const markup = renderToStaticMarkup(tmpl.node);
        console.log('[share] markup ready, converting to PNG');
        const png = await svgMarkupToPng(markup);
        if (cancelled) return;
        setPngCache(prev => ({ ...prev, [tmpl.id]: png }));
        console.log('[share] cached template', tmpl.id);
      } catch (e) {
        console.error('[share] capture failed for', tmpl.id, e);
        if (!cancelled) showToast(`Render failed: ${e?.message || 'unknown'}`);
      }
    }, 20);
    return () => { cancelled = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIdx, templates]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const goPrev = () => setActiveIdx(i => Math.max(0, i - 1));
  const goNext = () => setActiveIdx(i => Math.min(templates.length - 1, i + 1));

  // ── Swipe on the carousel viewport ──────────────────────────────────────
  const onTouchStart = (e) => {
    const t = e.touches?.[0]; if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY, active: true };
  };
  const onTouchEnd = (e) => {
    const s = touchStart.current; if (!s.active) return;
    s.active = false;
    const t = e.changedTouches?.[0]; if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) goNext(); else goPrev();
  };

  // ── Capture ─────────────────────────────────────────────────────────────
  // Use the cached PNG generated in the useEffect above. If for some reason
  // it isn't ready yet (user tapped Share within ~30 ms of opening the
  // sheet), wait up to 8 s for it instead of erroring.
  const captureActive = async () => {
    const tmpl = templates[activeIdx];
    if (!tmpl) throw new Error('No active template');
    const cached = pngCacheRef.current[tmpl.id];
    if (cached) return cached;
    // Poll the ref so we see fresh values as the offscreen render finishes
    for (let i = 0; i < 80; i++) {
      await new Promise(r => setTimeout(r, 100));
      const c = pngCacheRef.current[tmpl.id];
      if (c) return c;
    }
    throw new Error('Render took too long');
  };

  const handleShare = async () => {
    if (busy || inflightRef.current) return;
    inflightRef.current = true;
    setBusy(true);
    console.log('[share] handleShare: start');
    try {
      const { dataUrl, blob } = await captureActive();
      const fileName = `lachart-${Date.now()}.png`;
      console.log('[share] handleShare: capture done, native?', Capacitor.isNativePlatform());

      if (Capacitor.isNativePlatform()) {
        const base64 = dataUrlToBase64(dataUrl);
        console.log('[share] handleShare: writing file, base64 length=', base64.length);
        const written = await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Cache,
          recursive: true,
        });
        console.log('[share] handleShare: file written at', written.uri);
        // Capacitor Share expects `files: [uri]` for local files. Passing
        // `url` works for web URLs but on some iOS builds it silently
        // shares an empty payload, which is what made the share button
        // look like it did nothing.
        await Share.share({
          title: 'LaChart',
          text: 'My activity',
          files: [written.uri],
          dialogTitle: 'Share activity',
        });
        console.log('[share] handleShare: Share.share resolved');
      } else if (typeof navigator.share === 'function' && blob) {
        const file = new File([blob], fileName, { type: 'image/png' });
        try {
          await navigator.share({ files: [file], title: 'LaChart' });
        } catch (e) {
          if (String(e?.name) === 'AbortError') return;
          throw e;
        }
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast('Downloaded');
      }
    } catch (e) {
      console.error('[share] failed:', e);
      showToast(`Share failed: ${e?.message || 'unknown'}`);
    } finally {
      inflightRef.current = false;
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (busy || inflightRef.current) return;
    inflightRef.current = true;
    setBusy(true);
    try {
      const { dataUrl } = await captureActive();
      const fileName = `lachart-${Date.now()}.png`;
      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          path: fileName,
          data: dataUrlToBase64(dataUrl),
          directory: Directory.Documents,
          recursive: true,
        });
        showToast('Saved to Files');
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast('Download started');
      }
    } catch (e) {
      console.error('[save] failed:', e);
      showToast(`Save failed: ${e?.message || 'unknown'}`);
    } finally {
      inflightRef.current = false;
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (busy || inflightRef.current) return;
    inflightRef.current = true;
    setBusy(true);
    try {
      const { blob } = await captureActive();
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('Copied to clipboard');
      } else {
        showToast('Clipboard unavailable');
      }
    } catch (e) {
      console.error('[copy] failed:', e);
      showToast(`Copy failed: ${e?.message || 'unknown'}`);
    } finally {
      inflightRef.current = false;
      setBusy(false);
    }
  };

  if (!open || templates.length === 0) return null;

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10010,
        background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'shareFadeIn .2s ease both',
      }}
    >
      <style>{`
        @keyframes shareFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes shareSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 540,
          background: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
          // 32 px (was 22) + safe-area inset so action buttons clear the iOS
          // home-gesture strip at the bottom. Taps in the bottom ~20 px of
          // the screen are intercepted by iOS for the home gesture before
          // the WebView ever sees them — which is exactly why Copy/Save/Share
          // looked unresponsive.
          padding: '12px 0 calc(32px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          animation: 'shareSlideUp .28s cubic-bezier(.22,1,.36,1) both',
          fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Drag handle */}
        <div style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, background: 'rgba(0,0,0,.18)', marginBottom: 10 }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px 12px', borderBottom: '1px solid #F0F0F2',
        }}>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', fontFamily: 'inherit',
            fontSize: 16, fontWeight: 600, color: '#0A0E1A', cursor: 'pointer', padding: 4,
          }}>Close</button>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#0A0E1A' }}>Share activity</span>
          <span style={{ width: 56 }} />
        </div>

        {/* No offscreen SVG mount — markup is generated via
            renderToStaticMarkup() in the useEffect above, never touching
            the live DOM. iOS WebView used to stall for ~20 s just laying
            out the 1080×1920 element off-screen. */}

        {/* Preview carousel — shows the cached PNG (or a spinner while
            the offscreen render is in flight). The PNG is ~80 kB lightweight
            so iOS WebView happily renders many of them. */}
        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{
            position: 'relative',
            padding: '20px 0 8px',
            display: 'flex', justifyContent: 'center',
            touchAction: 'pan-y',
          }}
        >
          <div
            key={activeIdx}
            style={{
              width: PREVIEW_W, height: PREVIEW_H,
              borderRadius: 16, overflow: 'hidden',
              background: `
                linear-gradient(45deg, #4a4a4a 25%, transparent 25%),
                linear-gradient(-45deg, #4a4a4a 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, #4a4a4a 75%),
                linear-gradient(-45deg, transparent 75%, #4a4a4a 75%)`,
              backgroundSize: '24px 24px',
              backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px',
              backgroundColor: '#2a2a2a',
              boxShadow: '0 12px 32px -8px rgba(0,0,0,.35)',
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'shareFade .22s ease both',
            }}
          >
            <style>{`
              @keyframes shareFade { from { opacity: 0; } to { opacity: 1; } }
              @keyframes shareSpin { to { transform: rotate(360deg); } }
            `}</style>
            {pngCache[templates[activeIdx]?.id] ? (
              <img
                src={pngCache[templates[activeIdx]?.id].objectUrl || pngCache[templates[activeIdx]?.id].dataUrl}
                alt={templates[activeIdx]?.label}
                style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
              />
            ) : (
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                border: '3px solid rgba(255,255,255,.25)',
                borderTopColor: 'rgba(255,255,255,.85)',
                animation: 'shareSpin .9s linear infinite',
              }} />
            )}
          </div>

          {/* Prev / Next chevrons */}
          {templates.length > 1 && activeIdx > 0 && (
            <button onClick={goPrev} aria-label="Previous template" style={chevronStyle('left')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          {templates.length > 1 && activeIdx < templates.length - 1 && (
            <button onClick={goNext} aria-label="Next template" style={chevronStyle('right')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>

        {/* Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '4px 0 8px' }}>
          {templates.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              aria-label={`Slide ${i + 1}`}
              style={{
                width: i === activeIdx ? 18 : 7, height: 7, borderRadius: 4,
                background: i === activeIdx ? '#0A0E1A' : 'rgba(10,14,26,.18)',
                border: 'none', padding: 0, cursor: 'pointer',
                transition: 'all .25s ease',
              }}
            />
          ))}
        </div>

        {/* Current template label */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#6B7280', fontWeight: 700, marginBottom: 14 }}>
          {templates[activeIdx]?.label}
        </div>

        {/* Action buttons */}
        <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <ActionButton icon="copy" label="Copy"  onClick={handleCopy} disabled={busy} />
          <ActionButton icon="save" label="Save"  onClick={handleSave} disabled={busy} />
          <ActionButton icon="share" label={busy ? 'Working…' : 'Share'} onClick={handleShare} disabled={busy} primary />
        </div>

        {toast && (
          <div style={{
            position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,.85)', color: '#fff', padding: '10px 18px', borderRadius: 12,
            fontSize: 13, fontWeight: 700, pointerEvents: 'none',
            maxWidth: '88%', textAlign: 'center',
          }}>
            {toast}
          </div>
        )}
      </div>
    </div>,
    document.getElementById('app-modal-root') || document.body
  );
}

function chevronStyle(side) {
  return {
    position: 'absolute',
    top: '50%',
    [side]: 8,
    transform: 'translateY(-50%)',
    width: 38, height: 38, borderRadius: '50%',
    background: 'rgba(255,255,255,.92)',
    border: '1px solid rgba(0,0,0,.08)',
    color: '#0A0E1A',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 8px -2px rgba(0,0,0,.18)',
    padding: 0,
    zIndex: 2,
    WebkitTapHighlightColor: 'transparent',
  };
}

function ActionButton({ icon, label, onClick, disabled, primary }) {
  // Wrap onClick with a tiny tap log so we can confirm in Safari Web
  // Inspector that taps are actually reaching the React handler. If you
  // tap and nothing logs, the event is being swallowed before React sees
  // it (home-gesture conflict, overlay capture, etc).
  const handle = (e) => {
    console.log('[share] ActionButton tap:', label);
    if (typeof onClick === 'function') onClick(e);
  };
  const iconMap = {
    copy:  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
    save:  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
    share: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>,
  };
  return (
    <button
      type="button"
      onClick={handle}
      onTouchEnd={(e) => {
        // Some iOS WebView builds drop the synthesised click after touchend
        // when the home gesture grabs partial control. Fire onClick from
        // the touchend too — React's synthetic system de-dupes if click
        // also fires.
        if (disabled) return;
        if (e.cancelable) e.preventDefault();
        handle(e);
      }}
      disabled={disabled}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '12px 8px', borderRadius: 14,
        border: 'none',
        background: primary ? '#0A0E1A' : '#F4F4F6',
        color: primary ? '#fff' : '#0A0E1A',
        fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        gap: 4,
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
      }}
    >
      {iconMap[icon]}
      <span>{label}</span>
    </button>
  );
}
