/**
 * MobileSwipeViews
 * ────────────────
 * 5 horizontally-swipeable pages of the live workout — designed for
 * one-handed phone use on a bike. The user can flick left / right to
 * switch view without taking their eyes off the road for more than a
 * fraction of a second.
 *
 * Pages (in order):
 *   1. NUMBERS    Huge live power, big HR, big cadence — minimalist
 *                 dashboard for outdoor / road riding.
 *   2. WORKOUT    Current step badge + countdown + target wattage +
 *                 power gauge — the "follow the plan" view.
 *   3. CHART      Full-screen live power+HR chart.
 *   4. STEPS      Scrollable list of all steps with averages + lactate
 *                 markers — same content the desktop sidebar shows.
 *   5. STATS      Live stats: avg power/HR/cadence/speed, NP, IF, TSS,
 *                 power zone distribution, HR zone distribution.
 *
 * Uses the existing `swiper` package (already in dependencies). Page
 * dots render below the swiper. The wrapper exposes the active page
 * index so the parent can persist it (so the same view comes back
 * after a tab-switch).
 *
 * Props are render functions for each page so we don't shuttle a giant
 * data bag through this component — keeps the swiper UI logic
 * separate from the workout state model.
 */
import React, { useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';

const PAGES = [
  { key: 'numbers', label: 'Numbers' },
  { key: 'workout', label: 'Workout' },
  { key: 'chart',   label: 'Chart'   },
  { key: 'steps',   label: 'Steps'   },
  { key: 'stats',   label: 'Stats'   },
];

export default function MobileSwipeViews({
  initialIndex = 1,
  onIndexChange,
  renderNumbers,
  renderWorkout,
  renderChart,
  renderSteps,
  renderStats,
}) {
  const [active, setActive] = useState(initialIndex);
  const handleSlide = (i) => {
    setActive(i);
    if (onIndexChange) onIndexChange(i);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full">
      {/* Page dots — tap to jump, or just visual cue while swiping */}
      <div className="flex items-center justify-center gap-1.5 py-2 flex-shrink-0">
        {PAGES.map((p, i) => (
          <button
            key={p.key}
            onClick={() => handleSlide(i)}
            aria-label={`Show ${p.label}`}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-md"
            style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
          >
            <span
              className="rounded-full transition-all"
              style={{
                width: active === i ? 18 : 5,
                height: 5,
                background: active === i ? '#a78bfa' : 'rgba(255,255,255,0.25)',
              }}
            />
            {active === i && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-primary">
                {p.label}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Swiper itself — flex-1 so each slide fills the available height */}
      <div className="flex-1 min-h-0">
        <Swiper
          slidesPerView={1}
          initialSlide={initialIndex}
          onSlideChange={(sw) => handleSlide(sw.activeIndex)}
          style={{ width: '100%', height: '100%' }}
        >
          <SwiperSlide style={{ overflowY: 'auto' }}>{renderNumbers && renderNumbers()}</SwiperSlide>
          <SwiperSlide style={{ overflowY: 'auto' }}>{renderWorkout && renderWorkout()}</SwiperSlide>
          <SwiperSlide style={{ overflowY: 'auto' }}>{renderChart   && renderChart()}</SwiperSlide>
          <SwiperSlide style={{ overflowY: 'auto' }}>{renderSteps   && renderSteps()}</SwiperSlide>
          <SwiperSlide style={{ overflowY: 'auto' }}>{renderStats   && renderStats()}</SwiperSlide>
        </Swiper>
      </div>
    </div>
  );
}
