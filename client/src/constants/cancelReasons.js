/**
 * The options in the cancel dialog, mirroring server/constants/cancelReasons.js.
 * Ids must match that list; the server drops anything it does not recognise.
 *
 * They are worded as the subscriber would say it, and they exist to separate
 * fixes that look identical in the churn numbers: price, missing capability,
 * and never having got the thing running. `off_season` is here because an
 * athlete pausing between seasons is not the same as one leaving unhappy.
 */
export const CANCEL_REASONS = [
  { id: 'never_set_up', label: "I never really got it set up" },
  { id: 'missing_feature', label: 'Something I needed was missing' },
  { id: 'too_expensive', label: 'Too expensive for what I use' },
  { id: 'using_something_else', label: "I'm using something else" },
  { id: 'off_season', label: "Off season — I'll be back" },
  { id: 'other', label: 'Something else' },
];

export const CANCEL_NOTE_MAX = 500;
