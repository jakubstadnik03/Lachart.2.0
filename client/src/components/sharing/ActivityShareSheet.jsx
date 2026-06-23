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
import { WEEKLY_STORIES } from './templates/WeeklySummaryStories';
import { toWeek } from './weeklySummaryToWeek';
import SharePaletteProvider from './SharePaletteProvider';
import { shareCanvasColor } from './shareTheme';
import { activityCanvasColor } from './templates/activityShareChrome';
import { getStravaActivityDetail } from '../../services/api';

// Templates internally use a 1080×1920 viewBox (IG Story native) but we
// rasterise to 720×1280. Why: on iOS the Capacitor JS↔Native bridge
// serialises file payloads via JSON.stringify, which on a 450 kB base64
// string blocks the WebView main thread for ~600 ms — visible as a "frozen
// app" after tapping Save / Share. At 720×1280 the PNG drops to ~140 kB
// (base64 ~190 kB), bridge transfer is <100 ms, and the visual loss is
// invisible on phones because IG itself downsamples shared stories to
// roughly this resolution before display anyway.
const TEMPLATE_W = 720;
const TEMPLATE_H = 1280;
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

async function svgMarkupToPng(rawMarkup, { transparent = false, theme = 'dark', activityStyle = false } = {}) {
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
  // Paint an opaque background BEFORE drawing the SVG. The share templates
  // render their own visual content over transparency (so the SVG itself
  // doesn't carry a background fill), which historically produced a PNG
  // with alpha — visible as a checkerboard in the preview, Instagram, etc.
  // The dark slate matches the in-template surface so visible joins are
  // imperceptible even if a template ever leaves a hairline gap.
  // Skip the opaque fill when the caller wants a transparent PNG (alpha kept).
  if (!transparent) {
    ctx.fillStyle = activityStyle ? activityCanvasColor(theme) : shareCanvasColor(theme);
    ctx.fillRect(0, 0, TEMPLATE_W, TEMPLATE_H);
  }
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
  summary = null, // { title, subtitle, sport, kpis, totals, workouts } → daily/weekly summary card
}) {
  const [heroMetric, setHeroMetric] = useState('distance');
  const [heroSecondary, setHeroSecondary] = useState({ time: true, tss: true, fitness: true, form: false });
  const [shareTheme, setShareTheme] = useState('dark');
  const [topMetric, setTopMetric] = useState('tss');
  const [topShowMap, setTopShowMap] = useState(false);
  const [topGpsPoints, setTopGpsPoints] = useState(null);

  const weekData = useMemo(() => (summary ? toWeek(summary) : null), [summary]);

  const topCanMap = useMemo(() => {
    if (!weekData?.top) return false;
    if (weekData.top.gpsPoints?.length > 1) return true;
    return Boolean(weekData.top.activityId);
  }, [weekData]);

  const pillBtn = (active) => ({
    padding: '6px 12px', borderRadius: 999, fontFamily: 'inherit',
    fontSize: 11, fontWeight: 700, cursor: 'pointer',
    border: active ? '1.5px solid #5E6590' : '1px solid #E5E7EB',
    background: active ? 'rgba(94,101,144,.12)' : '#fff',
    color: active ? '#5E6590' : '#6B7280',
  });

  const renderTemplateMarkup = (Comp, props) => renderToStaticMarkup(
    React.createElement(
      SharePaletteProvider,
      { theme: props.theme || shareTheme },
      React.createElement(Comp, props),
    ),
  );

  // Each template is stored as a component + props so we can re-render it with
  // `transparent` on demand (the transparent export must skip the template's
  // own dark background, not just the canvas fill). Recomputed whenever any of
  // the source props change (activity, gps, laps, test, summary, …).
  const templates = useMemo(() => {
    const out = [];
    if (summary) {
      const week = weekData || toWeek(summary);
      const topGps = topGpsPoints?.length > 1 ? topGpsPoints : week.top?.gpsPoints;
      WEEKLY_STORIES
        .filter((s) => !s.requires || s.requires(week))
        .forEach((s) => out.push({
          id: s.id,
          label: s.label,
          Comp: s.Comp,
          props: {
            week,
            accent,
            theme: shareTheme,
            ...(s.id === 'hero' ? { metric: heroMetric, secondaryMetrics: heroSecondary } : {}),
            ...(s.id === 'top' ? {
              heroMetric: topMetric,
              showMap: topShowMap && topCanMap,
              gpsPoints: topGps || [],
            } : {}),
          },
        }));
      return out;
    }
    if (test) {
      out.push({ id: 'lactate', label: 'Lactate curve', Comp: LactateCurveTemplate, props: { test, thresholds, accent } });
      return out;
    }
    if (Array.isArray(gpsPoints) && gpsPoints.length > 1) {
      out.push({ id: 'route', label: 'Route + stats', Comp: RouteStatsTemplate, props: { activity: activity || {}, gpsPoints, accent } });
    }
    out.push({ id: 'stats', label: 'Stats', Comp: StatsOnlyTemplate, props: { activity: activity || {}, accent } });
    if (Array.isArray(laps) && laps.length >= 2) {
      out.push({ id: 'laps', label: 'Laps + elevation + lactate', Comp: LapsElevationLactateTemplate, props: { activity: activity || {}, laps, records, accent } });
    }
    return out;
  }, [activity, gpsPoints, laps, records, test, thresholds, accent, summary, heroMetric, heroSecondary, shareTheme, topMetric, topShowMap, topGpsPoints, topCanMap, weekData]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [transparentBg, setTransparentBg] = useState(false); // export PNG with alpha (no dark fill)
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

  // Drag-to-dismiss state for the bottom sheet — track the vertical
  // distance dragged so we can both animate the sheet down with the
  // finger and fire onClose past a threshold (≈ 120 px).
  const [dragY, setDragY] = useState(0);
  const sheetTouchRef = useRef({ y: 0, active: false });
  const onSheetTouchStart = (e) => {
    const t = e.touches?.[0]; if (!t) return;
    sheetTouchRef.current = { y: t.clientY, active: true };
  };
  const onSheetTouchMove = (e) => {
    const s = sheetTouchRef.current; if (!s.active) return;
    const t = e.touches?.[0]; if (!t) return;
    const dy = t.clientY - s.y;
    if (dy > 0) setDragY(dy);
  };
  const onSheetTouchEnd = (e) => {
    const s = sheetTouchRef.current; if (!s.active) return;
    s.active = false;
    const t = e.changedTouches?.[0]; if (!t) { setDragY(0); return; }
    const dy = t.clientY - s.y;
    // Dismiss if dragged > 120 px OR thrown fast (rough velocity check via
    // total displacement — touchend doesn't give us velocity directly).
    if (dy > 120) {
      onClose();
    }
    setDragY(0);
  };

  // Reset state when the sheet (re)opens. Revoke any cached blob URLs from
  // the previous session — leaving them around would leak the underlying
  // PNG buffers (~340 kB × N templates) until the WebView is killed.
  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      setHeroMetric('distance');
      setHeroSecondary({ time: true, tss: true, fitness: true, form: false });
      setShareTheme('dark');
      setTopMetric('tss');
      setTopShowMap(false);
      setTopGpsPoints(null);
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

  // Re-render hero card when the user picks a different headline metric.
  useEffect(() => {
    if (!open || !summary) return;
    setPngCache((prev) => {
      if (!prev.hero) return prev;
      const next = { ...prev };
      if (next.hero?.objectUrl) URL.revokeObjectURL(next.hero.objectUrl);
      delete next.hero;
      return next;
    });
  }, [heroMetric, heroSecondary, open, summary]);

  // Re-render all weekly cards when light/dark theme changes.
  useEffect(() => {
    if (!open || !summary) return;
    setPngCache((prev) => {
      if (!Object.keys(prev).length) return prev;
      Object.values(prev).forEach((v) => {
        if (v?.objectUrl) URL.revokeObjectURL(v.objectUrl);
      });
      return {};
    });
  }, [shareTheme, open, summary]);

  // Re-render top session when metric / map options change.
  useEffect(() => {
    if (!open || !summary) return;
    setPngCache((prev) => {
      if (!prev.top) return prev;
      const next = { ...prev };
      if (next.top?.objectUrl) URL.revokeObjectURL(next.top.objectUrl);
      delete next.top;
      return next;
    });
  }, [topMetric, topShowMap, topGpsPoints, open, summary]);

  // Load GPS track for top session when map is enabled.
  useEffect(() => {
    if (!open || !summary || !topShowMap || !weekData?.top) {
      if (!topShowMap) setTopGpsPoints(null);
      return undefined;
    }
    const embedded = weekData.top.gpsPoints;
    if (embedded?.length > 1) {
      setTopGpsPoints(embedded);
      return undefined;
    }
    const id = weekData.top.activityId;
    if (!id) return undefined;
    let cancelled = false;
    getStravaActivityDetail(id)
      .then((data) => {
        if (cancelled) return;
        const latlng = data?.streams?.latlng?.data || data?.streams?.latlng || [];
        const pts = latlng.filter((p) => Array.isArray(p) && p[0] != null);
        if (pts.length > 1) setTopGpsPoints(pts);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, summary, topShowMap, weekData]);

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
        let markup;
        try {
          markup = renderTemplateMarkup(tmpl.Comp, tmpl.props);
        } catch (renderErr) {
          throw new Error(renderErr?.message || String(renderErr) || 'SVG render failed');
        }
        console.log('[share] markup ready, converting to PNG');
        const png = await svgMarkupToPng(markup, {
          theme: tmpl.props.theme || shareTheme,
          activityStyle: !summary,
        });
        if (cancelled) return;
        setPngCache(prev => ({ ...prev, [tmpl.id]: png }));
        console.log('[share] cached template', tmpl.id);
      } catch (e) {
        const msg = e?.message || (typeof e === 'string' ? e : JSON.stringify(e)) || 'unknown';
        console.error('[share] capture failed for', tmpl.id, msg, e);
        if (!cancelled) showToast(`Render failed (${tmpl.label}): ${msg}`);
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
    // Transparent export isn't cached (the cache holds the opaque variant) —
    // render it fresh on demand so the PNG keeps its alpha channel.
    if (transparentBg) {
      // Re-render the template WITH transparent so it omits its own dark
      // background, then keep the canvas alpha too.
      const markup = renderTemplateMarkup(tmpl.Comp, { ...tmpl.props, transparent: true });
      return await svgMarkupToPng(markup, {
        transparent: true,
        theme: tmpl.props.theme || shareTheme,
        activityStyle: !summary,
      });
    }
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

  // Share/save a captured PNG without hard-depending on the Capacitor
  // Filesystem plugin (which isn't registered in this iOS build → "not
  // implemented on ios"). iOS WKWebView supports the Web Share API with
  // files, which opens the native sheet (Save Image, Copy, Messages…). We
  // try that first and only fall back to Filesystem+Capacitor Share if the
  // Web Share API can't take files on this platform.
  const shareBlob = async (blob, dataUrl, fileName) => {
    const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
    // 1) Web Share API with files — works in iOS WKWebView, no native plugin.
    if (file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'LaChart' });
      return 'shared';
    }
    // 2) Native fallback via Capacitor (only if Filesystem is actually present).
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable?.('Filesystem')) {
      const written = await Filesystem.writeFile({
        path: fileName, data: dataUrlToBase64(dataUrl), directory: Directory.Cache, recursive: true,
      });
      await Share.share({ title: 'LaChart', text: 'My activity', files: [written.uri], dialogTitle: 'Share activity' });
      return 'shared';
    }
    // 3) Plain Web Share (no files) or <a download> on desktop web.
    if (file && typeof navigator.share === 'function') {
      await navigator.share({ files: [file], title: 'LaChart' });
      return 'shared';
    }
    const link = document.createElement('a');
    link.href = dataUrl; link.download = fileName;
    document.body.appendChild(link); link.click(); link.remove();
    return 'downloaded';
  };

  const handleShare = async () => {
    if (busy || inflightRef.current) return;
    inflightRef.current = true;
    setBusy(true);
    console.log('[share] handleShare: start');
    try {
      const { dataUrl, blob } = await captureActive();
      const fileName = `lachart-${Date.now()}.png`;
      try {
        const res = await shareBlob(blob, dataUrl, fileName);
        if (res === 'downloaded') showToast('Downloaded');
      } catch (e) {
        if (String(e?.name) === 'AbortError') return; // user cancelled the sheet
        throw e;
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
      const { dataUrl, blob } = await captureActive();
      const fileName = `lachart-${Date.now()}.png`;
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable?.('Filesystem')) {
        // Native build that actually has the Filesystem plugin → save to Files.
        await Filesystem.writeFile({
          path: fileName, data: dataUrlToBase64(dataUrl), directory: Directory.Documents, recursive: true,
        });
        showToast('Saved to Files');
      } else if (Capacitor.isNativePlatform()) {
        // No Filesystem plugin on iOS → route through the native share sheet,
        // where the user can tap "Save Image" to store it in Photos.
        try {
          const res = await shareBlob(blob, dataUrl, fileName);
          if (res === 'downloaded') showToast('Download started');
        } catch (e) {
          if (String(e?.name) === 'AbortError') return;
          throw e;
        }
      } else {
        const link = document.createElement('a');
        link.href = dataUrl; link.download = fileName;
        document.body.appendChild(link); link.click(); link.remove();
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
      const { blob, dataUrl } = await captureActive();
      // The async Clipboard image API is unreliable inside the iOS WKWebView
      // (it either throws or copies a partial image), so only use it on web.
      // On native we go straight to the share sheet, where "Copy" copies the
      // full PNG correctly.
      if (!Capacitor.isNativePlatform() && navigator.clipboard && window.ClipboardItem) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          showToast('Copied to clipboard');
          return;
        } catch (_) { /* fall back to the share sheet below */ }
      }
      const fileName = `lachart-${Date.now()}.png`;
      try {
        const res = await shareBlob(blob, dataUrl, fileName);
        if (res === 'downloaded') showToast('Downloaded');
      } catch (e) {
        if (String(e?.name) === 'AbortError') return;
        throw e;
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
        // Sit above EVERYTHING — Activity full-modal lives at z-10001 and on
        // iOS WKWebView two stacked position:fixed overlays sometimes lose
        // touch hit-testing for the upper one. Maxing the z-index plus the
        // explicit pointerEvents:auto below forces iOS to route touches to
        // the share sheet, not the modal that's painted underneath.
        position: 'fixed', inset: 0, zIndex: 2147483647,
        pointerEvents: 'auto',
        background: 'rgba(0,0,0,.55)', WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'shareFadeIn .2s ease both',
        touchAction: 'manipulation',
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
          // Slide in once, then follow the finger when dragging; spring back
          // when released below the dismiss threshold.
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY > 0 ? 'none' : 'transform .25s cubic-bezier(.22,1,.36,1)',
          animation: dragY === 0 ? 'shareSlideUp .28s cubic-bezier(.22,1,.36,1) both' : undefined,
          fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Drag handle area — swipe down anywhere on the top strip to
            dismiss. The visible pill is just a hint; the whole header is
            the actual gesture target so it's easy to grab. */}
        <div
          onTouchStart={onSheetTouchStart}
          onTouchMove={onSheetTouchMove}
          onTouchEnd={onSheetTouchEnd}
          style={{
            alignSelf: 'stretch',
            paddingTop: 6, paddingBottom: 6,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            cursor: 'grab',
            touchAction: 'none', // we handle the gesture ourselves
          }}
        >
          <div style={{ width: 44, height: 5, borderRadius: 3, background: 'rgba(0,0,0,.22)' }} />
        </div>

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
        <div style={{ textAlign: 'center', fontSize: 12, color: '#6B7280', fontWeight: 700, marginBottom: 10 }}>
          {templates[activeIdx]?.label}
        </div>

        {/* Hero stat metric picker (weekly summary only) */}
        {summary && templates[activeIdx]?.id === 'hero' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', padding: '0 16px', marginBottom: 8 }}>
              {[
                { id: 'distance', label: 'Distance' },
                { id: 'tss', label: 'TSS' },
                { id: 'time', label: 'Time' },
                { id: 'activities', label: 'Sessions' },
              ].map((opt) => (
                <button key={opt.id} type="button" onClick={() => setHeroMetric(opt.id)} style={pillBtn(heroMetric === opt.id)}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap', padding: '0 16px', marginBottom: 10 }}>
              {[
                { id: 'time', label: 'Time' },
                { id: 'tss', label: 'TSS' },
                { id: 'fitness', label: 'Fitness' },
                { id: 'form', label: 'Form' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setHeroSecondary((prev) => ({ ...prev, [opt.id]: !prev[opt.id] }))}
                  style={pillBtn(heroSecondary[opt.id])}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Top session options */}
        {summary && templates[activeIdx]?.id === 'top' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'tss', label: 'TSS' },
                { id: 'distance', label: 'Distance' },
                { id: 'time', label: 'Time' },
                { id: 'speed', label: 'Speed' },
              ].map((opt) => (
                <button key={opt.id} type="button" onClick={() => setTopMetric(opt.id)} style={pillBtn(topMetric === opt.id)}>
                  {opt.label}
                </button>
              ))}
            </div>
            {topCanMap && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => setTopShowMap((v) => !v)}
                  style={pillBtn(topShowMap)}
                >
                  {topShowMap ? 'Map ON' : 'Show map'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Light / dark theme (weekly summary) */}
        {summary && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '0 16px', marginBottom: 10 }}>
            {[
              { id: 'dark', label: 'Dark' },
              { id: 'light', label: 'Light' },
            ].map((opt) => (
              <button key={opt.id} type="button" onClick={() => setShareTheme(opt.id)} style={pillBtn(shareTheme === opt.id)}>
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Transparent-background toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, padding: '0 16px' }}>
          <button
            type="button"
            onClick={() => setTransparentBg(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '7px 14px', borderRadius: 999, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${transparentBg ? '#6366F1' : '#E5E7EB'}`,
              background: transparentBg ? '#EEF2FF' : '#fff',
              color: transparentBg ? '#4F46E5' : '#6B7280',
              maxWidth: '100%', flexWrap: 'wrap', justifyContent: 'center',
            }}
          >
            <span style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0,
              border: '1px solid rgba(0,0,0,.15)',
              backgroundImage: 'linear-gradient(45deg,#cbd5e1 25%,transparent 25%),linear-gradient(-45deg,#cbd5e1 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#cbd5e1 75%),linear-gradient(-45deg,transparent 75%,#cbd5e1 75%)',
              backgroundSize: '8px 8px', backgroundPosition: '0 0,0 4px,4px -4px,-4px 0', backgroundColor: '#fff',
            }} />
            <span style={{ whiteSpace: 'nowrap' }}>Transparent</span>
            <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{transparentBg ? 'ON' : 'OFF'}</span>
          </button>
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
