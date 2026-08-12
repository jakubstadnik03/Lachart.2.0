/**
 * ChartMention — a metric named in coaching text, expandable into its chart.
 *
 * When the coach says "your heart rate drifted in the last twenty minutes", the
 * athlete's next thought is "did it?". Sending them to another screen to find
 * out loses the sentence they were reading; a chart that opens under the
 * paragraph answers the question where it was asked.
 *
 * Collapsed by default — a page of coaching text with six charts already open
 * is not readable.
 */
import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import InteractiveChart, { SERIES_COLORS } from './InteractiveChart';

export default function ChartMention({
  /** Text shown inline, e.g. "heart rate". */
  children,
  series = [],
  laps = [],
  xFormat,
  valueFormat,
  title = null,
}) {
  const [open, setOpen] = useState(false);
  const usable = (series || []).filter((s) => Array.isArray(s.points) && s.points.length > 1);
  const accent = SERIES_COLORS[usable[0]?.key] || SERIES_COLORS.default;

  // Without data behind it the mention is just a word — render it as one rather
  // than offering a button that opens an empty box.
  if (!usable.length) return <>{children}</>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-baseline gap-0.5 font-semibold underline decoration-dotted underline-offset-2 hover:opacity-80"
        style={{ color: accent }}
        aria-expanded={open}
      >
        {children}
        <ChartBarIcon className="w-3 h-3 self-center" />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="my-2 rounded-xl border border-gray-100 bg-gray-50 p-2.5">
              <InteractiveChart
                series={usable}
                laps={laps}
                xFormat={xFormat}
                valueFormat={valueFormat}
                title={title}
                height={160}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
