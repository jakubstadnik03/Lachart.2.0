/**
 * BottomSheet — shared modal wrapper
 *
 * • Bottom sheet on mobile (slides up from bottom)
 * • Centered dialog on desktop (sm:)
 * • Drag handle at the top — swipe down to close
 * • Consistent header: optional icon + title + X button
 * • Children rendered in a scrollable body
 *
 * Usage:
 *   <BottomSheet open={open} onClose={close} title="Record Lactate" icon={<BeakerIcon />}>
 *     ...content...
 *   </BottomSheet>
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';

export default function BottomSheet({
  open = true,
  onClose,
  title,
  /** Icon element rendered inside a rounded square on the left of the header */
  icon,
  /** Any extra node rendered on the right of the header (replaces default X) */
  headerRight,
  /** Extra classes on the sheet card */
  className = '',
  /** Max width class override (Tailwind) — default: sm:max-w-lg */
  maxWidth = 'sm:max-w-lg',
  /** Additional padding-bottom for bottom safe area inside the scrollable body */
  safeBottom = true,
  children,
}) {
  const dragControls = useDragControls();

  return ReactDOM.createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 flex items-end sm:items-center justify-center"
          style={{ zIndex: 99998 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Sheet card */}
          <motion.div
            className={`relative w-full ${maxWidth} bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden z-10 ${className}`}
            style={{ maxHeight: '92vh' }}
            /* Entrance animation */
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '110%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            /* Swipe-to-close — only initiated from the handle via dragControls */
            drag="y"
            dragControls={dragControls}
            dragListener={false}      /* don't capture drags on the content area */
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.35 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 450) onClose?.();
            }}
          >
            {/* ── Drag handle ──────────────────────────────────────────────
                touch-none prevents the browser from stealing the pointer
                for scroll while dragging the handle                       */}
            <div
              className="flex-shrink-0 pt-3 pb-0 flex flex-col items-center gap-0 cursor-grab active:cursor-grabbing select-none"
              style={{ touchAction: 'none' }}
              onPointerDown={e => dragControls.start(e)}
            >
              <div className="w-10 h-[5px] rounded-full bg-gray-300" />
            </div>

            {/* ── Header ───────────────────────────────────────────────── */}
            {(title || icon || headerRight !== undefined) && (
              <div className="flex-shrink-0 flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                  {icon && (
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {icon}
                    </div>
                  )}
                  {title && (
                    <h2 className="text-[15px] font-bold text-gray-900 leading-tight truncate">
                      {title}
                    </h2>
                  )}
                </div>
                {headerRight !== undefined ? headerRight : (
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 active:scale-95 transition-all flex-shrink-0 ml-2"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* ── Body ─────────────────────────────────────────────────── */}
            <div
              className="flex-1 overflow-y-auto min-h-0"
              style={safeBottom ? { paddingBottom: 'max(env(safe-area-inset-bottom, 8px), 8px)' } : undefined}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
