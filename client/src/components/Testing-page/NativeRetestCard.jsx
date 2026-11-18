import { GlassCard, SectionTitle } from '../native/shared/Tiles';
import { useRetest } from '../../hooks/useRetest';
import { retestIntervalChoices, retestDueAt } from '../../utils/retestPlan';

/**
 * The retest card, phone rendering.
 *
 * Same behaviour as components/Testing-page/RetestCard (both drive the
 * useRetest hook, so the rules cannot drift) in this page's own style
 * vocabulary — GlassCard and inline styles rather than Tailwind.
 *
 * Why the loop exists, and why its reminders are in-app and push rather than
 * email, is in client/src/utils/retestPlan.js.
 */

const BTN = {
  padding: '8px 12px', borderRadius: 10,
  background: 'rgba(255,255,255,.6)',
  border: '1.5px solid #767EB5', color: '#5E6590',
  fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
  cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
};

const BTN_PRIMARY = {
  ...BTN, background: '#767EB5', color: '#fff', border: '1.5px solid #767EB5',
};

const LINK = {
  background: 'none', border: 'none', padding: '8px 4px',
  color: '#6B7280', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
};

export default function NativeRetestCard({ test, newerTestAt = null, onChanged, onAddTest }) {
  const {
    status, days, retest, busy, error, picking, setPicking,
    schedule, dismiss, clear, hidden,
  } = useRetest(test, newerTestAt, onChanged);

  if (hidden) return null;

  const fmt = (d) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    } catch { return ''; }
  };

  const Err = error
    ? <div style={{ marginTop: 8, fontSize: 11, color: '#B84238' }}>{error}</div>
    : null;

  if (status === 'scheduled' && !picking) {
    return (
      <GlassCard>
        <SectionTitle>Next test</SectionTitle>
        <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#0A0E1A' }}>
          {fmt(retest.dueAt)}
        </div>
        <div style={{ marginTop: 2, fontSize: 11.5, color: '#6B7280' }}>
          {days === 0 ? 'Today' : days === 1 ? 'In 1 day' : `In ${days} days`} · we will remind you here
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button type="button" style={{ ...LINK, color: '#5E6590' }} onClick={() => setPicking(true)} disabled={busy}>
            Change
          </button>
          <button type="button" style={LINK} onClick={clear} disabled={busy}>Remove</button>
        </div>
        {Err}
      </GlassCard>
    );
  }

  if (status === 'due' && !picking) {
    const overdue = typeof days === 'number' && days < 0;
    return (
      <GlassCard>
        <SectionTitle>{overdue ? 'Retest due' : 'Retest today'}</SectionTitle>
        <div style={{ marginTop: 6, fontSize: 11.5, color: '#4B5563', lineHeight: 1.45 }}>
          Save it and you will see both curves side by side — what moved, and where.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {onAddTest && (
            <button type="button" style={BTN_PRIMARY} onClick={onAddTest} disabled={busy}>Add test</button>
          )}
          <button type="button" style={BTN} onClick={() => setPicking(true)} disabled={busy}>Push back</button>
          <button type="button" style={LINK} onClick={dismiss} disabled={busy}>Not now</button>
        </div>
        {Err}
      </GlassCard>
    );
  }

  // none / overdue / picking — offer the intervals.
  return (
    <GlassCard>
      <SectionTitle>When will you test again?</SectionTitle>
      <div style={{ marginTop: 6, fontSize: 11.5, color: '#4B5563', lineHeight: 1.45 }}>
        A threshold only tells you something once it moves. Pick a date — we will remind
        you here, not by email.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {retestIntervalChoices().map((d) => {
          const due = retestDueAt(test.date, d);
          return (
            <button key={d} type="button" style={BTN} onClick={() => schedule(d)} disabled={busy}
              title={due ? `Due ${fmt(due)}` : undefined}>
              {d / 7} weeks
            </button>
          );
        })}
        {status !== 'overdue' && (
          <button type="button" style={LINK} onClick={dismiss} disabled={busy}>Not now</button>
        )}
      </div>
      {Err}
    </GlassCard>
  );
}
