import { LockClosedIcon } from '@heroicons/react/24/outline';
import { usePremium } from '../hooks/usePremium';
import UpgradeModal from './UpgradeModal';
import { isCapacitorNative } from '../utils/isNativeApp';
import { useAuth } from '../context/AuthProvider';
import { planForUser } from '../utils/planForUser';
import { trackEvent } from '../utils/analytics';
import { ATHLETE_PLAN_PRICE_LABEL, COACH_PLAN_PRICE_LABEL, TRIAL_DAYS } from '../constants/planPricing';
import { useStorePurchase } from '../hooks/useStorePurchase';
import StorePurchaseFooter, { storeButtonLabel } from './StorePurchaseFooter';

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
 *   teaser     – optional JSX built from the user's OWN data (one real number
 *                or verdict), shown unblurred. Passing it or `unlocks` switches
 *                to the personal preview: their number, what Premium adds to
 *                it, and what it costs — instead of a blurred placeholder,
 *                which told nobody what they would be paying for.
 *   unlocks    – short list of what Premium adds on top of the teaser
 *   title      – heading of the personal preview, defaults to `feature`
 */
export default function PremiumLock({
  feature = 'This feature',
  plan = 'pro',
  minHeight = 160,
  preview = null,
  label = 'Premium feature',
  title = null,
  teaser = null,
  unlocks = null,
  className = '',
  children,
}) {
  const { isPremium, premiumResolved, gate, UpgradeModalProps } = usePremium();
  const isNative = isCapacitorNative();
  const lockHeight = isNative ? Math.min(minHeight, 140) : minHeight;

  if (isPremium) return children;

  // Until the profile lands, isPremium reads exactly like "free" — so every
  // navigation flashed a wall of "Premium feature" locks at a paying
  // subscriber before correcting itself. Show a quiet skeleton instead: we do
  // not yet know, so we claim nothing.
  const unknown = !premiumResolved;

  if (teaser || unlocks) {
    return (
      <PersonalPreviewLock
        title={title || feature}
        teaser={teaser}
        unlocks={unlocks}
        feature={feature}
        plan={plan}
        unknown={unknown}
        isNative={isNative}
        gate={gate}
        UpgradeModalProps={UpgradeModalProps}
        className={className}
      />
    );
  }

  return (
    <>
      <div className={`relative overflow-hidden rounded-2xl border border-gray-100 ${className}`} style={{ minHeight: lockHeight }}>
        <div className={`pointer-events-none select-none blur-[6px] opacity-50 ${unknown ? 'animate-pulse' : ''}`} aria-hidden="true">
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

        {!unknown && (
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
        )}
      </div>

      <UpgradeModal {...UpgradeModalProps} />
    </>
  );
}

const SUBSCRIBE_URL = 'https://lachart.net/settings?tab=subscription';

/**
 * The locked card as a personal preview: the user's own number up top, then
 * what Premium adds to it, the price, and one button.
 *
 * The terms (trial length, price after it, cancel any time) are stated in full,
 * as TrialOfferCard does. On iOS the button opens the App Store sheet
 * (useStorePurchase); on web it opens the Stripe flow. A native build without
 * in-app purchases configured still falls back to the website.
 */
function PersonalPreviewLock({
  title, teaser, unlocks, feature, plan, unknown, isNative, gate, UpgradeModalProps, className,
}) {
  const { user } = useAuth();
  const effectivePlan = planForUser(plan, user);
  const store = useStorePurchase(effectivePlan, 'premium_preview', { loadOffer: isNative && !unknown });
  const useStore = isNative && store.available;
  const price = store.priceLabel || (effectivePlan === 'coach' ? COACH_PLAN_PRICE_LABEL : ATHLETE_PLAN_PRICE_LABEL);

  const onUnlock = () => {
    trackEvent('premium_preview_click', { feature, plan: effectivePlan, native: isNative });
    if (useStore) {
      store.buy();
      return;
    }
    if (isNative) {
      window.open(SUBSCRIBE_URL, '_blank', 'noopener,noreferrer');
      return;
    }
    gate(feature, plan);
  };

  return (
    <>
      <div
        className={className}
        style={{
          background: '#fff',
          border: '1px solid #E5E7EB',
          borderRadius: 18,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0A0E1A' }}>{title}</div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
            color: '#5E6590', background: 'rgba(94,101,144,.1)', borderRadius: 999, padding: '3px 8px',
          }}>
            <LockClosedIcon style={{ width: 11, height: 11 }} />
            Premium
          </span>
        </div>

        {teaser && <div>{teaser}</div>}

        {Array.isArray(unlocks) && unlocks.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 6 }}>
              Premium adds:
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {unlocks.map((u) => (
                <li key={u} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
                  <span aria-hidden="true" style={{ color: '#4BA87D', fontWeight: 700 }}>✓</span>
                  <span>{u}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!unknown && (
          <>
            <button
              type="button"
              onClick={onUnlock}
              disabled={Boolean(store.busy)}
              className="touch-manipulation"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 14, border: 'none',
                background: '#5E6590', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                opacity: store.busy ? 0.7 : 1,
              }}
            >
              {useStore ? storeButtonLabel(store, store.trialEligible) : `Try it ${TRIAL_DAYS} days free`}
            </button>
            {useStore ? (
              <StorePurchaseFooter store={store} price={price} trialEligible={store.trialEligible} />
            ) : (
              <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', lineHeight: 1.5, textAlign: 'center' }}>
                Then {price} a month. Cancel any time before the trial ends and you are not charged.
                {isNative ? ' Opens lachart.net in your browser.' : ''}
              </p>
            )}
          </>
        )}
      </div>

      {!isNative && <UpgradeModal {...UpgradeModalProps} />}
    </>
  );
}
