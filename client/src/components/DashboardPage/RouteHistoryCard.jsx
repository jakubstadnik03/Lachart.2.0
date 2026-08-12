/**
 * RouteHistoryCard — the same loop, every time you've done it.
 *
 * Outdoors, no two sessions are comparable: wind, hills, traffic and route all
 * move more than training does. The one honest comparison an athlete gets is
 * the same loop against itself, which is why this exists — and why it leads
 * with time on the route rather than with anything derived.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRightIcon, TrophyIcon } from '@heroicons/react/24/outline';
import { getRouteHistory } from '../../services/api';

function formatTime(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function formatDelta(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s === 0) return 'same';
  const sign = s < 0 ? '−' : '+';
  return `${sign}${formatTime(Math.abs(s))}`;
}

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Route outline from the sampled points. Normalised to its own bounding box —
 * this is a thumbnail for recognition, not a map.
 */
function RouteThumb({ points, size = 44 }) {
  const path = useMemo(() => {
    if (!Array.isArray(points) || points.length < 2) return null;
    const lats = points.map((p) => p[0]);
    const lngs = points.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    // Latitude degrees are longer than longitude degrees away from the equator;
    // without the cosine correction every route looks stretched east-west.
    const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const spanLat = Math.max(1e-6, maxLat - minLat);
    const spanLng = Math.max(1e-6, (maxLng - minLng) * cos);
    const span = Math.max(spanLat, spanLng);
    const pad = 3;
    const scale = (size - pad * 2) / span;
    return points
      .map((p, i) => {
        const x = pad + ((p[1] - minLng) * cos) * scale + (size - pad * 2 - spanLng * scale) / 2;
        const y = size - pad - (p[0] - minLat) * scale - (size - pad * 2 - spanLat * scale) / 2;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [points, size]);

  if (!path) return <div style={{ width: size, height: size }} className="rounded-lg bg-gray-100" />;

  return (
    <svg width={size} height={size} className="rounded-lg bg-gray-50 shrink-0">
      <path d={path} fill="none" stroke="#6366F1" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Sparkline of times on the route — down is faster. */
function EffortTrend({ efforts }) {
  const timed = efforts.filter((e) => e.seconds > 0);
  if (timed.length < 2) return null;
  const times = timed.map((e) => e.seconds);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(1, max - min);
  const w = 70;
  const h = 20;
  const pts = timed
    .map((e, i) => `${(i / (timed.length - 1)) * w},${h - ((max - e.seconds) / span) * h}`)
    .join(' ');
  const bestIdx = times.indexOf(min);

  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="#94A3B8" strokeWidth="1.5" />
      <circle
        cx={(bestIdx / (timed.length - 1)) * w}
        cy={h - ((max - min) / span) * h}
        r="2.5"
        fill="#059669"
      />
    </svg>
  );
}

export default function RouteHistoryCard({ athleteId = null, limit = 4 }) {
  const navigate = useNavigate();
  const [routes, setRoutes] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!athleteId) return undefined;
    let cancelled = false;
    getRouteHistory(athleteId)
      .then((data) => { if (!cancelled) setRoutes(data?.routes || []); })
      .catch(() => { if (!cancelled) setRoutes([]); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [athleteId]);

  // Nothing to say until a route has actually been repeated — an empty
  // "you have no routes" card is just noise on the dashboard.
  if (!loaded || !routes.length) return null;

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-lg">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-base font-bold text-gray-900">Routes you repeat</h3>
        <span className="text-[10px] text-gray-400">The only fair outdoor comparison</span>
      </div>

      <div className="divide-y divide-gray-50">
        {routes.slice(0, limit).map((route) => {
          const latest = route.efforts[route.efforts.length - 1];
          const improving = route.deltaSeconds !== null && route.deltaSeconds < 0;
          return (
            <button
              key={`${route.name}-${route.distanceM}`}
              type="button"
              onClick={() => latest && navigate(`/training-calendar/${encodeURIComponent(latest.id)}`)}
              className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-gray-50/60 rounded-lg px-1 -mx-1"
            >
              <RouteThumb points={route.points} />

              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {route.name}
                  {route.isBestLatest ? (
                    <TrophyIcon className="inline-block w-3.5 h-3.5 ml-1.5 text-amber-500 align-text-bottom" />
                  ) : null}
                </div>
                <div className="text-[11px] text-gray-500">
                  {(route.distanceM / 1000).toFixed(1)} km · {route.count} times
                  {route.best ? <> · best {formatTime(route.best.seconds)}</> : null}
                </div>
              </div>

              <EffortTrend efforts={route.efforts} />

              <div className="text-right shrink-0 w-16">
                <div className="text-sm font-bold text-gray-900">
                  {latest?.seconds ? formatTime(latest.seconds) : '—'}
                </div>
                {route.deltaSeconds !== null ? (
                  <div className={`text-[10px] font-semibold ${improving ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {formatDelta(route.deltaSeconds)} vs first
                  </div>
                ) : null}
                <div className="text-[9px] text-gray-400">{formatDate(latest?.date)}</div>
              </div>

              <ChevronRightIcon className="w-4 h-4 text-gray-300 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
