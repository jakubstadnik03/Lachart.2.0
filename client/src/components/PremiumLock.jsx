import { LockClosedIcon } from '@heroicons/react/24/outline';
import { usePremium } from '../hooks/usePremium';
import UpgradeModal from './UpgradeModal';
import { isCapacitorNative } from '../utils/isNativeApp';

/**
 * Gate a feature behind premium with a "locked" preview.
 *
 * When the user is premium the children render normally. When they are NOT,
 * the children are NOT mounted at all (so no data is fetched); instead we show
 * a blurred static placeholder with a lock badge and an "Unlock with Premium"
 * button that opens the upgrade flow (Stripe on web, App-Store-compliant
 * info sheet on native — handled by UpgradeModal).
 *
 * Props:
 *   feature    – label shown in the upgrade modal (e.g. "Form & Fitness")
 *   plan       – required plan id ('pro' | 'coach'), default 'pro'
 *   minHeight  – height of the locked placeholder (px), default 160
 *   preview    – optional static JSX rendered (blurred) behind the lock; when
 *                omitted a neutral skeleton is drawn. NEVER pass the real,
 *                data-fetching component here — keep it dumb so nothing loads.
 *   label      – small caption under the lock, default "Premium feature"
 */
export default function PremiumLock({
  feature = 'This feature',
  plan = 'pro',
  minHeight = 160,
  preview = null,
  label = 'Premium feature',
  className = '',
  children,
}) {
  const { isPremium, gate, UpgradeModalProps } = usePremium();
  const isNative = isCapacitorNative();
  const lockHeight = isNative ? Math.min(minHeight, 140) : minHeight;

  if (isPremium) return children;

  return (
    <>
      <div className={`relative overflow-hidden rounded-2xl border border-gray-100 ${className}`} style={{ minHeight: lockHeight }}>
        <div className="pointer-events-none select-none blur-[6px] opacity-50" aria-hidden="true">
          {preview || (
            <div className="p-3 space-y-2">
              <div className="h-3 w-1/3 rounded bg-gray-200" />
              <div className="h-14 w-full rounded-xl bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100" />
              <div className="flex gap-2">
                <div className="h-8 flex-1 rounded-lg bg-gray-100" />
                <div className="h-8 flex-1 rounded-lg bg-gray-100" />
              </div>
            </div>
          )}
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-white/45 backdrop-blur-[1px] px-4 text-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <LockClosedIcon className="h-4 w-4 text-primary" />
          </div>
          <div className="text-[12px] font-bold text-gray-700">{label}</div>
          <button
            type="button"
            onClick={() => gate(feature, plan)}
            className="mt-0.5 rounded-full bg-primary px-3.5 py-1.5 text-[11px] font-bold text-white shadow-sm active:opacity-80 touch-manipulation"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {isNative ? 'Learn more' : 'Unlock with Premium'}
          </button>
        </div>
      </div>

      <UpgradeModal {...UpgradeModalProps} />
    </>
  );
}
