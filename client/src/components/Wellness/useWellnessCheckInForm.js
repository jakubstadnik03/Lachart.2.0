/**
 * State and save logic for the wellness check-in form, shared by the web sheet
 * (WellnessCheckInSheet) and the native one (NativeWellnessCheckInSheet), so
 * the two only differ in chrome.
 */
import { useEffect, useMemo, useState } from 'react';
import { saveWellnessCheckIn } from '../../services/wellnessCheckInApi';
import { fetchHealthToday } from '../../services/healthApi';
import { WELLNESS_AREAS } from './wellnessCopy';

/** Open episodes of the matching kind, for "update what is already logged". */
function matchingEpisodes(items, { pain, illness }) {
  return (items || []).filter((it) => {
    const kind = it?.catalogEntry?.kind || it?.episode?.kind;
    return (illness && kind === 'illness') || (pain && kind !== 'illness');
  });
}

export default function useWellnessCheckInForm({ open, existing, onSaved }) {
  const [answers, setAnswers] = useState({});
  const [pain, setPain] = useState(null);
  const [illness, setIllness] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null); // { checkIn, band }
  const [openEpisodes, setOpenEpisodes] = useState(null);

  // Reset only when the sheet opens. Keying on `existing` too would wipe the
  // "saved" step the moment the parent refreshes with the new answers.
  useEffect(() => {
    if (!open) return;
    const a = {};
    WELLNESS_AREAS.forEach(({ key }) => { a[key] = existing?.[key] ?? null; });
    setAnswers(a);
    setPain(existing ? Boolean(existing.pain) : null);
    setIllness(existing ? Boolean(existing.illness) : null);
    setNote(existing?.note || '');
    setSaved(null);
    setError(null);
    setOpenEpisodes(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const answered = WELLNESS_AREAS.filter(({ key }) => answers[key] != null).length
    + (pain != null ? 1 : 0) + (illness != null ? 1 : 0);
  const total = WELLNESS_AREAS.length + 2;
  const complete = answered === total;

  const handoffNeeded = Boolean(saved && (saved.checkIn.pain || saved.checkIn.illness));
  useEffect(() => {
    if (!handoffNeeded || openEpisodes) return;
    fetchHealthToday().then(setOpenEpisodes).catch(() => setOpenEpisodes([]));
  }, [handoffNeeded, openEpisodes]);

  const relevantEpisodes = useMemo(
    () => matchingEpisodes(openEpisodes, saved?.checkIn || {}),
    [openEpisodes, saved],
  );

  const setAnswer = (key, v) => setAnswers((prev) => ({ ...prev, [key]: v }));

  const save = async () => {
    if (!complete || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveWellnessCheckIn({
        ...answers,
        pain,
        illness,
        note: note.trim(),
        date: existing?.date || undefined,
      });
      setSaved(result);
      onSaved?.(result);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return {
    answers, setAnswer,
    pain, setPain,
    illness, setIllness,
    note, setNote: (v) => setNote(String(v).slice(0, 500)),
    saving, error, saved, save,
    answered, total, complete,
    handoffNeeded, episodesLoaded: openEpisodes != null, relevantEpisodes,
  };
}
