/**
 * Asking why someone is leaving is only acceptable if it costs them nothing.
 * The properties worth pinning down are therefore the restraint ones: nothing
 * is preselected, the note box stays out of the way until it is wanted, and
 * the ids sent to the server are the ones the server actually accepts.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CancelReasonPicker from './CancelReasonPicker';
import { CANCEL_REASONS } from '../../constants/cancelReasons';

/** renderToStaticMarkup escapes apostrophes, so compare on decoded text. */
const decode = (html) => html
  .replace(/&#x27;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&');

const render = (props) => renderToStaticMarkup(
  <CancelReasonPicker
    reason={null}
    onReason={() => {}}
    note=""
    onNote={() => {}}
    {...props}
  />,
);

describe('CancelReasonPicker', () => {
  it('says the question is optional, in those words', () => {
    const html = render();
    expect(html).toContain('(optional)');
  });

  it('offers every reason and preselects none of them', () => {
    const html = render();
    for (const r of CANCEL_REASONS) expect(decode(html)).toContain(r.label);
    expect(html).not.toContain('aria-pressed="true"');
  });

  it('separates price, missing capability and never getting set up', () => {
    // Collapsing these is what made the churn unreadable in the first place.
    const ids = CANCEL_REASONS.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['too_expensive', 'missing_feature', 'never_set_up']));
  });

  it('lets an athlete say they are only pausing for the off season', () => {
    expect(CANCEL_REASONS.map((r) => r.id)).toContain('off_season');
  });

  it('keeps the note box out of the dialog until a reason is picked', () => {
    expect(render()).not.toContain('<textarea');
    expect(render({ reason: 'too_expensive' })).toContain('<textarea');
  });

  it('marks the chosen reason for assistive tech', () => {
    const html = render({ reason: 'off_season' });
    expect(html).toContain('aria-pressed="true"');
    // Exactly one: these are a single choice, not a multi-select.
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it('disables every control while the cancel is in flight', () => {
    const html = render({ reason: 'other', disabled: true });
    const buttons = html.match(/<button[^>]*>/g) || [];
    expect(buttons.length).toBe(CANCEL_REASONS.length);
    for (const b of buttons) expect(b).toContain('disabled');
    expect(html).toMatch(/<textarea[^>]*disabled/);
  });
});
