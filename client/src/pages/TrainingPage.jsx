import React, { useEffect, useState, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import ReactDOM from 'react-dom';
import { PlusIcon, ListBulletIcon, ChevronDownIcon, CheckIcon, LockClosedIcon, SparklesIcon } from '@heroicons/react/24/outline';
import UserTrainingsTable from '../components/Training-log/UserTrainingsTable';
import TrainingForm from '../components/TrainingForm';
import { TrainingStats } from '../components/DashboardPage/TrainingStats';
import UpgradeModal from '../components/UpgradeModal';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import { addTraining, updateTraining, getStravaActivityDetail, createFieldLactateMeasurement, autoSyncStravaActivities, updateStravaLactateValues, assignFieldLactateMeasurement } from '../services/api';
import { maybeNotifyStravaActivitiesImported } from '../utils/stravaImportLocalNotification';
import { useNotification } from '../context/NotificationContext';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { isCapacitorNative } from '../utils/isNativeApp';
import { buildActivityMatcher, metricsPatchFromDetail, patchCalendarCache } from '../utils/activityEventPatches';
import NativeTrainingPage from './NativeTrainingPage';
import FieldLactateTrainingPanel from '../components/training/FieldLactateTrainingPanel';
import QuickAddLactateModal from '../components/training/QuickAddLactateModal';
import RecordLactateModal from '../components/training/RecordLactateModal';
import { motion, AnimatePresence } from 'framer-motion';
import { useCategories } from '../context/CategoryContext';
import { useAthleteSelection } from '../context/AthleteSelectionContext';

const TrainingComparison = lazy(() => import('../components/Training-log/TrainingComparison'));
const LapComparison = lazy(() => import('../components/Training-log/LapComparison'));

const COACH_LIKE_ROLES = ['coach', 'tester', 'testing', 'admin'];

export default function TrainingPage() {
  const { athleteId } = useParams();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { addNotification } = useNotification();
  const coachLike = COACH_LIKE_ROLES.includes(String(user?.role || '').toLowerCase());
  // ── Single source of truth for athlete selection ─────────────────────────────
  const { selectedAthleteId: _globalAthleteId, setSelectedAthleteId: _setGlobalAthleteId } = useAthleteSelection();
  const selectedAthleteId = coachLike ? (_globalAthleteId || user?._id || null) : (user?._id || null);
  const setSelectedAthleteId = _setGlobalAthleteId;
  const [trainings, setTrainings] = useState([]);
  // Initialize selectedSport with localStorage or default to 'all'
  const [selectedSport, setSelectedSport] = useState(() => {
    const saved = localStorage.getItem('trainingStats_selectedSport');
    return saved || 'all';
  });
  
  // Save to localStorage when selectedSport changes
  useEffect(() => {
    localStorage.setItem('trainingStats_selectedSport', selectedSport);
  }, [selectedSport]);

  // Listen for activity title renames (from CalendarView / ActivityFullModal)
  // and patch local trainings so charts/lists re-render without refetch.
  useEffect(() => {
    // Patch any cached training payloads (10-min TTL) so changes survive
    // a page reload, not just the current in-memory state.
    const cachePatch = (matcher, patcher) => {
      try {
        Object.keys(localStorage).forEach(key => {
          if (!key.startsWith('athleteTrainings_v3_') && !key.startsWith('calendarData_')) return;
          const raw = localStorage.getItem(key);
          if (!raw) return;
          try {
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return;
            let changed = false;
            const next = arr.map(t => { if (matcher(t)) { changed = true; return patcher(t); } return t; });
            if (changed) localStorage.setItem(key, JSON.stringify(next));
          } catch { /* ignore */ }
        });
      } catch { /* ignore */ }
    };
    const buildMatcher = (id) => {
      const rawId = String(id).replace(/^(strava-|fit-|regular-|training-)/, '');
      return (t) => String(t._id) === rawId || String(t.id) === rawId
                 || String(t.stravaId) === rawId || `strava-${t.stravaId}` === String(id)
                 || `fit-${t._id}` === String(id) || `regular-${t._id}` === String(id);
    };

    const onTitleUpdated = (e) => {
      const { id, title } = e?.detail || {};
      if (!id || !title) return;
      const matches = buildMatcher(id);
      const patch = (t) => ({ ...t, title, titleManual: title });
      setTrainings(prev => prev.map(t => matches(t) ? patch(t) : t));
      cachePatch(matches, patch);
    };
    const onCategoryUpdated = (e) => {
      const { id, category } = e?.detail || {};
      if (!id) return;
      const matches = buildMatcher(id);
      const patch = (t) => ({ ...t, category: category || null });
      setTrainings(prev => prev.map(t => matches(t) ? patch(t) : t));
      cachePatch(matches, patch);
    };
    const onMetricsUpdated = (e) => {
      const detail = e?.detail || {};
      const { id } = detail;
      if (!id) return;
      const matches = buildActivityMatcher(id);
      const patch = metricsPatchFromDetail(detail);
      if (!Object.keys(patch).length) return;
      setTrainings(prev => prev.map(t => matches(t) ? { ...t, ...patch } : t));
      patchCalendarCache(matches, patch);
    };
    window.addEventListener('activityTitleUpdated', onTitleUpdated);
    window.addEventListener('activityCategoryUpdated', onCategoryUpdated);
    window.addEventListener('activityMetricsUpdated', onMetricsUpdated);
    return () => {
      window.removeEventListener('activityTitleUpdated', onTitleUpdated);
      window.removeEventListener('activityCategoryUpdated', onCategoryUpdated);
      window.removeEventListener('activityMetricsUpdated', onMetricsUpdated);
    };
  }, []);
  const [selectedTitle, setSelectedTitle] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [error, setError] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTraining, setEditingTraining] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef(null);
  const { categories, getCategoryStyle } = useCategories();

  // Close category dropdown on Escape
  useEffect(() => {
    if (!categoryDropdownOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setCategoryDropdownOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [categoryDropdownOpen]);
  const [fieldLactatePanelKey, setFieldLactatePanelKey] = useState(0);
  const [lactateActivityLoadingId, setLactateActivityLoadingId] = useState(null);
  const [stravaLactateFormError, setStravaLactateFormError] = useState(null);
  const [stravaLactateModal, setStravaLactateModal] = useState({
    isOpen: false,
    initialData: null,
  });
  const [stravaLactateSubmitting, setStravaLactateSubmitting] = useState(false);
  const [quickLactateOpen, setQuickLactateOpen] = useState(false);
  const [showRecordLactate, setShowRecordLactate] = useState(false);

  // ── Subscription gate ─────────────────────────────────────────────────────
  // All features are free — subscription not required.
  const isFreePlan = false;
  const [upgradeModalFeature, setUpgradeModalFeature] = useState('');
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const openUpgradeModal = useCallback((feature) => {
    setUpgradeModalFeature(feature);
    setUpgradeModalOpen(true);
  }, []);
  // Set when the user picks "Chart" inside AssignLactateModal — the
  // pending FieldLactateMeasurement is stashed so handleStravaLactateFormSubmit
  // can reassign it to whichever lap the user filled in.
  const [pendingFieldLactate, setPendingFieldLactate] = useState(null);

  // Přidáme debug log pro user objekt
  // console.log('Current user:', user);

  const loadTrainings = useCallback(async (targetId) => {
    // Keep key in sync with DashboardPage so navigating between pages hits
    // the same localStorage entry and avoids a redundant network round-trip.
    // v3 — titleManual now wins over .title/.name in the merged mapping.
    const cacheKey = `athleteTrainings_v3_${targetId}`;
    const tsKey = `${cacheKey}_ts`;
    const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

    // One-time cleanup: remove old v1 entries that waste localStorage quota.
    try {
      localStorage.removeItem(`athleteTrainings_${targetId}`);
      localStorage.removeItem(`athleteTrainings_${targetId}_ts`);
    } catch (_) {}

    // TrainingGraph renders blank when the picked training has no `.results`
    // (intervals). FIT/Strava activities don't ship with `.results` — only
    // regular trainings do. Prefer the newest training that actually has
    // intervals; fall back to plain newest if none.
    const hasIntervals = (t) => Array.isArray(t?.results) && t.results.length > 0;
    const dateMs = (t) => {
      const v = t?.date || t?.timestamp || t?.startDate || t?.start_date || t?.startDateLocal;
      const ms = v ? new Date(v).getTime() : 0;
      return Number.isFinite(ms) ? ms : 0;
    };
    const pickDefault = (list) => {
      if (!list?.length) return null;
      const sorted = [...list].sort((a, b) => dateMs(b) - dateMs(a));
      return sorted.find(hasIntervals) ?? sorted[0] ?? null;
    };

    // 1) Zkusit načíst tréninky z cache pro rychlé vykreslení + select newest
    try {
      const cached = localStorage.getItem(cacheKey);
      const ts = localStorage.getItem(tsKey);
      if (cached && ts) {
        const age = Date.now() - parseInt(ts, 10);
        if (!Number.isNaN(age) && age < CACHE_TTL) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTrainings(parsed);
            // Default-select newest-with-results from cache so widgets aren't blank
            const newest = pickDefault(parsed);
            if (newest) {
              setSelectedTitle(prev => prev || newest.title);
              setSelectedTraining(prev => prev || newest._id || newest.id);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error reading trainings cache:', e);
    }

    // 2) Vždy se pokusíme data z API obnovit (stale-while-revalidate)
    try {
      setError(null);

      const response = await api.get(`/user/athlete/${targetId}/trainings`, {
        // kratší TTL v axios cache – chrání server při rychlém přepínání
        cacheTtlMs: 6000,
      });
      const [fitResponse, stravaResponse] = await Promise.all([
        api.get(`/api/fit/trainings`, { params: { athleteId: targetId } }).catch(() => ({ data: [] })),
        api.get(`/api/integrations/activities`, { params: { athleteId: targetId } }).catch(() => ({ data: [] }))
      ]);
      
      const rawTrainings = [
        ...response.data,
        ...(fitResponse.data || []).map(t => ({
          ...t,
          category: t.category || null,
          title: t.titleManual || t.title || t.titleAuto || t.originalFileName || null,
          date: t.date || t.timestamp || null,
          sport: (() => {
            const s = String(t.sport || '').toLowerCase();
            if (s === 'cycling' || s.includes('cycle') || s.includes('bike') || s.includes('ride')) return 'bike';
            if (s === 'running' || s.includes('run')) return 'run';
            if (s === 'swimming' || s.includes('swim')) return 'swim';
            return t.sport || null;
          })(),
        })),
        // Normalize Strava fields to match DashboardPage so shared cache entries
        // are always valid regardless of which page writes them first.
        ...(stravaResponse.data || []).map(a => ({
          ...a,
          category: a.category || null,
          date: a.date || a.startDate || a.timestamp || null,
          title: a.titleManual || a.name || a.title || null,
        }))
      ];

      // Deduplicate: prefer the entry with more data (results/power/lactate).
      // Same sourceStravaActivityId → keep richer one.
      // Same title + same calendar day → keep richer one.
      const scoreT = (t) => {
        const res = Array.isArray(t.results) ? t.results : [];
        return res.length * 10
          + (res.some(r => Number(r.power) > 0) ? 5 : 0)
          + (res.some(r => Number(r.lactate) > 0) || Number(t.lactate) > 0 ? 3 : 0);
      };
      // Pass 1: exact _id
      const seenId = new Set();
      const p1 = rawTrainings.filter(t => {
        const k = String(t._id || t.id || '');
        if (!k || seenId.has(k)) return false;
        seenId.add(k); return true;
      });
      // Pass 2: sourceStravaActivityId
      const byStrava = new Map();
      p1.forEach(t => {
        const sid = t.sourceStravaActivityId ? String(t.sourceStravaActivityId) : null;
        if (!sid) return;
        const prev = byStrava.get(sid);
        if (!prev || scoreT(t) > scoreT(prev)) byStrava.set(sid, t);
      });
      const stravaWinners = new Set([...byStrava.values()].map(t => String(t._id || t.id || '')));
      const p2 = p1.filter(t => {
        const sid = t.sourceStravaActivityId ? String(t.sourceStravaActivityId) : null;
        if (!sid) return true;
        return stravaWinners.has(String(t._id || t.id || ''));
      });
      // Pass 3: title + date
      const byTD = new Map();
      p2.forEach(t => {
        const k = `${String(t.title || '').trim()}|${new Date(t.date || 0).toDateString()}`;
        const prev = byTD.get(k);
        if (!prev || scoreT(t) > scoreT(prev)) byTD.set(k, t);
      });
      const tdWinners = new Set([...byTD.values()].map(t => String(t._id || t.id || '')));
      const allTrainings = p2.filter(t => tdWinners.has(String(t._id || t.id || '')));

      setTrainings(allTrainings);

      // Nastavení výchozího vybraného tréninku — preferuj nejnovější s intervaly,
      // jinak prostě nejnovější (TrainingGraph by jinak vyrenderoval prázdný stav).
      const sportFiltered = selectedSport === 'all'
        ? allTrainings
        : allTrainings.filter(t => t.sport === selectedSport);
      const newest = pickDefault(sportFiltered) ?? pickDefault(allTrainings);
      if (newest) {
        setSelectedTitle(newest.title);
        setSelectedTraining(newest._id || newest.id);
      }

      // 3) Uložit do localStorage, aby další stránky/otevření byly rychlé
      try {
        const payload = JSON.stringify(allTrainings);
        if (payload.length < 300000) {
          localStorage.setItem(cacheKey, payload);
          localStorage.setItem(tsKey, Date.now().toString());
        }
      } catch (e) {
        console.warn('Error saving trainings cache:', e);
      }
    } catch (err) {
      console.error('Error loading trainings:', err);
      //  setError('Failed to load trainings');
    }
  }, [selectedSport]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    if (coachLike && user?._id && !selectedAthleteId) {
      setSelectedAthleteId(user._id);
      return;
    }

    const targetId = selectedAthleteId || user._id;
    loadTrainings(targetId);
  }, [user, isAuthenticated, navigate, selectedAthleteId, loadTrainings, coachLike]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-sync Strava on page load so Field Lactate shows latest activities
  useEffect(() => {
    if (!user?._id || !user?.strava?.autoSync) return;
    const syncKey = `strava_auto_sync_training_${user._id}`;
    const lastSync = sessionStorage.getItem(syncKey);
    const now = Date.now();
    if (lastSync && (now - parseInt(lastSync)) < 5 * 60 * 1000) return;

    const performAutoSync = async () => {
      try {
        const result = await autoSyncStravaActivities();
        sessionStorage.setItem(syncKey, now.toString());
        if (result.imported > 0) {
          maybeNotifyStravaActivitiesImported(result.imported, user?.notifications, result.latestActivityId);
          addNotification(`Strava: ${result.imported} new ${result.imported === 1 ? 'activity' : 'activities'} imported`, 'success');
          const targetId = selectedAthleteId || user._id;
          loadTrainings(targetId);
          setFieldLactatePanelKey(k => k + 1);
        }
      } catch (_) {}
    };
    const t = setTimeout(performAutoSync, 2000);
    return () => clearTimeout(t);
  }, [user?._id, user?.strava?.autoSync, user?.notifications, selectedAthleteId, loadTrainings, addNotification]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (location.hash !== '#field-lactate') return;
    const t = window.setTimeout(() => {
      document.getElementById('field-lactate')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => window.clearTimeout(t);
  }, [location.hash, location.pathname]);

  const integrationAthleteId = useMemo(() => {
    if (!user || !coachLike || !selectedAthleteId) return null;
    if (String(selectedAthleteId) !== String(user._id)) return String(selectedAthleteId);
    return null;
  }, [user, coachLike, selectedAthleteId]);

  const closeStravaLactateModal = useCallback(() => {
    setStravaLactateModal({
      isOpen: false,
      initialData: null,
    });
    // Drop any pending field-lactate context — user closed the form
    // without finishing the Chart-flow assign. They can re-pick the
    // measurement from the Pending list later.
    setPendingFieldLactate(null);
  }, []);

  const handleFieldAddLactate = useCallback(
    async (activity) => {
      const stravaNumericId = String(activity.stravaId || '');
      if (!stravaNumericId) {
        setStravaLactateFormError('No Strava ID found for this activity.');
        return;
      }
      setStravaLactateFormError(null);
      setLactateActivityLoadingId(String(activity._id || activity.stravaId));
      try {
        const integAthleteId = integrationAthleteId ? String(integrationAthleteId) : null;
        const data = await getStravaActivityDetail(stravaNumericId, integAthleteId);
        const detail = data.detail || {};
        const laps = data.laps || [];
        if (!laps.length) {
          setStravaLactateFormError('No intervals found for this activity.');
          return;
        }
        // Build form data the same way as FitAnalysisPage's performExportToTraining
        const sportType = detail.sport_type || detail.sport || 'bike';
        const sportLower = sportType.toLowerCase();
        const sport = sportLower.includes('swim') ? 'swim' : sportLower.includes('run') ? 'run' : 'bike';
        const isRun = sport === 'run';
        const isSwim = sport === 'swim';

        const fmtDur = (sec) => {
          const s = Number(sec) || 0;
          const m = Math.floor(s / 60);
          const ss = Math.round(s % 60);
          return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        };

        const results = laps.map((lap, idx) => {
          const durationSec = Math.round(
            lap.moving_time ?? lap.elapsed_time ?? lap.duration ?? 0
          );
          const distM = Math.round(lap.distance ?? 0);
          const speed = lap.average_speed ?? 0;

          let powerValue = '';
          if (isRun || isSwim) {
            const effectiveSpeed = speed > 0.05 ? speed : (distM > 0 && durationSec > 0 ? distM / durationSec : 0);
            if (effectiveSpeed > 0.05) {
              const paceSec = isSwim ? Math.round(100 / effectiveSpeed) : Math.round(1000 / effectiveSpeed);
              powerValue = fmtDur(paceSec);
            }
          } else {
            const w = lap.average_watts ?? lap.average_power ?? 0;
            powerValue = w > 0 ? String(Math.round(w)) : '';
          }

          const isSwimRest = isSwim && distM < 10;
          return {
            interval: idx + 1,
            power: powerValue,
            heartRate: String(Math.round(lap.average_heartrate ?? lap.avg_heart_rate ?? 0) || ''),
            lactate: lap.lactate != null ? String(lap.lactate) : '',
            RPE: '',
            elevation: (() => {
              const g = lap.total_elevation_gain ?? lap.elevation_gain ?? null;
              return g != null && Number.isFinite(Number(g)) ? String(Math.round(Number(g))) : '';
            })(),
            duration: fmtDur(durationSec),
            durationSeconds: durationSec,
            durationType: 'time',
            distanceMeters: distM > 0 ? distM : undefined,
            repeatCount: 1,
            isRecovery: isSwimRest,
            isSelected: !isSwimRest,
          };
        });

        const activityDate = detail.start_date_local || detail.start_date || new Date();
        const parsedDate = new Date(activityDate);
        const dateStr = (Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate).toISOString().slice(0, 16);

        const initialData = {
          sport,
          type: 'interval',
          category: data.category || '',
          title: data.titleManual || detail.name || 'Untitled Training',
          customTitle: '',
          description: data.description || detail.description || '',
          date: dateStr,
          sourceStravaActivityId: String(detail.id || detail.stravaId || stravaNumericId),
          specifics: { specific: '', weather: '', customSpecific: '', customWeather: '' },
          results,
        };

        setStravaLactateModal({ isOpen: true, initialData });
      } catch (err) {
        setStravaLactateFormError(
          err.response?.data?.message ||
            err.response?.data?.error ||
            err.message ||
            'Could not open lactate form'
        );
      } finally {
        setLactateActivityLoadingId(null);
      }
    },
    [integrationAthleteId]
  );

  // Bridge from FieldLactateTrainingPanel → AssignLactateModal → "Chart"
  // pill. Reuses handleFieldAddLactate to load the activity detail and
  // open the same TrainingForm modal already used elsewhere, plus
  // stashes the pending measurement so the form's submit handler can
  // call assignFieldLactateMeasurement against the matched lap.
  const handleOpenMeasurementInForm = useCallback(
    (measurement, activity) => {
      setPendingFieldLactate(measurement);
      handleFieldAddLactate(activity);
    },
    [handleFieldAddLactate]
  );

  const handleStravaLactateFormSubmit = useCallback(
    async (formData) => {
      try {
        setStravaLactateSubmitting(true);
        setStravaLactateFormError(null);
        const targetId = selectedAthleteId || user._id;

        // Normalise lactate strings → Number; drop empties so mongoose
        // doesn't store NaN / cast junk into the Number field.
        const cleanedResults = Array.isArray(formData.results)
          ? formData.results.map((r) => {
              const out = { ...r };
              if (out.lactate === '' || out.lactate == null) {
                delete out.lactate;
              } else {
                const num = parseFloat(out.lactate);
                if (Number.isFinite(num)) out.lactate = num;
                else delete out.lactate;
              }
              return out;
            })
          : formData.results;

        const trainingData = {
          ...formData,
          results: cleanedResults,
          athleteId: targetId,
          coachId: user._id,
        };
        if (formData._id) {
          await updateTraining(formData._id, trainingData);
        } else {
          // Check for existing training by sourceStravaActivityId (primary) or title+date (fallback)
          // to avoid creating duplicates when re-exporting / re-adding lactate.
          let existingId = null;
          try {
            const resp = await api.get(`/user/athlete/${targetId}/trainings`);
            const allTrainings = resp.data || [];
            const existing = allTrainings.find(t =>
              (formData.sourceStravaActivityId &&
                t.sourceStravaActivityId &&
                String(t.sourceStravaActivityId) === String(formData.sourceStravaActivityId)) ||
              (t.title === formData.title &&
               new Date(t.date).toDateString() === new Date(formData.date).toDateString())
            );
            existingId = existing?._id || null;
          } catch (_) { /* non-blocking — fall through to addTraining */ }

          if (existingId) {
            await updateTraining(existingId, trainingData);
          } else {
            await addTraining(trainingData);
          }
        }

        // Push lactate into the linked StravaActivity.laps so the calendar
        // view (which renders Strava laps directly) shows them everywhere.
        const stravaId = formData?.sourceStravaActivityId;
        if (stravaId && Array.isArray(cleanedResults)) {
          const lactateValues = cleanedResults
            .map((r) => {
              const lapIdx = Number.isInteger(r?.sourceLapIndex)
                ? r.sourceLapIndex
                : (Number(r?.interval) > 0 ? Number(r.interval) - 1 : null);
              if (lapIdx == null || !Number.isFinite(r?.lactate)) return null;
              return { lapIndex: lapIdx, lactate: r.lactate };
            })
            .filter(Boolean);
          if (lactateValues.length > 0) {
            try {
              await updateStravaLactateValues(stravaId, lactateValues);
            } catch (syncErr) {
              console.warn('[lactate] Strava sync failed (non-blocking):', syncErr?.message);
            }
          }
        }

        // "Chart" flow: a FieldLactateMeasurement was stashed when the
        // user opened this modal from AssignLactateModal → "Chart". Find
        // the lap they just typed the value into (±0.05 mmol/L) and mark
        // the measurement assigned so the pending list updates.
        if (pendingFieldLactate && Array.isArray(cleanedResults)) {
          const target = Number(pendingFieldLactate.value);
          let bestIdx = -1, bestDiff = Infinity;
          cleanedResults.forEach((r, i) => {
            const v = Number(r?.lactate);
            if (!Number.isFinite(v)) return;
            const diff = Math.abs(v - target);
            if (diff <= 0.05 && diff < bestDiff) { bestDiff = diff; bestIdx = i; }
          });
          if (bestIdx >= 0) {
            try {
              const payload = {
                lapIndex: bestIdx,
                lapNumber: bestIdx + 1,
                trainingTitle: formData.title || 'Training',
                trainingDate: formData.date || null,
              };
              if (stravaId) payload.stravaActivityId = String(stravaId);
              else if (formData._id) payload.trainingId = formData._id;
              await assignFieldLactateMeasurement(pendingFieldLactate._id, payload);
            } catch (e) {
              console.warn('[field-lactate] post-form assign failed:', e?.message);
            }
          }
          setPendingFieldLactate(null);
        }

        await loadTrainings(targetId);
        setFieldLactatePanelKey((k) => k + 1);
        closeStravaLactateModal();
      } catch (err) {
        setStravaLactateFormError(
          err.response?.data?.message ||
            err.response?.data?.error ||
            err.message ||
            'Save failed'
        );
      } finally {
        setStravaLactateSubmitting(false);
      }
    },
    [selectedAthleteId, user, loadTrainings, closeStravaLactateModal, pendingFieldLactate]
  );

  const showFieldLactatePanel = ['coach', 'athlete', 'tester', 'testing'].includes(
    String(user?.role || '').toLowerCase()
  );

  // Sync selectedAthleteId when URL param :athleteId changes (e.g. CoachAthleteBar navigates).
  // Do NOT fall back to coach self when URL has no athlete — that wipes the localStorage selection.
  useEffect(() => {
    if (athleteId && athleteId !== selectedAthleteId) {
      setSelectedAthleteId(athleteId);
    }
  }, [athleteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Athlete change events are handled centrally by AthleteSelectionContext.
  // When CoachAthleteBar navigates to /training/:athleteId, the URL-sync effect below picks it up.

  // Quick add lactate handler
  const handleQuickAddLactate = useCallback(async ({ lactateValue, blockTitle, trainingId, intervalIndex }) => {
    const targetId = selectedAthleteId || user._id;
    if (!trainingId) {
      // No training selected — nothing to save yet; modal closes without error
      return;
    }
    const training = trainings.find(t => t._id === trainingId);
    if (!training) throw new Error('Training not found');

    const updatedResults = [...(training.results || [])];

    if (intervalIndex !== null && intervalIndex !== undefined && updatedResults[intervalIndex]) {
      // Update existing interval
      updatedResults[intervalIndex] = {
        ...updatedResults[intervalIndex],
        lactate: String(lactateValue),
        ...(blockTitle ? { title: blockTitle } : {}),
      };
    } else {
      // Add new interval row
      updatedResults.push({
        interval: updatedResults.length + 1,
        lactate: String(lactateValue),
        title: blockTitle || '',
        power: '',
        heartRate: '',
        RPE: '',
        duration: '',
        repeatCount: 1,
        isRecovery: false,
        isSelected: true,
      });
    }

    await updateTraining(trainingId, {
      ...training,
      results: updatedResults,
      athleteId: targetId,
      coachId: user._id,
    });

    await loadTrainings(targetId);
  }, [selectedAthleteId, user, trainings, loadTrainings]);

  // Funkce pro přidání nového tréninku
  const handleAddTraining = useCallback(async (formData) => {
    try {
      setIsSubmitting(true);
      console.log('Auth user:', user);
      
      if (!user?._id) {
        console.log('User ID missing, full user object:', user);
        throw new Error('User not authenticated');
      }

      setError(null);

      const targetId = selectedAthleteId || user._id;
      const trainingData = {
        ...formData,
        athleteId: targetId,
        coachId: user._id
      };

      console.log('Sending training data:', trainingData);

      const response = await addTraining(trainingData);
      console.log('Training created:', response.data);

      await loadTrainings(targetId);

      setSelectedSport(response.data.sport);
      setSelectedTitle(response.data.title);
      setSelectedTraining(response.data._id);

      setIsFormOpen(false);

      // Show success notification
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-500 ease-in-out';
      notification.textContent = 'Training successfully added!';
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
      }, 3000);

    } catch (err) {
      console.error('Error adding training:', err);
      console.log('Full error object:', err);
      setError(err.response?.data?.message || 'Failed to add training');
      
      // Show error notification
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-500 ease-in-out';
      notification.textContent = `Failed to add training: ${err.response?.data?.message || err.message}`;
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
      }, 3000);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedAthleteId, user, loadTrainings]);


  // Open TrainingForm pre-filled for editing an existing training
  const handleOpenEditTraining = useCallback((training) => {
    setEditingTraining(training);
    setIsFormOpen(true);
  }, []);

  // Submit handler that handles both create and update
  const handleAddOrUpdateTraining = useCallback(async (formData) => {
    if (formData._id) {
      // Edit mode — update existing
      try {
        setIsSubmitting(true);
        const targetId = selectedAthleteId || user._id;
        await updateTraining(formData._id, { ...formData, athleteId: targetId, coachId: user._id });
        await loadTrainings(targetId);
        setIsFormOpen(false);
        setEditingTraining(null);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to update training');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      await handleAddTraining(formData);
    }
  }, [selectedAthleteId, user, loadTrainings, handleAddTraining]);

  // Apply sport & category filters for all visual components.
  // Excludes raw external activities (Strava `source==='strava'`, FIT `source==='fit'`,
  // ids prefixed with strava-/fit-) — Training History/Graph should only show
  // records that actually live in the Training collection (i.e. were exported
  // via Add lactate). The Field Lactate panel still receives the full Strava
  // list separately so users can add lactate to fresh activities.
  const filteredTrainings = useMemo(() => {
    let data = (trainings || []).filter(t => {
      if (!t) return false;
      if (t.source === 'strava' || t.source === 'fit') return false;
      const idStr = String(t.id || '');
      if (idStr.startsWith('strava-') || idStr.startsWith('fit-')) return false;
      // Keep entries that have a Mongo _id (Training collection records)
      return !!t._id || !t.source;
    });
    if (selectedSport !== 'all') {
      data = data.filter(t => t.sport === selectedSport);
    }
    if (selectedCategory !== 'all') {
      if (selectedCategory === 'uncategorized') {
        data = data.filter(t => !t.category);
      } else {
        data = data.filter(t => t.category === selectedCategory);
      }
    }
    return data;
  }, [trainings, selectedSport, selectedCategory]);

  // ── Locked feature overlay wrapper ───────────────────────────────────────
  const LockedFeatureOverlay = useCallback(({ feature, children, minHeight = 220 }) => (
    <div className="relative overflow-hidden rounded-2xl" style={{ minHeight }}>
      {/* Blurred preview */}
      <div className="pointer-events-none select-none" style={{ filter: 'blur(4px)', opacity: 0.45 }}>
        {children}
      </div>
      {/* Lock overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(2px)' }}
        onClick={() => openUpgradeModal(feature)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && openUpgradeModal(feature)}
      >
        <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-2xl bg-white border border-gray-100 shadow-lg max-w-xs text-center">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <LockClosedIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{feature}</p>
            <p className="text-xs text-gray-500 mt-0.5">Available on Pro plan</p>
          </div>
          <button
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
            onClick={(e) => { e.stopPropagation(); openUpgradeModal(feature); }}
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  ), [openUpgradeModal]);

  if (error) return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 text-red-600 bg-red-50 rounded-lg shadow-lg"
    >
      {error}
    </motion.div>
  );

  // Native app: show the mobile-optimised training page (focused on lactate
  // annotation + same-workout exploration). `?full=1` falls through to the
  // desktop view (used by "menu" button or deep links into edit forms).
  if (isCapacitorNative() && !searchParams.get('full')) {
    return (
      <NativeTrainingPage
        user={user}
        trainings={trainings}
        athleteId={selectedAthleteId || user?._id}
        // Re-fetch the trainings list after a save. Without this the
        // user's just-saved edits stay only in the form's local state —
        // closing & re-opening the same activity would re-derive results
        // from the bare Strava laps and lose what they typed.
        onTrainingsChanged={() => loadTrainings(selectedAthleteId || user?._id)}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto w-full max-w-[1600px] px-2 sm:px-4 py-4 md:p-6"
    >
      {/* ── HEADER ── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex items-center justify-between gap-2 mb-4"
      >
        {/* Title + count */}
        <div className="min-w-0 flex items-baseline gap-2">
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-1.5 whitespace-nowrap">
            <ListBulletIcon className="w-5 h-5 text-primary flex-shrink-0" />
            Training Log
          </h1>
          {filteredTrainings.length > 0 && (
            <span className="text-xs text-gray-400 hidden sm:inline">
              {filteredTrainings.length} trainings
            </span>
          )}
        </div>

        {/* Controls — single row, compact */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Category filter */}
          <div className="relative" ref={categoryDropdownRef}>
            {(() => {
              const activeCat = selectedCategory !== 'all' && selectedCategory !== 'uncategorized'
                ? categories.find(c => c.id === selectedCategory)
                : null;
              const activeStyle = activeCat ? getCategoryStyle(activeCat.id) : null;
              const isUncat = selectedCategory === 'uncategorized';
              return (
                <button
                  onClick={() => setCategoryDropdownOpen(v => !v)}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-semibold whitespace-nowrap transition-all"
                  style={activeCat
                    ? { backgroundColor: activeStyle.backgroundColor, borderColor: activeStyle.borderColor, color: activeStyle.color }
                    : isUncat
                      ? { backgroundColor: '#f9fafb', borderColor: '#d1d5db', color: '#6b7280' }
                      : { backgroundColor: '#fff', borderColor: '#e5e7eb', color: '#4b5563' }
                  }
                >
                  {activeCat && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: activeCat.color }} />}
                  {activeCat ? activeCat.label : isUncat ? 'Uncategorized' : 'Categories'}
                  <ChevronDownIcon className={`w-3 h-3 transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              );
            })()}
            {categoryDropdownOpen && (() => {
              // Count trainings per category over the sport-filtered set so the
              // dropdown surfaces what's actually available — empty categories
              // sit at the bottom (disabled) instead of looking selectable.
              const sportScoped = (trainings || []).filter(t => {
                if (!t) return false;
                if (t.source === 'strava' || t.source === 'fit') return false;
                const idStr = String(t.id || '');
                if (idStr.startsWith('strava-') || idStr.startsWith('fit-')) return false;
                if (!t._id && t.source) return false;
                return selectedSport === 'all' || t.sport === selectedSport;
              });
              const counts = new Map();
              let uncatCount = 0;
              sportScoped.forEach(t => {
                if (t.category) counts.set(t.category, (counts.get(t.category) || 0) + 1);
                else uncatCount += 1;
              });

              return (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCategoryDropdownOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-[200px] max-h-[60vh] overflow-y-auto">
                    <button
                      onClick={() => { setSelectedCategory('all'); setCategoryDropdownOpen(false); }}
                      className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <span>All categories</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-gray-400 tabular-nums">{sportScoped.length}</span>
                        {selectedCategory === 'all' && <CheckIcon className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                      </span>
                    </button>
                    <div className="h-px bg-gray-100 mx-2 my-1" />
                    {categories.map(cat => {
                      const isActive = selectedCategory === cat.id;
                      const n = counts.get(cat.id) || 0;
                      const s = getCategoryStyle(cat.id);
                      return (
                        <button
                          key={cat.id}
                          onClick={() => { setSelectedCategory(isActive ? 'all' : cat.id); setCategoryDropdownOpen(false); }}
                          disabled={n === 0 && !isActive}
                          className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold transition-colors ${n === 0 && !isActive ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                          style={{ color: s.color }}
                        >
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                            {cat.label}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] font-medium text-gray-400 tabular-nums">{n}</span>
                            {isActive && <CheckIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: cat.color }} />}
                          </span>
                        </button>
                      );
                    })}
                    {uncatCount > 0 && (
                      <>
                        <div className="h-px bg-gray-100 mx-2 my-1" />
                        <button
                          onClick={() => { setSelectedCategory(selectedCategory === 'uncategorized' ? 'all' : 'uncategorized'); setCategoryDropdownOpen(false); }}
                          className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full border border-gray-300 flex-shrink-0" />
                            Uncategorized
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] font-medium text-gray-400 tabular-nums">{uncatCount}</span>
                            {selectedCategory === 'uncategorized' && <CheckIcon className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Export and 'Add Lactate' toolbar buttons removed by request —
              the JSON export was only useful to power users (lives under a
              separate Pro paywall) and the standalone 'Add Lactate' picker
              duplicated the '+ Lactate' next-to-each-activity flow below.
              Field-lactate panel '+ Lactate' button now deep-links into the
              activity directly (see handleFieldAddLactate refactor). */}

          {/* Add Training */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-1 h-8 px-2.5 bg-primary text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all shadow-sm disabled:opacity-60"
            disabled={isSubmitting}
            title="Add Training"
          >
            {isSubmitting
              ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
              : <PlusIcon className="w-4 h-4 flex-shrink-0" />
            }
            <span className="hidden xs:inline sm:inline">{isSubmitting ? 'Adding…' : 'Add Training'}</span>
          </motion.button>
        </div>
      </motion.div>

      {/* Free plan banner */}
      {isFreePlan && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
        >
          <span className="flex items-center gap-2 text-xs font-medium">
            <LockClosedIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
            Training Load, LT2 Trend, Training History, and export are locked on the Free plan.
          </span>
          <button
            onClick={() => openUpgradeModal('Training Analytics')}
            className="shrink-0 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
          >
            <SparklesIcon className="w-3.5 h-3.5" />
            Upgrade to Pro
          </button>
        </motion.div>
      )}

      {/* Error banner */}
      {stravaLactateFormError && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          <span>{stravaLactateFormError}</span>
          <button
            type="button"
            onClick={() => setStravaLactateFormError(null)}
            className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-900 hover:bg-red-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── 5-COLUMN DASHBOARD GRID ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">

        {/* Row 1: Field Lactate (2 cols) + Training Stats (3 cols) */}
        {showFieldLactatePanel && user ? (
          <>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="lg:col-span-2 md:col-span-2 min-w-0 flex flex-col"
            >
              <FieldLactateTrainingPanel
                key={fieldLactatePanelKey}
                integrationAthleteId={integrationAthleteId}
                user={user}
                // onAddLactate intentionally omitted — the previous bridge
                // (handleFieldAddLactate → fetch detail → open Strava
                // lactate-form modal) silently failed for activities with
                // no laps cached and never showed a recoverable error,
                // reading as 'button does nothing'.
                // Without this prop the panel falls back to a plain Link
                // to /training-calendar/strava-<id>, which auto-opens the
                // ActivityFullModal with its battle-tested "+ lactate per
                // lap" UI. Same end result, one fewer flaky code path.
                onOpenMeasurementInForm={handleOpenMeasurementInForm}
                loadingActivityId={lactateActivityLoadingId}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-3 md:col-span-2 min-w-0 flex flex-col"
            >
              {isFreePlan ? (
                <LockedFeatureOverlay feature="Training Load & LT2 Trend" minHeight={260}>
                  <TrainingStats
                    trainings={filteredTrainings}
                    selectedSport={selectedSport}
                    onSportChange={setSelectedSport}
                    isFullWidth={true}
                    user={user}
                    integrationAthleteId={integrationAthleteId}
                  />
                </LockedFeatureOverlay>
              ) : (
                <TrainingStats
                  trainings={filteredTrainings}
                  selectedSport={selectedSport}
                  onSportChange={setSelectedSport}
                  isFullWidth={true}
                  user={user}
                  integrationAthleteId={integrationAthleteId}
                />
              )}
            </motion.div>
          </>
        ) : (
          /* No lactate panel — Training Stats full row */
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="lg:col-span-5 md:col-span-2 min-w-0"
          >
            {isFreePlan ? (
              <LockedFeatureOverlay feature="Training Load & LT2 Trend" minHeight={260}>
                <TrainingStats
                  trainings={filteredTrainings}
                  selectedSport={selectedSport}
                  onSportChange={setSelectedSport}
                  isFullWidth={true}
                  user={user}
                  integrationAthleteId={integrationAthleteId}
                />
              </LockedFeatureOverlay>
            ) : (
              <TrainingStats
                trainings={filteredTrainings}
                selectedSport={selectedSport}
                onSportChange={setSelectedSport}
                isFullWidth={true}
                user={user}
                integrationAthleteId={integrationAthleteId}
              />
            )}
          </motion.div>
        )}

        {/* Row 2: Training Table — full width (TrainingGraph removed) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="lg:col-span-5 md:col-span-2 min-w-0"
        >
          {isFreePlan ? (
            <LockedFeatureOverlay feature="Training History & Export" minHeight={300}>
              <UserTrainingsTable trainings={filteredTrainings} onTrainingUpdate={() => loadTrainings(selectedAthleteId || user._id)} />
            </LockedFeatureOverlay>
          ) : (
            <UserTrainingsTable trainings={filteredTrainings} onTrainingUpdate={() => loadTrainings(selectedAthleteId || user._id)} />
          )}
        </motion.div>

        {/* Row 3: Training Comparison — full width */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-5 md:col-span-2 min-w-0"
        >
          {isFreePlan ? (
            <LockedFeatureOverlay feature="Training Comparison" minHeight={240}>
              <Suspense fallback={<div className="rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center py-12"><p className="text-sm text-gray-400">Loading…</p></div>}>
                <TrainingComparison trainings={filteredTrainings} />
              </Suspense>
            </LockedFeatureOverlay>
          ) : (
            <Suspense fallback={
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center py-12">
                <p className="text-sm text-gray-400">Loading comparison…</p>
              </div>
            }>
              <TrainingComparison trainings={filteredTrainings} />
            </Suspense>
          )}
        </motion.div>

        {/* Row 4: Lap Comparison — full width */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="lg:col-span-5 md:col-span-2 min-w-0"
        >
          {isFreePlan ? (
            <LockedFeatureOverlay feature="Lap Comparison" minHeight={240}>
              <Suspense fallback={<div className="rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center py-12"><p className="text-sm text-gray-400">Loading…</p></div>}>
                <LapComparison trainings={filteredTrainings} selectedTitle={selectedTitle} setSelectedTitle={setSelectedTitle} onEditTraining={handleOpenEditTraining} />
              </Suspense>
            </LockedFeatureOverlay>
          ) : (
            <Suspense fallback={
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center py-12">
                <p className="text-sm text-gray-400">Loading lap comparison…</p>
              </div>
            }>
              <LapComparison
                trainings={filteredTrainings}
                selectedTitle={selectedTitle}
                setSelectedTitle={setSelectedTitle}
                onEditTraining={handleOpenEditTraining}
              />
            </Suspense>
          )}
        </motion.div>

      </div>

      {/* ── MODALS ── */}

      {/* Quick Add Lactate modal */}
      <QuickAddLactateModal
        isOpen={quickLactateOpen}
        onClose={() => setQuickLactateOpen(false)}
        trainings={trainings}
        onSave={handleQuickAddLactate}
      />


      {/* Portal modals — rendered into #app-modal-root (inside NativeLayout's fixed
          container, above bottom tab bar) so they cover the bottom navigation. */}
      <AnimatePresence>
        {isFormOpen && ReactDOM.createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // Bumped z-index to 9999 — the previous 200 lost to sidebar /
            // calendar overlays on some routes, causing the modal to render
            // but stay invisibly behind page chrome (= 'Add Training does
            // nothing'). Also centres vertically on desktop so the form
            // doesn't sit pinned to the bottom of large screens.
            style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'auto', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}
            onClick={(e) => { if (e.target === e.currentTarget) { setIsFormOpen(false); setEditingTraining(null); } }}
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full sm:max-w-2xl"
            >
              <TrainingForm
                onClose={() => { setIsFormOpen(false); setEditingTraining(null); }}
                onSubmit={handleAddOrUpdateTraining}
                initialData={editingTraining}
              />
            </motion.div>
          </motion.div>,
          document.getElementById('app-modal-root') || document.body
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRecordLactate && ReactDOM.createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'auto' }}>
            <RecordLactateModal
              onClose={() => setShowRecordLactate(false)}
              onSave={async (data) => {
                await createFieldLactateMeasurement({
                  ...data,
                  athleteId: selectedAthleteId || undefined,
                });
                setFieldLactatePanelKey(k => k + 1);
                setShowRecordLactate(false);
              }}
            />
          </div>,
          document.getElementById('app-modal-root') || document.body
        )}
      </AnimatePresence>

      {/* Upgrade modal for subscription-gated features */}
      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        feature={upgradeModalFeature}
        requiredPlan="pro"
      />

      <AnimatePresence>
        {stravaLactateModal.isOpen && stravaLactateModal.initialData && ReactDOM.createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'auto', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="w-full sm:max-w-2xl"
            >
              {pendingFieldLactate && (
                <div style={{
                  margin: '0 0 -2px',
                  padding: '10px 14px',
                  background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
                  borderTopLeftRadius: 14, borderTopRightRadius: 14,
                  border: '1px solid rgba(124,58,237,.25)',
                  borderBottom: 'none',
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 12, color: '#5b21b6',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M9 3h6M10 3v6.5L4.5 19a2 2 0 001.7 3h11.6a2 2 0 001.7-3L14 9.5V3" />
                  </svg>
                  <span style={{ flex: 1 }}>
                    Adding <b>{Number(pendingFieldLactate.value).toFixed(1)} mmol/L</b> — type it into the Lactate cell of the right lap below.
                  </span>
                </div>
              )}
              <TrainingForm
                key={stravaLactateModal.initialData.sourceStravaActivityId || 'strava-lac'}
                onClose={() => {
                  closeStravaLactateModal();
                  setStravaLactateFormError(null);
                }}
                onSubmit={handleStravaLactateFormSubmit}
                initialData={stravaLactateModal.initialData}
                isEditing={false}
                isLoading={stravaLactateSubmitting}
              />
            </motion.div>
          </motion.div>,
          document.getElementById('app-modal-root') || document.body
        )}
      </AnimatePresence>
    </motion.div>
  );
}