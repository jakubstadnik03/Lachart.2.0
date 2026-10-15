'use strict';

/**
 * Numbers and dates as a person typed them, or a refusal that names the field.
 *
 * `Number("70,5")` is NaN, and NaN assigned to a Number path throws a Mongoose
 * CastError that the edit-profile handler does not catch — so it left the route
 * as a 500. The same goes for `new Date(x)` on an unparseable date.
 *
 * The damage is out of all proportion to the typo: the profile endpoint saves
 * the WHOLE form, so one comma in the weight box made every future save fail,
 * whatever the person was actually editing. An athlete updating his LT2 got
 * "statuscode500" over and over, and the message underneath it named `weight`
 * or `height` — a field he had not touched in months and had no reason to
 * suspect. There was no way to get out of it from inside the app.
 *
 * A decimal comma is accepted rather than refused: it is how most of Europe
 * writes 70,5 kg, and the alternative is telling a Dutch athlete his weight is
 * invalid. Thousands separators are not guessed at — "1,234" is ambiguous and
 * refusing it is better than silently storing the wrong number.
 */

/** @returns {{ok: true, value: number}|{ok: false, error: string}} */
function parseProfileNumber(raw, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: undefined };
  let text = typeof raw === 'string' ? raw.trim() : raw;
  if (typeof text === 'string') {
    // "70,5" → "70.5", but only when the comma is the one separator and what
    // follows it is not a group of three digits.
    if (/^-?\d+,\d+$/.test(text) && !/^-?\d+,\d{3}$/.test(text)) text = text.replace(',', '.');
  }
  const n = Number(text);
  if (!Number.isFinite(n)) {
    return { ok: false, error: `${field} must be a number — "${String(raw).slice(0, 32)}" is not one.` };
  }
  if (n < min || n > max) {
    return { ok: false, error: `${field} must be between ${min} and ${max}.` };
  }
  return { ok: true, value: n };
}

/** @returns {{ok: true, value: Date|undefined}|{ok: false, error: string}} */
function parseProfileDate(raw, field) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: undefined };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: `${field} is not a date we can read — "${String(raw).slice(0, 32)}".` };
  }
  return { ok: true, value: d };
}

/**
 * A Mongoose cast/validation failure is the client's bad field, not a server
 * fault: 400 naming the path, so the next one of these says which box to fix
 * instead of arriving as an opaque 500.
 */
function badInputResponse(error) {
  if (!error) return null;
  if (error.name === 'CastError' && error.path) {
    return { error: `${error.path} is not valid — "${String(error.value).slice(0, 32)}" cannot be stored.`, field: error.path };
  }
  if (error.name === 'ValidationError' && error.errors) {
    const [path, err] = Object.entries(error.errors)[0] || [];
    if (path) return { error: `${path} is not valid — ${err?.message || 'it was refused'}.`, field: path };
  }
  return null;
}

module.exports = { parseProfileNumber, parseProfileDate, badInputResponse };
