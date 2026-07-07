import React, { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import ReactDOM from 'react-dom';
import { isCapacitorNative } from '../utils/isNativeApp';
import { writeFormFitnessToWidget } from '../utils/widgetCache';
import { compareActivitiesChronologically } from '../utils/calendarDayOrdering';
import NativeDashboardPage from './NativeDashboardPage';
import { useAthleteSelection } from '../context/AthleteSelectionContext';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePremium } from '../hooks/usePremium';
import UpgradeModal from '../components/UpgradeModal';
import WelcomePaywallModal from '../components/WelcomePaywallModal';
import WhatsNewModal, { whatsNewSeenKey } from '../components/WhatsNewModal';
import IOSLaunchModal, { iosLaunchSeenKey } from '../components/IOSLaunchModal';
import EmptyStateCTA from '../components/common/EmptyStateCTA';
import { LockClosedIcon } from '@heroicons/react/24/outline';
// import SportsSelector from "../components/Header/SportsSelector";
import TrainingLoadHeatmap from "../components/DashboardPage/TrainingLoadHeatmap";
import { TrainingStats } from "../components/DashboardPage/TrainingStats";
import TrainingGraph from "../components/DashboardPage/TrainingGraph";
import SpiderChart from "../components/DashboardPage/SpiderChart";
import FormFitnessChart from "../components/DashboardPage/FormFitnessChart";
import WeeklyTrainingLoad from "../components/DashboardPage/WeeklyTrainingLoad";
import WellnessCard from "../components/DashboardPage/WellnessCard";
import TrainingInsightsCard from "../components/DashboardPage/TrainingInsightsCard";
import RaceCountdownCard from "../components/DashboardPage/RaceCountdownCard";
import PostRaceFeedbackCard from "../components/DashboardPage/PostRaceFeedbackCard";
import { useAuth } from '../context/AuthProvider';
import { computePmcFromActivities } from '../utils/formFitnessFromActivities';
import { maybePromptTrainingZonesSetup } from '../utils/trainingZonesSetup';
import api, { getFitTrainings, listExternalActivities, autoSyncStravaActivities, getIntegrationStatus, getStravaAuthUrl, addTraining, updateTraining, getStravaActivityDetail, getFormFitnessData, getTodayMetrics } from '../services/api';
import { maybeNotifyStravaActivitiesImported } from '../utils/stravaImportLocalNotification';
import { useNotification } from '../context/NotificationContext';
import LactateCurveCalculator from "../components/Testing-page/LactateCurveCalculator";
import DateSelector from "../components/DateSelector";
import WeeklyCalendar from "../components/DashboardPage/WeeklyCalendar";
import WorkoutPlanModal from "../components/WorkoutPlanner/WorkoutPlanModal";
import { getPlannedWorkouts, createPlannedWorkout, updatePlannedWorkout, deletePlannedWorkout, getDayPlans, setDayPlan as apiSetDayPlan, deleteDayPlan as apiDeleteDayPlan, getPeriods, savePeriod as apiSavePeriod, deletePeriod as apiDeletePeriod } from '../services/workoutPlannerApi';
import DashboardEmptyWelcome from "../components/DashboardPage/DashboardEmptyWelcome";
import { Skeleton } from "../components/common/Skeleton";
import { buildActivityMatcher, metricsPatchFromDetail, patchCalendarCache, upsertPlannedWorkoutList } from '../utils/activityEventPatches';
import { TSS_DISPLAY_MODE_EVENT, clearFormFitnessCache } from '../utils/uiPrefs';
import { syncDailyTrainingReminder } from '../utils/dailyTrainingReminder';
import { plannedDistanceMetres, formatPlannedDistanceMetres } from '../utils/plannedWorkoutDistance';
import ZoneDistributionChart from '../components/DashboardPage/ZoneDistributionChart';
import IntensityDistributionChart from '../components/DashboardPage/IntensityDistributionChart';
import TrainingForm from '../components/TrainingForm';
import { motion, AnimatePresence } from 'framer-motion';

// Lazy — avoids eagerly pulling the 4k-line CalendarView into the dashboard chunk.
const DayPlanEditSheet = lazy(() => import("../components/Calendar/CalendarView").then(m => ({ default: m.DayPlanEditSheet })));
const PeriodEditSheet  = lazy(() => import("../components/Calendar/CalendarView").then(m => ({ default: m.PeriodEditSheet })));
//import { useNotification } from '../context/NotificationContext';
// import { 
//   CalendarIcon, 
//   ClockIcon, 
//   FireIcon, 
//   HeartIcon, 
//   ChartBarIcon,
//   ArrowTrendingUpIcon,
//   ArrowTrendingDownIcon
// } from '@heroicons/react/24/outline';

/** API může vrátit { error } nebo objekt místo pole — ochrana před .map/.forEach */
function isSameLocalDay(d, today = new Date()) {
  if (!d) return false;
  const x = new Date(d);
  return x.getFullYear() === today.getFullYear()
      && x.getMonth()    === today.getMonth()
      && x.getDate()     === today.getDate();
}

function normaliseSportForWidget(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('swim')) return 'swim';
  if (s.includes('run') || s.includes('walk') || s.includes('hike')) return 'run';
  if (s.includes('yoga')) return 'yoga';
  // Match the same keyword set as the shared SportIcon so a gym/strength
  // session isn't misread as a bike (which the default used to do).
  if (s.includes('strength') || s.includes('gym') || s.includes('weight')
      || s.includes('workout') || s.includes('crossfit') || s.includes('fitness')
      || s.includes('elliptical') || s.includes('rower') || s.includes('rowing')) return 'strength';
  if (s.includes('bike') || s.includes('ride') || s.includes('cycle') || s.includes('virtual') || s.includes('mtb')) return 'bike';
  // Truly unknown → 'other' (the widget shows a neutral icon, not a bike).
  return 'other';
}

/** Reuse merged trainings from loadTrainings() as calendar feed — avoids a second Strava/FIT round-trip. */
function buildCalendarActivitiesFromTrainings(allTrainings, regTrainings) {
  if (!Array.isArray(allTrainings) || allTrainings.length === 0) return [];

  const trainingByStravaId = new Map();
  (regTrainings || []).forEach((t) => {
    const sid = t?.sourceStravaActivityId;
    if (sid) trainingByStravaId.set(String(sid), t);
  });

  const linkedStravaIds = new Set(
    (regTrainings || [])
      .map((t) => t?.sourceStravaActivityId)
      .filter(Boolean)
      .map(String),
  );

  return allTrainings
    .filter((t) => t && !t.sourceStravaActivityId)
    .map((t) => {
      const idStr = String(t.id || '');
      const isFit = Boolean(
        t.type === 'fit' || t.source === 'fit' || idStr.startsWith('fit-')
        || (t.timestamp && (t.originalFileName || t.titleAuto)),
      );
      const stravaId = t.stravaId || (idStr.startsWith('strava-') ? idStr.replace(/^strava-/, '') : null);
      const isStrava = Boolean(t.type === 'strava' || t.source === 'strava' || stravaId || t.startDate);

      if (isFit && !isStrava) {
        return {
          ...t,
          type: 'fit',
          date: t.timestamp || t.date,
          title: t.titleManual || t.titleAuto || t.originalFileName || t.title || 'Untitled Training',
          sport: t.sport,
          avgPower: t.avgPower,
          maxPower: t.maxPower,
          avgHeartRate: t.avgHeartRate,
          maxHeartRate: t.maxHeartRate,
          totalTime: t.totalElapsedTime || t.totalTimerTime,
          distance: t.totalDistance,
          tss: t.trainingStressScore ?? t.tss ?? t.totalTSS,
          tssDisplayMode: t.tssDisplayMode ?? null,
        };
      }

      if (isStrava && stravaId) {
        const linkedTraining = trainingByStravaId.get(String(stravaId));
        return {
          ...t,
          type: 'strava',
          date: t.startDate || t.date || t.timestamp,
          title: linkedTraining?.title || t.titleManual || t.name || t.title || 'Untitled Activity',
          linkedTrainingTitle: linkedTraining?.title || null,
          sport: t.sport,
          stravaId,
          id: idStr.startsWith('strava-') ? idStr : `strava-${stravaId}`,
          avgPower: t.averagePower || t.average_watts || t.avgPower,
          weightedAveragePower: t.weightedAveragePower ?? t.weighted_average_watts ?? null,
          avgSpeed: t.averageSpeed || t.average_speed || t.avgSpeed,
          maxPower: t.maxPower || t.max_watts,
          avgHeartRate: t.averageHeartRate || t.average_heartrate || t.avgHeartRate,
          maxHeartRate: t.maxHeartRate || t.max_heartrate,
          totalTime: t.movingTime || t.elapsedTime || t.totalTime,
          distance: t.distance,
          tss: t.manualTss ?? (linkedTraining?.tss || linkedTraining?.totalTSS || t.tss || t.totalTSS || t.total_tss || null),
          tssDisplayMode: t.tssDisplayMode ?? linkedTraining?.tssDisplayMode ?? null,
          kilojoules: t.kilojoules ?? t.raw?.kilojoules,
        };
      }

      if (linkedStravaIds.has(String(t._id))) return null;

      return {
        ...t,
        id: idStr || `regular-${t._id}`,
        type: 'regular',
        date: t.date || t.timestamp,
        title: t.title || t.titleManual || 'Untitled Training',
        sport: t.sport,
        category: t.category || null,
        distance: t.totalDistance || t.distance,
        totalTime: t.totalElapsedTime || t.totalTimerTime || t.duration,
        tss: t.tss || t.totalTSS,
        tssDisplayMode: t.tssDisplayMode ?? null,
        avgPower: t.avgPower || t.averagePower || null,
        avgSpeed: t.avgSpeed || t.averageSpeed || null,
      };
    })
    .filter(Boolean);
}

/** Build the array the widget renders under "DONE" — completed activities
 *  done today. Earliest-first (first completed at top), max 4 entries. */
function pickTodaysCompleted(activities, plannedWorkouts) {
  if (!Array.isArray(activities)) return [];
  const today = new Date();
  // Today's planned workouts — used to decide whether a completed activity
  // was actually in the calendar plan (drives the green ✓ in the widget).
  const dayPlans = (Array.isArray(plannedWorkouts) ? plannedWorkouts : [])
    .filter(p => isSameLocalDay(p?.date, today));
  return activities
    .filter(a => isSameLocalDay(a?.date || a?.startDate || a?.timestamp, today))
    .sort(compareActivitiesChronologically)
    .slice(0, 4)
    .map(a => {
      const aid = String(a.id || a._id || '');
      // Planned if a same-day plan is explicitly linked to this activity, or
      // (fallback) a same-day plan of the same sport exists.
      const wasPlanned = dayPlans.some(p =>
        (p?.completedTrainingId && String(p.completedTrainingId) === aid) ||
        normaliseSportForWidget(p?.sport) === normaliseSportForWidget(a?.sport)
      );
      const durSec = Number(a.totalTime || a.duration || a.movingTime || a.moving_time || a.elapsedTime || a.elapsed_time || 0);
      const distM  = Number(a.distance || a.totalDistance || 0);
      const fmtDist = distM >= 1000 ? `${(distM / 1000).toFixed(1)} km`
                    : distM > 0      ? `${Math.round(distM)} m` : null;
      const power  = Number(a.normalizedPower || a.avgPower || a.average_watts || 0);
      const hr     = Number(a.averageHeartRate || a.average_heartrate || a.avgHeartRate || 0);
      const sub    = [fmtDist, power > 0 ? `${Math.round(power)} W` : null, hr > 0 ? `${Math.round(hr)} bpm` : null]
                       .filter(Boolean).join(' · ');
      return {
        title:       a.title || a.name || a.titleManual || 'Activity',
        sport:       normaliseSportForWidget(a.sport),
        durationSec: durSec || null,
        category:    a.category || null,
        subtitle:    sub || null,
        // Prefixed activity id so the widget can deep-link straight into this
        // training (handled by the appUrlOpen → ?openActivity route).
        id:          a.id || a._id || (a.stravaId ? `strava-${a.stravaId}` : null) || null,
        // Was this completed session part of the calendar plan? (green ✓)
        planned:     wasPlanned,
      };
    });
}

/** Build the array under "PLANNED" — today's planned workouts that haven't
 *  been completed yet. Sorted by longest planned duration first.
 *  A plan drops off this list once it's done: either it was explicitly
 *  completed (status / completedTrainingId / fitTrainingId) or a recorded
 *  activity of the same sport today is paired to it — so the widget never
 *  shows the same session twice (once as ✓ done, once as planned). */
function pickTodaysPlanned(plannedWorkouts, activities) {
  if (!Array.isArray(plannedWorkouts)) return [];
  const today = new Date();
  const todays = plannedWorkouts.filter(p => isSameLocalDay(p?.date, today));

  // Greedily pair each completed activity to one same-sport plan and mark it
  // claimed, so a finished plan is hidden from the PLANNED list.
  const pid = (p) => String(p?._id || p?.id || '');
  const claimed = new Set();
  const acts = (Array.isArray(activities) ? activities : [])
    .filter(a => isSameLocalDay(a?.date || a?.startDate || a?.timestamp, today));
  for (const a of acts) {
    const aid = String(a.id || a._id || '');
    const sport = normaliseSportForWidget(a?.sport);
    let match = todays.find(p => !claimed.has(pid(p)) && p.completedTrainingId && String(p.completedTrainingId) === aid);
    if (!match) match = todays.find(p => !claimed.has(pid(p)) && normaliseSportForWidget(p?.sport) === sport);
    if (match) claimed.add(pid(match));
  }

  const isDone = (p) =>
    p?.status === 'completed' || p?.completedTrainingId || p?.fitTrainingId || claimed.has(pid(p));

  return todays
    .filter(p => !isDone(p))
    .sort((a, b) => Number(b?.plannedDuration || 0) - Number(a?.plannedDuration || 0))
    .slice(0, 4)
    .map(p => {
      const distM = plannedDistanceMetres(p);
      const fmtDist = formatPlannedDistanceMetres(distM, p.sport);
      const tss = Number(p.targetTss || 0);
      const sub = [fmtDist, tss > 0 ? `${tss} TSS` : null].filter(Boolean).join(' · ');
      return {
        title:       p.title || p.name || 'Workout',
        sport:       normaliseSportForWidget(p.sport),
        durationSec: Number(p.plannedDuration || 0) || null,
        category:    p.category || null,
        subtitle:    sub || null,
        id:          p._id || p.id || null,
        planned:     true,
      };
    });
}

/** Tomorrow's planned workouts — shown only on the large (tall) widget. */
function pickTomorrowPlanned(plannedWorkouts) {
  if (!Array.isArray(plannedWorkouts)) return [];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return plannedWorkouts
    .filter(p => isSameLocalDay(p?.date, tomorrow))
    .sort((a, b) => Number(b?.plannedDuration || 0) - Number(a?.plannedDuration || 0))
    .slice(0, 4)
    .map(p => {
      const distM = plannedDistanceMetres(p);
      const fmtDist = formatPlannedDistanceMetres(distM, p.sport);
      const tss = Number(p.targetTss || 0);
      const sub = [fmtDist, tss > 0 ? `${tss} TSS` : null].filter(Boolean).join(' · ');
      return {
        title:       p.title || p.name || 'Workout',
        sport:       normaliseSportForWidget(p.sport),
        durationSec: Number(p.plannedDuration || 0) || null,
        category:    p.category || null,
        subtitle:    sub || null,
        id:          p._id || p.id || null,
        planned:     true,
      };
    });
}

function normalizeApiList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.trainings)) return payload.trainings;
  if (payload && Array.isArray(payload.activities)) return payload.activities;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

/** Aligns with integrations `/activities` cap (~2000); was 100 so older weeks looked empty. */
const MAX_DASHBOARD_CALENDAR_ACTIVITIES = 2000;

function sortAndLimitCalendarActivities(combined) {
  if (!Array.isArray(combined) || combined.length === 0) return [];
  const tMs = (act) => {
    const d = new Date(act?.date ?? act?.timestamp ?? act?.startDate ?? 0);
    const x = d.getTime();
    return Number.isNaN(x) ? 0 : x;
  };
  return [...combined].sort((a, b) => tMs(b) - tMs(a)).slice(0, MAX_DASHBOARD_CALENDAR_ACTIVITIES);
}

// ── Premium locked placeholder (shown in place of gated widgets) ──────────────
function PremiumLockedCard({ title, description, onUpgrade }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 flex flex-col items-center justify-center gap-3 text-center h-full min-h-[220px]">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
        <LockClosedIcon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 text-sm mb-1">{title}</h3>
        <p className="text-xs text-gray-500 max-w-[220px]">{description}</p>
      </div>
      <button
        onClick={onUpgrade}
        className="mt-1 px-4 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors"
      >
        Upgrade to Pro
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const { athleteId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [raceFeedbackFocusId, setRaceFeedbackFocusId] = useState(null);
  const { user, isAuthenticated } = useAuth();
  const role = String(user?.role || '').toLowerCase();
  const isTestingRole = role === 'testing' || role === 'tester';
  // Admin with role='athlete' should see athlete UI, not coach UI
  const isCoachLikeRole = ['admin', 'coach', 'testing', 'tester'].includes(role) ||
    (user?.admin === true && role !== 'athlete');
  const { addNotification } = useNotification();
  const { isPremium, gate, UpgradeModalProps } = usePremium();
  const [stravaConnected, setStravaConnected] = useState(false);
  const [showStravaBanner, setShowStravaBanner] = useState(false);
  const trainingsRequestRef = useRef(new Map());
  const calendarRequestRef = useRef(new Map());

  /**
   * Welcome paywall — shown once per user the first time they land on the
   * dashboard after sign-up / first login. Suppressed on native iOS (App
   * Store guideline 3.1.1) and for users who already have a paid plan.
   * Persistence is local-only (localStorage) so the user gets exactly one
   * pitch and we don't need a server-side flag for it.
   *
   * ─── Modal queue ──────────────────────────────────────────────────────────
   * All login-time modals (WelcomePaywall, WhatsNew, IOSLaunch) are managed
   * through a single queue so they can NEVER stack on top of each other.
   * Priority: welcomePaywall → whatsNew → iosLaunch.
   * The first eligible modal appears after MODAL_FIRST_DELAY ms. After one is
   * dismissed, the next (if any) appears after MODAL_NEXT_DELAY ms.
   */
  const MODAL_FIRST_DELAY = 2500; // ms before the first modal appears
  const MODAL_NEXT_DELAY  = 800;  // ms gap between consecutive modals

  // Which modal is currently open: null | 'welcomePaywall' | 'whatsNew' | 'iosLaunch'
  const [activeModal, setActiveModal] = useState(null);
  // Ref so timer callbacks always see the latest queue without stale closure
  const modalQueueRef = useRef([]);

  useEffect(() => {
    const param = searchParams.get('openRaceFeedback');
    if (!param) return;
    setRaceFeedbackFocusId(param);
    const next = new URLSearchParams(searchParams);
    next.delete('openRaceFeedback');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Build & schedule the queue once when the user is known.
  useEffect(() => {
    if (!isAuthenticated || !user?._id) return;
    if (isCapacitorNative()) return;

    const uid = user._id;
    const queue = [];

    // 1. Welcome paywall — free users, first time only
    if (!isPremium && !localStorage.getItem(`welcomePaywall_seen_${uid}`)) {
      queue.push('welcomePaywall');
    }

    // 2. What's new — web only, once per release tag
    if (!localStorage.getItem(whatsNewSeenKey(uid))) {
      queue.push('whatsNew');
    }

    // 3. iOS launch announcement — not native Capacitor, not already dismissed
    //    (or "just logged in" session flag overrides the persistent dismiss)
    let justLoggedIn = false;
    try { justLoggedIn = sessionStorage.getItem('iosLaunch_justLoggedIn') === '1'; } catch {}
    if (justLoggedIn || !localStorage.getItem(iosLaunchSeenKey(uid))) {
      queue.push('iosLaunch');
      if (justLoggedIn) {
        try { sessionStorage.removeItem('iosLaunch_justLoggedIn'); } catch {}
      }
    }

    if (!queue.length) return;
    modalQueueRef.current = queue;

    const t = setTimeout(() => {
      const next = modalQueueRef.current.shift();
      if (next) setActiveModal(next);
    }, MODAL_FIRST_DELAY);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?._id, isPremium]);

  // Advance to the next queued modal after the current one is dismissed.
  const advanceModalQueue = useCallback(() => {
    setActiveModal(null);
    const next = modalQueueRef.current.shift();
    if (!next) return;
    setTimeout(() => setActiveModal(next), MODAL_NEXT_DELAY);
  }, []);

  // Derived booleans — keep the same prop names so JSX below is unchanged.
  const showWelcomePaywall = activeModal === 'welcomePaywall';
  const showWhatsNew       = activeModal === 'whatsNew';
  const showIOSLaunch      = activeModal === 'iosLaunch';

  const dismissWelcomePaywall = useCallback(() => {
    if (user?._id) localStorage.setItem(`welcomePaywall_seen_${user._id}`, '1');
    advanceModalQueue();
  }, [user?._id, advanceModalQueue]);

  const dismissWhatsNew = useCallback(() => {
    if (user?._id) localStorage.setItem(whatsNewSeenKey(user._id), '1');
    advanceModalQueue();
  }, [user?._id, advanceModalQueue]);

  const dismissIOSLaunch = useCallback(() => {
    if (user?._id) localStorage.setItem(iosLaunchSeenKey(user._id), '1');
    advanceModalQueue();
  }, [user?._id, advanceModalQueue]);

  /**
   * One-shot self-healing sync on dashboard mount.
   *
   * Webhooks are the primary delivery channel for Stripe → MongoDB, but if a
   * webhook is misconfigured / delayed / signature-mismatched the user's plan
   * can stay "free" in our DB even after they paid. The user lands here right
   * after checkout (and on every subsequent login), so this is the best place
   * to reconcile state without making them click anything.
   *
   * Safe to run on every mount: the sync endpoint is idempotent and only
   * sends an activation email on a real free→paid transition.
   */
  useEffect(() => {
    if (!isAuthenticated || !user?._id) return;
    if (isCapacitorNative()) return; // iOS native — no Stripe linkage
    let cancelled = false;
    (async () => {
      try {
        const { syncSubscriptionFromStripe, fetchUserProfile } = await import('../services/api');
        const result = await syncSubscriptionFromStripe();
        if (cancelled || !result?.synced) return;
        // Only refresh the user object if sync actually flipped something.
        const fresh = await fetchUserProfile();
        if (!cancelled && fresh) {
          window.dispatchEvent(new CustomEvent('userUpdated', { detail: fresh }));
        }
      } catch (err) {
        // Non-fatal — sync is a best-effort reconciliation.
        console.warn('[Dashboard] subscription self-sync failed:', err?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?._id]);
  // ── Single source of truth for athlete selection ─────────────────────────────
  const { selectedAthleteId: _globalAthleteId, setSelectedAthleteId: _setGlobalAthleteId } = useAthleteSelection();
  // URL :athleteId wins on coach routes so /dashboard/<id> and the bar stay in sync immediately.
  const selectedAthleteId = isCoachLikeRole
    ? (athleteId || _globalAthleteId || user?._id || null)
    : (user?._id || null);
  const setSelectedAthleteId = _setGlobalAthleteId;
  /** Atletes never had `selectedAthleteId` set (it stayed null); charts used `athleteId` and bailed out. Coaches use selection. */
  const dashboardDataAthleteId = selectedAthleteId || user?._id || null;
  /** Guards async loaders — ignore responses that belong to a previous athlete selection. */
  const activeDataAthleteRef = useRef(dashboardDataAthleteId);
  const dataLoadGenRef = useRef(0);
  /** Coach viewing a linked athlete (not their own dashboard). */
  const isCoachViewingOtherAthlete = Boolean(
    isCoachLikeRole &&
    dashboardDataAthleteId &&
    user?._id &&
    String(dashboardDataAthleteId) !== String(user._id)
  );
  const prevDashboardAthleteRef = useRef(null);
  const lastLoadedAthleteIdRef = React.useRef(null);
  const lastLoadTimeRef = React.useRef(null);
  const hasLoadedOnceRef = React.useRef(false);
  const emptyRetryRef = React.useRef(0);
  const [trainings, setTrainings] = useState([]);
  const [regularTrainings, setRegularTrainings] = useState([]); // Trainings from /training route
  const [viewedAthleteProfile, setViewedAthleteProfile] = useState(null);
  const [athleteProfileLoaded, setAthleteProfileLoaded] = useState(false);
  const regularTrainingsRef = useRef(regularTrainings);
  useEffect(() => { regularTrainingsRef.current = regularTrainings; }, [regularTrainings]);
  // eslint-disable-next-line no-unused-vars
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Dashboard sport filter should not be shared with TrainingPage/TrainingStats localStorage key.
  // Use per-athlete dashboard key so it won't "randomly" flip to run/bike when another page saves its selection.
  const dashboardSportStorageKey = `dashboard_selectedSport_${selectedAthleteId || athleteId || user?._id || 'unknown'}`;
  const [selectedSport, setSelectedSport] = useState('all');
  
  // Load selectedSport per athlete
  useEffect(() => {
    if (!dashboardSportStorageKey) return;
    const saved = localStorage.getItem(dashboardSportStorageKey);
    const nextSport = saved || 'all';
    // Guard against state churn loops when key changes rapidly.
    setSelectedSport((prev) => (prev === nextSport ? prev : nextSport));
  }, [dashboardSportStorageKey]);
  
  // Listen for activity title renames (from CalendarView modal) and patch
  // the local trainings array so TrainingStats / TrainingGraph re-render with
  // the new title without a full refetch. Also patch the on-disk cache so
  // the change survives a reload (cache TTL is 10 min).
  useEffect(() => {
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
            const next = arr.map(t => {
              if (matcher(t)) { changed = true; return patcher(t); }
              return t;
            });
            if (changed) localStorage.setItem(key, JSON.stringify(next));
          } catch { /* corrupt entry — ignore */ }
        });
      } catch { /* localStorage unavailable — ignore */ }
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
      // Also patch the calendarData list — that's what WeeklyCalendar /
      // ActivityFullModal read from. Without this, closing + reopening
      // the modal shows the activity with stale (pre-save) category, so
      // the user thinks the save was lost even though server has it.
      setCalendarData(prev => prev.map(t => matches(t) ? patch(t) : t));
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
      setCalendarData(prev => prev.map(t => matches(t) ? { ...t, ...patch } : t));
      patchCalendarCache(matches, patch);
    };
    const onPlannedUpdated = (e) => {
      const planned = e?.detail?.planned;
      if (!planned?._id) return;
      setPlannedWorkouts(prev => upsertPlannedWorkoutList(prev, planned));
    };
    window.addEventListener('activityTitleUpdated', onTitleUpdated);
    window.addEventListener('activityCategoryUpdated', onCategoryUpdated);
    window.addEventListener('activityMetricsUpdated', onMetricsUpdated);
    window.addEventListener('plannedWorkoutUpdated', onPlannedUpdated);
    return () => {
      window.removeEventListener('activityTitleUpdated', onTitleUpdated);
      window.removeEventListener('activityCategoryUpdated', onCategoryUpdated);
      window.removeEventListener('activityMetricsUpdated', onMetricsUpdated);
      window.removeEventListener('plannedWorkoutUpdated', onPlannedUpdated);
    };
  }, []);

  // Persist selectedSport per athlete
  useEffect(() => {
    if (!dashboardSportStorageKey) return;
    localStorage.setItem(dashboardSportStorageKey, selectedSport);
  }, [dashboardSportStorageKey, selectedSport]);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [currentTest, setCurrentTest] = useState(null);
  const [tests, setTests] = useState([]);
  const [pendingAthleteIds, setPendingAthleteIds] = useState([]);
  /**
   * Tracks how many athletes the coach has actually linked. Used to surface
   * an empty-state CTA that nudges fresh coach accounts toward the Athletes
   * tab — without it, a brand-new coach lands on an empty dashboard with
   * no obvious next step.
   *
   * `null` = not yet loaded (don't render the nudge), `0` = empty (render),
   * `>0` = at least one athlete (don't render).
   */
  const [coachAthletesCount, setCoachAthletesCount] = useState(null);
  const navigate = useNavigate();  /** Avoid flashing the empty-state hero while API/cache is still settling */
  const [showEmptyWelcomeDelayed, setShowEmptyWelcomeDelayed] = useState(false);
  /** True once trainings + calendar have been fetched at least once (avoids flash on initial load) */
  const [trainingsInitialized, setTrainingsInitialized] = useState(false);

  // Check Strava connection status (athletes + coaches — own Strava / profile photo)
  useEffect(() => {
    const checkStravaConnection = async () => {
      if (!user) return;
      const hasLocalStravaConnection = Boolean(user?.strava?.accessToken || user?.strava?.athleteId);

      // Trust local profile first to avoid false banner flashes on slow/intermittent API.
      if (hasLocalStravaConnection) {
        setStravaConnected(true);
        setShowStravaBanner(false);
      }
      
      try {
        const status = await getIntegrationStatus();
        // Prefer positive local state over transient API false.
        const isConnected = Boolean(status?.stravaConnected) || hasLocalStravaConnection;
        setStravaConnected(isConnected);
        if (isConnected) {
          setShowStravaBanner(false);
        }
        
        // Show banner if not connected and user hasn't dismissed it recently
        if (!isConnected) {
          const dismissedKey = `strava_banner_dismissed_${user._id}`;
          const dismissedTimestamp = localStorage.getItem(dismissedKey);
          const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          
          if (!dismissedTimestamp || parseInt(dismissedTimestamp) < oneWeekAgo) {
            setShowStravaBanner(true);
          }
        }
      } catch (error) {
        console.warn('Failed to check Strava connection:', error);
        // Keep banner hidden when local profile already says connected.
        if (hasLocalStravaConnection) {
          setStravaConnected(true);
          setShowStravaBanner(false);
        }
      }
    };
    
    checkStravaConnection();
  }, [user]);

  useEffect(() => {
    const loadCoachAthletes = async () => {
      if (!isCoachLikeRole) return;
      try {
        const response = await api.get('/user/coach/athletes');
        const list = Array.isArray(response?.data) ? response.data : [];
        const pendingIds = list
          .filter((a) => a?.invitationPending || a?.coachLinkStatus === 'pending')
          .map((a) => String(a._id));
        setPendingAthleteIds(pendingIds);
        // Linked (non-pending) athletes only — those are the ones that
        // gate the "add your first athlete" CTA. Pending invites don't
        // count because the coach already sent them.
        const linkedCount = list.filter(
          (a) => !(a?.invitationPending || a?.coachLinkStatus === 'pending'),
        ).length;
        setCoachAthletesCount(linkedCount);
      } catch (e) {
        console.warn('Failed to load coach athletes for pending-state checks:', e?.message || e);
      }
    };
    loadCoachAthletes();
  }, [isCoachLikeRole]);
  
  const handleConnectStrava = async () => {
    try {
      const url = await getStravaAuthUrl();
      window.location.href = url;
    } catch (error) {
      console.error('Strava connect error:', error);
      addNotification('Failed to start Strava connection', 'error');
    }
  };
  
  const handleDismissBanner = () => {
    if (user) {
      const dismissedKey = `strava_banner_dismissed_${user._id}`;
      localStorage.setItem(dismissedKey, Date.now().toString());
      setShowStravaBanner(false);
    }
  };
  
  // Training calendar data (FIT files and Strava activities)
  const [calendarData, setCalendarData] = useState([]); // Combined data from calendar
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState(null);
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);
  const [planModal, setPlanModal] = useState(null);
  // Quick day-theme / period editors opened from the "Add a workout" modal tiles.
  const [quickTheme, setQuickTheme] = useState(null);   // { date, preset }
  const [quickPeriod, setQuickPeriod] = useState(null); // { defaultDate }
  // Native mobile dashboard — fitness metrics
  const [todayMetrics, setTodayMetrics] = useState({});
  const [sparklineData, setSparklineData] = useState([]);
  const [formMetricsLoading, setFormMetricsLoading] = useState(true);
  const formFitnessRequestGen = useRef(0);
  const [isTrainingFormOpen, setIsTrainingFormOpen] = useState(false);

  // For heavy dashboard widgets (TrainingTable, TrainingStats, TrainingGraph, SpiderChart),
  // work only with a limited number of the most recent trainings to keep calculations fast.
  const MAX_DASHBOARD_TRAININGS = 40;
  const recentTrainings = React.useMemo(() => {
    if (!trainings || trainings.length === 0) return [];
    return [...trainings]
      .filter(t => {
        // Strava activities (id or stravaId set)
        if (t.stravaId || t.id || t.raw?.id) return true;
        // FIT file trainings (have timestamp)
        if (t.timestamp) return true;
        // Regular trainings with exported lap results
        if (Array.isArray(t.results) && t.results.length > 0) return true;
        // Regular trainings with a title and some duration/date — include them too
        if ((t.title || t.titleManual) && (t.date || t.duration)) return true;
        return false;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date || a.startDate || a.timestamp || 0);
        const dateB = new Date(b.date || b.startDate || b.timestamp || 0);
        return dateB - dateA;
      })
      .slice(0, MAX_DASHBOARD_TRAININGS);
  }, [trainings]);

  // Subset for "Training History" / TrainingGraph — only the user-curated
  // Training-collection records (manual entries + Strava/FIT activities the
  // user explicitly exported via Add Lactate). Filter is intentionally
  // identical to TrainingPage's filteredTrainings so both pages show the
  // same dropdown.
  //
  // Important: apply the filter to the FULL `trainings` array (not
  // recentTrainings, which is capped at 40 raw-imports-included). Then sort
  // by date and cap. Otherwise a flood of recent Strava imports could
  // squeeze older exported records out of the 40-item window before the
  // filter even ran.
  const exportedTrainings = React.useMemo(() => {
    if (!trainings || trainings.length === 0) return [];
    return [...trainings]
      .filter(t => {
        if (!t) return false;
        if (t.source === 'strava' || t.source === 'fit') return false;
        const idStr = String(t.id || '');
        if (idStr.startsWith('strava-') || idStr.startsWith('fit-')) return false;
        return !!t._id || !t.source;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date || a.startDate || a.timestamp || 0);
        const dateB = new Date(b.date || b.startDate || b.timestamp || 0);
        return dateB - dateA;
      })
      .slice(0, MAX_DASHBOARD_TRAININGS);
  }, [trainings]);

  // Load athlete trainings with localStorage caching (shared with TrainingPage).
  // Also sets regularTrainings state so loadCalendarData can be called without
  // a separate /user/athlete/:id/trainings round-trip.
  const loadTrainings = useCallback(async (targetId) => {
    const applyIfCurrent = (fn) => {
      if (String(targetId) !== String(activeDataAthleteRef.current)) return false;
      fn();
      return true;
    };

    // v3 — titleManual now wins over .title/.name in the merged mapping.
    const cacheKey = `athleteTrainings_v3_${targetId}`;
    const tsKey = `${cacheKey}_ts`;
    const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

    let usedCache = false;

    // 1) Try to load trainings from cache for fast initial render
    try {
      const cached = localStorage.getItem(cacheKey);
      const ts = localStorage.getItem(tsKey);
      if (cached && ts) {
        const age = Date.now() - parseInt(ts, 10);
        if (!Number.isNaN(age) && age < CACHE_TTL) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            applyIfCurrent(() => {
              setTrainings(parsed);
              setTrainingsInitialized(true);
              setLoading(false);
            });
            usedCache = true;
          }
        }
      }
    } catch (e) {
      console.warn('Error reading trainings cache (dashboard):', e);
    }

      const inFlightTrainings = trainingsRequestRef.current.get(targetId);
      if (inFlightTrainings) return inFlightTrainings;

      // 2) Refresh from API, coalescing duplicate dashboard refreshes for the same athlete.
      const request = (async () => {
      if (!usedCache) {
        setLoading(true);
      }
      setError(null);

      const response = await api.get(`/user/athlete/${targetId}/trainings`, {
        // Shorter TTL in axios cache – protects server on quick navigations
        cacheTtlMs: 60000,
      });

      // Extract and store regular trainings before merging with FIT/Strava data.
      // This avoids a second fetch of the same endpoint by loadRegularTrainings.
      const regularTrainingsData = normalizeApiList(response.data);
      applyIfCurrent(() => setRegularTrainings(regularTrainingsData));

      // Optionally enrich with FIT trainings and Strava activities (same as TrainingPage)
      const [fitResponse, stravaResponse] = await Promise.all([
        api.get(`/api/fit/trainings`, { params: { athleteId: targetId } }).catch(() => ({ data: [] })),
        api.get(`/api/integrations/activities`, {
          params: { athleteId: targetId, summaryOnly: true, limit: MAX_DASHBOARD_CALENDAR_ACTIVITIES },
          cacheTtlMs: 60000,
        }).catch(() => ({ data: [] }))
      ]);

      const allTrainings = [
        ...regularTrainingsData,
        ...normalizeApiList(fitResponse?.data).map(t => ({
          ...t,
          category: t.category || null,
          // User-renamed title (titleManual) wins so the renames done via the
          // Planned dialog actually show up everywhere (TrainingHistory,
          // TrainingStats, TrainingGraph, etc.). Falls back through auto
          // titles → original filename.
          title: t.titleManual || t.title || t.titleAuto || t.originalFileName || null,
          // FIT trainings use timestamp as their date anchor
          date: t.date || t.timestamp || null,
          // Normalize sport from FIT values to short form
          sport: (() => {
            const s = String(t.sport || '').toLowerCase();
            if (s === 'cycling' || s.includes('cycle') || s.includes('bike') || s.includes('ride')) return 'bike';
            if (s === 'running' || s.includes('run')) return 'run';
            if (s === 'swimming' || s.includes('swim')) return 'swim';
            return t.sport || null;
          })(),
        })),
        ...normalizeApiList(stravaResponse?.data).map(a => ({
          ...a,
          category: a.category || null,
          // Strava uses startDate; all rendering/sorting code reads .date
          date: a.date || a.startDate || a.timestamp || null,
          // titleManual (user rename) takes precedence over the original
          // Strava name — otherwise the rename done from CalendarView never
          // shows up in TrainingHistory / TrainingStats / TrainingGraph.
          title: a.titleManual || a.name || a.title || null,
        }))
      ];

      applyIfCurrent(() => {
        setTrainings(allTrainings);
        setTrainingsInitialized(true);
      });

      // 3) Save to localStorage so next dashboard/TrainingPage open is instant
      try {
        const payload = JSON.stringify(allTrainings);
        if (payload.length < 300000) {
          localStorage.setItem(cacheKey, payload);
          localStorage.setItem(tsKey, Date.now().toString());
        }
      } catch (e) {
        console.warn('Error saving trainings cache (dashboard):', e);
      }

      // Return both merged list and raw regular trainings so callers can pass
      // regularTrainings directly to loadCalendarData without another fetch.
      return { allTrainings, regularTrainings: regularTrainingsData };
      })();

      trainingsRequestRef.current.set(targetId, request);
      try {
        return await request;
    } catch (error) {
      console.error('Error loading trainings (dashboard):', error);
      // setError(error.message);
      return null;
    } finally {
        trainingsRequestRef.current.delete(targetId);
      setLoading(false);
    }
  }, [setLoading]);

  const loadTests = useCallback(async (targetId) => {
    const applyIfCurrent = (fn) => {
      if (String(targetId) !== String(activeDataAthleteRef.current)) return false;
      fn();
      return true;
    };

    const cacheKey = `athleteTests_v1_${targetId}`;
    const tsKey = `${cacheKey}_ts`;
    const CACHE_TTL = 10 * 60 * 1000;

    // Fast path: show cached tests immediately (same pattern as loadTrainings)
    try {
      const cached = localStorage.getItem(cacheKey);
      const ts = localStorage.getItem(tsKey);
      if (cached && ts) {
        const age = Date.now() - parseInt(ts, 10);
        if (!Number.isNaN(age) && age < CACHE_TTL) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            applyIfCurrent(() => setTests(parsed));
          }
        }
      }
    } catch (e) {
      console.warn('Error reading tests cache (dashboard):', e);
    }

    try {
      setError(null);
      const response = await api.get(`/test/list/${targetId}`, { cacheTtlMs: 60000 });
      const raw = response?.data;
      const testsData = Array.isArray(raw)
        ? raw
        : (Array.isArray(raw?.tests) ? raw.tests : []);
      applyIfCurrent(() => setTests(testsData));
      try {
        const payload = JSON.stringify(testsData);
        if (payload.length < 300000) {
          localStorage.setItem(cacheKey, payload);
          localStorage.setItem(tsKey, Date.now().toString());
        }
      } catch (e) {
        console.warn('Error saving tests cache (dashboard):', e);
      }
      return testsData;
    } catch (error) {
      console.error('Error loading tests:', error);
      setError('Failed to load tests');
      return null;
    }
  }, []);

  const loadAthlete = useCallback(async (targetId) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/user/athlete/${targetId}`);
      if (response && response.data) {
        if (String(targetId) === String(activeDataAthleteRef.current)) {
          setViewedAthleteProfile(response.data);
        }
        return response.data;
      }
    } catch (error) {
      console.error('Error loading athlete:', error);
    //  setError(error.message);
    } finally {
      if (String(targetId) === String(activeDataAthleteRef.current)) {
        setAthleteProfileLoaded(true);
      }
      setLoading(false);
    }
  }, [setLoading]);

  // Load training calendar data (FIT files and Strava activities) with localStorage caching.
  // Accepts optional regularTrainingsParam so the main loader can pass data directly
  // without waiting for a state update cycle.
  const loadCalendarData = useCallback(async (targetId, regularTrainingsParam, prefetchedAllTrainings = null) => {
    const regTrainings = regularTrainingsParam ?? regularTrainingsRef.current;
    const applyIfCurrent = (fn) => {
      if (String(targetId) !== String(activeDataAthleteRef.current)) return false;
      fn();
      return true;
    };
    applyIfCurrent(() => setCalendarError(null));

    const finalizeCalendar = (combined, externalActivitiesError = null) => {
      const limitedForView = sortAndLimitCalendarActivities(combined);
      const cacheKey = `calendarData_${targetId}`;
      const cacheTimestampKey = `calendarData_timestamp_${targetId}`;
      const now = Date.now();

      if (externalActivitiesError) {
        applyIfCurrent(() => {
          const status = externalActivitiesError.response?.status;
          if (status === 429) {
            setCalendarError('Server is busy — showing cached activities. Try again in a moment.');
          } else {
            setCalendarError('Some activities could not be loaded. Calendar may be incomplete.');
          }
        });
      }

      try {
        if (limitedForView.length > 0) {
          const dataToCache = JSON.stringify(limitedForView);
          if (dataToCache.length < 450000) {
            localStorage.setItem(cacheKey, dataToCache);
            localStorage.setItem(cacheTimestampKey, now.toString());
          }
        }
      } catch (_) { /* ignore quota */ }

      applyIfCurrent(() => setCalendarData(limitedForView));
      console.log('[DashboardPage] Calendar data loaded and set:', limitedForView.length, 'activities');
      return limitedForView;
    };
    try {
      // Check localStorage cache first
      const cacheKey = `calendarData_${targetId}`;
      const cacheTimestampKey = `calendarData_timestamp_${targetId}`;
      const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours - long cache to reduce API calls
      
      const cachedData = localStorage.getItem(cacheKey);
      const cacheTimestamp = localStorage.getItem(cacheTimestampKey);
      const now = Date.now();
      
      // Use cache if it exists and is less than 24 hours old
      // Also use cache if it exists but is expired (as fallback while loading)
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          const isCacheValid = cacheTimestamp && (now - parseInt(cacheTimestamp)) < CACHE_DURATION;

          // Only trust a NON-EMPTY valid cache. An empty cache (written when the
          // dashboard loaded right after a first Strava connect, before activities
          // had synced) must NOT be served for 24h — fall through and refetch,
          // otherwise the calendar stays blank even after activities arrive.
          if (isCacheValid && parsed.length > 0) {
            applyIfCurrent(() => setCalendarData(parsed));
            console.log('[DashboardPage] Using valid cached calendar data:', parsed.length, 'activities');
          } else if (parsed.length > 0) {
            // Cache is expired but has data, use it as fallback while loading
            applyIfCurrent(() => setCalendarData(parsed));
            console.log('[DashboardPage] Using expired cache as fallback:', parsed.length, 'activities');
          }
        } catch (e) {
          console.error('Error parsing cached calendar data:', e);
          // Continue to load from API
        }
      } else {
        console.log('[DashboardPage] No cached calendar data found');
      }
      
      const inFlightCalendar = calendarRequestRef.current.get(targetId);
      if (inFlightCalendar) return inFlightCalendar;

      applyIfCurrent(() => setCalendarLoading(true));

      // Reuse trainings already fetched by loadTrainings() — cuts duplicate Strava/FIT calls in half.
      if (Array.isArray(prefetchedAllTrainings) && prefetchedAllTrainings.length > 0) {
        const request = (async () => {
          const combined = buildCalendarActivitiesFromTrainings(prefetchedAllTrainings, regTrainings);
          return finalizeCalendar(combined);
        })();
        calendarRequestRef.current.set(targetId, request);
        try {
          return await request;
        } finally {
          calendarRequestRef.current.delete(targetId);
          if (String(targetId) === String(activeDataAthleteRef.current)) {
            setCalendarLoading(false);
          }
        }
      }

      const request = (async () => {
      let externalActivitiesError = null;
      const [fitData, stravaData] = await Promise.all([
        getFitTrainings(targetId).catch(err => {
          console.error('Error loading FIT trainings:', err);
          return [];
        }),
        listExternalActivities({
          athleteId: targetId,
          summaryOnly: true,
          limit: MAX_DASHBOARD_CALENDAR_ACTIVITIES,
        }).catch(err => {
          externalActivitiesError = err;
          if (err.response?.status !== 429 && err.code !== 'ERR_NETWORK' && err.code !== 'ERR_EMPTY_RESPONSE') {
            console.error('Error loading Strava activities:', err);
          }
          // Return empty array on error - will use cached data if available
          return [];
        })
      ]);

      const trainingByStravaId = new Map();
      (regTrainings || []).forEach(t => {
        const sid = t?.sourceStravaActivityId;
        if (sid) trainingByStravaId.set(String(sid), t);
      });

      const combined = [
        ...(fitData || []).map(t => ({
          ...t,
          type: 'fit',
          date: t.timestamp,
          title: t.titleManual || t.titleAuto || t.originalFileName || 'Untitled Training',
          sport: t.sport,
          avgPower: t.avgPower,
          maxPower: t.maxPower,
          avgHeartRate: t.avgHeartRate,
          maxHeartRate: t.maxHeartRate,
          totalTime: t.totalElapsedTime || t.totalTimerTime,
          distance: t.totalDistance,
          tss: t.trainingStressScore ?? t.tss ?? t.totalTSS,
          tssDisplayMode: t.tssDisplayMode ?? null,
        })),
        ...(regTrainings || [])
          .filter(t => !t?.sourceStravaActivityId)
          .map(t => ({ 
            ...t,
            id: `regular-${t._id}`, 
            type: 'regular',
            date: t.date || t.timestamp, 
            title: t.title || 'Untitled Training', 
            sport: t.sport,
            category: t.category || null,
            distance: t.totalDistance || t.distance,
            totalTime: t.totalElapsedTime || t.totalTimerTime || t.duration,
            tss: t.tss || t.totalTSS,
            tssDisplayMode: t.tssDisplayMode ?? null,
            avgPower: t.avgPower || t.averagePower || null,
            avgSpeed: t.avgSpeed || t.averageSpeed || null
          })),
        ...(stravaData || []).map(a => {
          const stravaId = a.stravaId || a.id;
          // If there's a linked Training-model entry, use its title (but keep Strava data)
          const linkedTraining = trainingByStravaId.get(String(stravaId));
          return {
          ...a,
          type: 'strava',
          date: a.startDate,
            title: linkedTraining?.title || a.titleManual || a.name || 'Untitled Activity',
            linkedTrainingTitle: linkedTraining?.title || null,
          sport: a.sport,
            stravaId: stravaId, // Ensure stravaId is set (raw ID)
            id: `strava-${stravaId}`, // Use prefixed ID to match FitAnalysisPage format
          avgPower: a.averagePower || a.average_watts,
          weightedAveragePower: a.weightedAveragePower ?? a.weighted_average_watts ?? null,
          avgSpeed: a.averageSpeed || a.average_speed,
          maxPower: a.maxPower || a.max_watts,
          avgHeartRate: a.averageHeartRate || a.average_heartrate,
          maxHeartRate: a.maxHeartRate || a.max_heartrate,
          totalTime: a.movingTime || a.elapsedTime,
          distance: a.distance,
          tss:
            a.manualTss ??
            (linkedTraining?.tss ||
              linkedTraining?.totalTSS ||
              a.tss ||
              a.totalTSS ||
              a.total_tss ||
              null),
          tssDisplayMode: a.tssDisplayMode ?? linkedTraining?.tssDisplayMode ?? null,
          kilojoules: a.kilojoules ?? a.raw?.kilojoules
          };
        })
      ];

      return finalizeCalendar(combined, externalActivitiesError);
      })();

      calendarRequestRef.current.set(targetId, request);
      try {
        return await request;
      } finally {
        calendarRequestRef.current.delete(targetId);
        if (String(targetId) === String(activeDataAthleteRef.current)) {
          setCalendarLoading(false);
        }
      }
    } catch (error) {
      console.error('Error loading calendar data:', error);
      applyIfCurrent(() => {
        setCalendarError('Calendar activities could not be loaded. Please retry.');
        setCalendarLoading(false);
      });
      
      // Try to use cached data even if expired on error
      try {
        const cacheKey = `calendarData_${targetId}`;
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          applyIfCurrent(() => setCalendarData(parsed));
          return parsed;
        }
      } catch (e) {
        // Ignore cache errors
      }
      
      return [];
    }
  }, []);

  // Listen for activity updates from other pages (e.g., FitAnalysisPage)
  useEffect(() => {
    const handleActivityUpdate = (event) => {
      const updatedActivity = event.detail;
      console.log('[DashboardPage] Received activityUpdated event:', updatedActivity);
      // Track if we found and updated the activity
      let found = false;
      // Update the activity in calendarData
      setCalendarData(prev => {
        const updated = prev.map(act => {
          // Match by type and id
          if (updatedActivity.type === 'fit' && act.type === 'fit' && act._id === updatedActivity._id) {
            found = true;
            // For FIT trainings, update title from titleManual or title
            const newTitle = updatedActivity.title || updatedActivity.titleManual || act.title;
            return { 
              ...act, 
              ...updatedActivity,
              title: newTitle,
              titleManual: updatedActivity.titleManual || updatedActivity.title || act.titleManual
            };
          } else if (updatedActivity.type === 'strava' && act.type === 'strava') {
            // Match by stravaId or id (handle both string and number comparisons)
            // In DashboardPage, id is `strava-${stravaId}`, stravaId is raw ID
            // In FitAnalysisPage event, id can be raw ID or `strava-${id}`
            const actStravaId = String(act.stravaId || '');
            const actId = String(act.id || '');
            const updatedStravaId = String(updatedActivity.stravaId || updatedActivity.id || '');
            const updatedId = String(updatedActivity.id || '');
            
            // Remove 'strava-' prefix if present for comparison
            const actIdClean = actId.replace(/^strava-/, '');
            const updatedIdClean = updatedId.replace(/^strava-/, '');
            
            // Match if:
            // 1. Raw stravaIds match
            // 2. act.id (with prefix) matches updatedId (with or without prefix)
            // 3. act.stravaId matches updatedId (with or without prefix)
            const matches = (actStravaId && updatedStravaId && actStravaId === updatedStravaId) ||
                          (actIdClean && updatedIdClean && actIdClean === updatedIdClean) ||
                          (actStravaId && updatedIdClean && actStravaId === updatedIdClean) ||
                          (actId && updatedId && actId === updatedId) ||
                          (actIdClean && updatedStravaId && actIdClean === updatedStravaId);
            
            if (matches) {
              found = true;
              // For Strava activities, update title from titleManual, name, or title
              const newTitle = updatedActivity.title || updatedActivity.titleManual || updatedActivity.name || act.title;
              console.log('[DashboardPage] Updating Strava activity:', {
                actId: act.id,
                actStravaId: act.stravaId,
                actIdClean: actIdClean,
                updatedId: updatedActivity.id,
                updatedStravaId: updatedStravaId,
                updatedIdClean: updatedIdClean,
                oldTitle: act.title,
                newTitle: newTitle,
                matches: matches
              });
              return { 
                ...act, 
                ...updatedActivity,
                title: newTitle,
                titleManual: updatedActivity.titleManual || updatedActivity.title || updatedActivity.name || act.titleManual,
                name: updatedActivity.name || updatedActivity.title || updatedActivity.titleManual || act.name
              };
            }
          }
          return act;
        });
        console.log('[DashboardPage] Updated calendarData after activity update:', {
          found: found,
          totalActivities: updated.length,
          sampleActivity: updated.length > 0 ? updated[0] : null
        });
        // Return new array to ensure React detects the change
        return [...updated];
      });
      // Invalidate cache to force reload on next refresh
      const targetId = isCoachLikeRole && selectedAthleteId ? selectedAthleteId : user?._id;
      const cacheKey = `calendarData_${targetId}`;
      const cacheTimestampKey = `calendarData_timestamp_${targetId}`;
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(cacheTimestampKey);
      
      // Don't reload immediately - the state update above should be enough
      // Only reload if we didn't find the activity (to ensure we have the latest data)
      if (targetId && !found) {
        console.log('[DashboardPage] Activity not found in calendarData, reloading...');
        setTimeout(() => {
          loadCalendarData(targetId);
        }, 100);
      } else if (found) {
        console.log('[DashboardPage] Activity found and updated, no reload needed');
      }
    };

    window.addEventListener('activityUpdated', handleActivityUpdate);
    return () => window.removeEventListener('activityUpdated', handleActivityUpdate);
  }, [selectedAthleteId, user?._id, user?.role, isCoachLikeRole, loadCalendarData]);

  // ── React to Garmin auto-sync completing in the background (Layout.jsx) ────
  // Layout dispatches 'garminSyncComplete' whenever its foreground-triggered
  // Garmin sync actually imports/updates activities. Dashboard listens and
  // immediately reloads the calendar so new activities appear without the
  // user having to refresh or press Sync Now.
  useEffect(() => {
    if (!user?._id) return;
    const targetId = isCoachLikeRole ? selectedAthleteId : user._id;
    if (!targetId) return;

    const onGarminSync = async (e) => {
      console.log('[DashboardPage] garminSyncComplete event, reloading calendar', e.detail);
      try {
        const trainingsResult = await loadTrainings(targetId);
        loadCalendarData(targetId, trainingsResult?.regularTrainings, trainingsResult?.allTrainings);
      } catch (_) {}
    };
    window.addEventListener('garminSyncComplete', onGarminSync);
    return () => window.removeEventListener('garminSyncComplete', onGarminSync);
  }, [user?._id, selectedAthleteId, isCoachLikeRole, loadTrainings, loadCalendarData]);

  // ── Reload calendar when app comes back to foreground ────────────────────
  // On native (Capacitor) the app can be backgrounded while a Strava/Garmin
  // activity uploads. On web, the user might switch tabs and come back.
  // Neither case re-mounts the DashboardPage, so the initial auto-sync never
  // re-runs. A foreground/visibility listener covers both: reload the calendar
  // (not a full re-sync — just pull fresh data from the server's DB which the
  // webhook / background scheduler has already updated).
  useEffect(() => {
    if (!user?._id) return;
    const targetId = isCoachLikeRole ? selectedAthleteId : user._id;
    if (!targetId) return;

    // Throttle: reload at most once per 3 minutes on foreground.
    const FOREGROUND_RELOAD_COOLDOWN = 3 * 60 * 1000;
    const lastReloadKey = `dashboard_foreground_reload_${user._id}`;

    const onForeground = async () => {
      // When the dashboard is currently EMPTY (a previous load failed), always
      // reload on foreground — skip the 3-minute throttle. This is the common
      // "came back to a blank app" case and it should self-heal immediately.
      const isEmpty = (calendarDataRef.current?.length || 0) === 0;
      const last = parseInt(sessionStorage.getItem(lastReloadKey) || '0', 10);
      if (!isEmpty && Date.now() - last < FOREGROUND_RELOAD_COOLDOWN) return;
      sessionStorage.setItem(lastReloadKey, Date.now().toString());
      console.log('[DashboardPage] app foreground — refreshing calendar data');
      try {
        const trainingsResult = await loadTrainings(targetId);
        loadCalendarData(targetId, trainingsResult?.regularTrainings, trainingsResult?.allTrainings);
      } catch (_) {}
    };

    let cleanup = null;
    if (isCapacitorNative()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) onForeground();
        }).then((handle) => { cleanup = handle; });
      }).catch(() => {});
    } else {
      const onVisible = () => { if (document.visibilityState === 'visible') onForeground(); };
      document.addEventListener('visibilitychange', onVisible);
      cleanup = { remove: () => document.removeEventListener('visibilitychange', onVisible) };
    }

    return () => { cleanup?.remove?.(); };
  }, [user?._id, selectedAthleteId, isCoachLikeRole, loadTrainings, loadCalendarData]);

  // Removed: cascade useEffect that re-triggered loadCalendarData on regularTrainings change.
  // The main loader now passes regularTrainings directly to loadCalendarData.

  // Sync selectedAthleteId when URL athlete param changes.
  // NOTE: Do NOT reset to coach-self when URL has no athlete — that wipes the selection
  // that was stored in localStorage when the coach navigated via menu.
  useEffect(() => {
    if (isCoachLikeRole && athleteId && athleteId !== _globalAthleteId) {
      setSelectedAthleteId(athleteId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId, isCoachLikeRole]);

  // When coach switches athletes, drop stale dashboard state immediately so the
  // weekly calendar / charts never flash the previous athlete's data.
  useEffect(() => {
    const nextId = dashboardDataAthleteId;
    if (!nextId) return;

    activeDataAthleteRef.current = nextId;
    dataLoadGenRef.current += 1;

    if (prevDashboardAthleteRef.current && String(prevDashboardAthleteRef.current) !== String(nextId)) {
      setCalendarData([]);
      setTrainings([]);
      setRegularTrainings([]);
      setTests([]);
      setPlannedWorkouts([]);
      setDayPlans([]);
      setPeriods([]);
      setViewedAthleteProfile(null);
      setAthleteProfileLoaded(false);
      setCalendarError(null);
      setCalendarLoading(true);
      calendarRequestRef.current.clear();
      lastLoadedAthleteIdRef.current = null;
      hasLoadedOnceRef.current = false;
      lastLoadTimeRef.current = 0;
      // Legacy WeeklyCalendar cache (global key) — caused stale workouts on coach "Me".
      try {
        localStorage.removeItem('weeklyCalendar_activities');
        localStorage.removeItem('weeklyCalendar_cacheTime');
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith('athleteTests_v1_')) localStorage.removeItem(k);
        });
      } catch { /* ignore */ }
    }
    prevDashboardAthleteRef.current = nextId;
  }, [dashboardDataAthleteId]);

  // Load calendar data from cache on mount
  useEffect(() => {
    if (!user?._id) return;
    
    const targetId = isCoachLikeRole ? selectedAthleteId : user._id;
    if (!targetId) return;
    const cacheKey = `calendarData_${targetId}`;
    
    try {
      const cachedData = localStorage.getItem(cacheKey);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        if (parsed && parsed.length > 0 && String(targetId) === String(activeDataAthleteRef.current)) {
          setCalendarData(parsed);
          console.log('[DashboardPage] Loaded calendar data from cache on mount:', parsed.length, 'activities');
        }
      }
    } catch (e) {
      console.error('Error loading calendar data from cache on mount:', e);
    }
  }, [user?._id, selectedAthleteId, user?.role, isCoachLikeRole]);

  // Athlete change events are now handled centrally by AthleteSelectionContext.

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    // Determine target athlete ID — always use dashboardDataAthleteId so admin/coach
    // fallbacks match the widgets (trainings, calendar) on the same page.
    const targetAthleteId = dashboardDataAthleteId;
    
    if (!targetAthleteId) {
      return;
    }

    const isPendingAthleteSelection =
      isCoachLikeRole &&
      String(targetAthleteId) !== String(user?._id || '') &&
      pendingAthleteIds.includes(String(targetAthleteId));
    if (isPendingAthleteSelection) {
      const fallbackAthleteId = String(user?._id || '');
      if (fallbackAthleteId && String(selectedAthleteId || '') !== fallbackAthleteId) {
        setSelectedAthleteId(fallbackAthleteId); // context also writes to localStorage
        if (athleteId) {
          navigate('/dashboard', { replace: true });
        }
      }
      setError('Waiting for athlete confirmation');
      return;
    }

    // selectedAthleteId already defaults to user._id via the context-derived value above.

    // Skip if we already loaded data for this athlete recently (5 minutes minimum between loads)
    // BUT always load at least once
    const MIN_LOAD_INTERVAL = 5 * 60 * 1000;
    const now = Date.now();
    const shouldSkip = lastLoadedAthleteIdRef.current === targetAthleteId && 
                      lastLoadTimeRef.current && 
                      (now - lastLoadTimeRef.current) < MIN_LOAD_INTERVAL &&
                      hasLoadedOnceRef.current &&
                      (calendarDataRef.current?.length ?? 0) > 0;
    
    if (shouldSkip) {
      return;
    }

    const loadGen = dataLoadGenRef.current;

    const loadData = async () => {
      try {
        if (loadGen !== dataLoadGenRef.current) return;
        setCalendarLoading(true);
        
        // Testing role: dashboard is focused on tests only (no training widgets/calendar).
        if (isTestingRole) {
          const athleteData = await loadAthlete(targetAthleteId);
          await loadTests(targetAthleteId);
          if (loadGen !== dataLoadGenRef.current) return;
          if (athleteData && athleteData._id !== selectedAthleteId) {
            // Keep current selection stable to avoid effect loops.
          }
          setCalendarLoading(false);
          lastLoadedAthleteIdRef.current = targetAthleteId;
          lastLoadTimeRef.current = Date.now();
          hasLoadedOnceRef.current = true;
          return;
        }

        // loadTrainings fetches /user/athlete/:id/trainings AND sets regularTrainings state,
        // so we no longer need a separate loadRegularTrainings call for that endpoint.
        const trainingsResult = await loadTrainings(targetAthleteId);
        if (loadGen !== dataLoadGenRef.current) return;

        const [athleteProfile, , calendarActs] = await Promise.all([
          loadAthlete(targetAthleteId),
          loadTests(targetAthleteId),
          loadCalendarData(targetAthleteId, trainingsResult?.regularTrainings, trainingsResult?.allTrainings),
        ]);
        if (loadGen !== dataLoadGenRef.current) return;

        if (isCapacitorNative()) {
          recomputeFormFitness(
            calendarActs || calendarDataRef.current,
            athleteProfile || userRef.current || user,
          );
        } else if (calendarActs?.length) {
          recomputeFormFitness(
            calendarActs || calendarDataRef.current,
            athleteProfile || userRef.current || user,
          );
        }

        lastLoadedAthleteIdRef.current = targetAthleteId;
        lastLoadTimeRef.current = Date.now();
        hasLoadedOnceRef.current = true;
      } catch (error) {
        console.error('Error loading data:', error);
        // A failed cold-start load must NOT lock the 5-minute skip guard —
        // otherwise the dashboard stays empty until the app is restarted.
        // Reopen the guard so the retry effect / foreground refresh can reload.
        hasLoadedOnceRef.current = false;
        lastLoadTimeRef.current = 0;
      }
    };

    loadData();
  // selectedSport intentionally excluded — sport is a client-side filter, not a data-load trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId, user?._id, user?.role, dashboardDataAthleteId, selectedAthleteId, isAuthenticated, navigate, loadTrainings, loadAthlete, loadTests, loadCalendarData, isTestingRole, isCoachLikeRole, pendingAthleteIds]);

  // ── Self-heal: auto-retry when the dashboard loaded empty due to a failure ──
  // The #1 cause of "open the app and everything is blank until I restart" is a
  // cold-start request failing (Render free-tier spin-up, a 500, or a network
  // blip): loadCalendarData sets calendarError and returns []. Instead of
  // leaving the user stuck, retry a few times with backoff. We gate on
  // calendarError so a genuinely empty account (no error) is NOT retried.
  useEffect(() => {
    if (isTestingRole) return;
    const targetId = isCoachLikeRole ? selectedAthleteId : user?._id;
    if (!targetId) return;
    if (calendarData.length > 0) { emptyRetryRef.current = 0; return; } // recovered
    // Retry when we have a load error, OR when the calendar is empty but the
    // account clearly HAS data (planned workouts loaded) — i.e. the activities
    // fetch silently came back empty after a cold-start blip. A genuinely empty
    // account (no error, no plans) is left alone.
    const hasOtherData = Array.isArray(plannedWorkouts) && plannedWorkouts.length > 0;
    if (!calendarError && !hasOtherData) return;
    if (emptyRetryRef.current >= 4) return; // give up after 4 tries (~2+4+6+8s)
    const attempt = emptyRetryRef.current + 1;
    emptyRetryRef.current = attempt;
    const delay = Math.min(2000 * attempt, 8000);
    console.log(`[DashboardPage] empty after load error — retry ${attempt}/4 in ${delay}ms`);
    const t = setTimeout(async () => {
      setCalendarError(null);
      try {
        const r = await loadTrainings(targetId);
        await loadCalendarData(targetId, r?.regularTrainings, r?.allTrainings);
      } catch (_) { /* the effect re-runs if it fails again */ }
    }, delay);
    return () => clearTimeout(t);
  }, [calendarData.length, calendarError, plannedWorkouts, isTestingRole, isCoachLikeRole, selectedAthleteId, user?._id, loadTrainings, loadCalendarData]);

  // Auto-sync Strava activities if enabled
  useEffect(() => {
    if (!user?._id || !user?.strava?.autoSync) {
      return;
    }

    // Only auto-sync for the current user (not for coach viewing athlete)
    const targetAthleteId = isCoachLikeRole ? selectedAthleteId : user?._id;
    if (targetAthleteId !== user._id) {
      return; // Don't auto-sync when viewing another athlete
    }

    // Check if we've already synced in this session
    const syncKey = `strava_auto_sync_dashboard_${user._id}`;
    const lastSync = sessionStorage.getItem(syncKey);
    const now = Date.now();
    if (lastSync && (now - parseInt(lastSync)) < 5 * 60 * 1000) { // Don't sync more than once per 5 minutes
      return;
    }

    // Auto-sync on mount and when user changes
    const performAutoSync = async () => {
      try {
        const result = await autoSyncStravaActivities();
        sessionStorage.setItem(syncKey, now.toString());
        // Only surface a toast when ACTUAL new activities arrived. Bumping
        // on updated>0 with imported===0 produced the noisy
        // "Strava: 0 new activities imported" banner on every dashboard load,
        // because re-fetching the same window almost always updates the most
        // recent ride's stats without importing anything new.
        if (result.imported > 0) {
          console.log(`Auto-sync completed: ${result.imported} imported, ${result.updated} updated`);
          maybeNotifyStravaActivitiesImported(result.imported, user?.notifications, result.latestActivityId);
          addNotification(`Strava: ${result.imported} new ${result.imported === 1 ? 'activity' : 'activities'} imported`, 'success');
          // Reload all data after sync — loadTrainings sets regularTrainings state internally,
          // so one call replaces the old loadRegularTrainings + loadTrainings pair.
          const trainingsResult = await loadTrainings(user._id);
          loadCalendarData(user._id, trainingsResult?.regularTrainings, trainingsResult?.allTrainings);

          // Auto-open the newest imported activity on first sight. We dedupe
          // via localStorage so the same activity doesn't pop up repeatedly
          // on every reload — only the first time the user lands on the
          // dashboard after it was imported.
          if (result.latestActivityId) {
            const seenKey = `strava_lastSeenAutoOpen_${user._id}`;
            const previouslySeen = localStorage.getItem(seenKey);
            const candidate = String(result.latestActivityId);
            if (previouslySeen !== candidate) {
              localStorage.setItem(seenKey, candidate);
              // Native dashboard's `?openActivity=` watcher opens the
              // ActivityFullModal once activities arrive in state. Use
              // React Router's navigate so its history listener fires.
              navigate(
                `${window.location.pathname}?openActivity=${encodeURIComponent(`strava-${candidate}`)}`,
                { replace: true },
              );
            }
          }
        } else if (result.updated > 0) {
          // Silent refresh — Strava updated an existing ride (e.g. lap names,
          // power averages re-processed). No toast, but reload data so the
          // user sees the latest numbers on next render.
          const trainingsResult = await loadTrainings(user._id);
          loadCalendarData(user._id, trainingsResult?.regularTrainings, trainingsResult?.allTrainings);
        }
      } catch (error) {
        // 429 errors are already handled in autoSyncStravaActivities
        console.log('Auto-sync failed:', error);
        // Silent fail - don't show errors to user
      }
    };

    // Delay auto-sync slightly to avoid blocking page load
    const timeoutId = setTimeout(performAutoSync, 2000);
    
    return () => clearTimeout(timeoutId);
  }, [user?._id, user?.strava?.autoSync, user?.notifications, selectedAthleteId, user?.role, loadCalendarData, loadTrainings, addNotification, isCoachLikeRole, navigate]);

  // ── Manual Strava sync (used by NativeDashboardPage refresh button) ─────
  // Bypasses the auto-sync `user.strava.autoSync` gate and the 5-minute
  // sessionStorage throttle — the server still enforces its own cooldown so
  // we won't hammer Strava. Reloads trainings + calendar on success.
  // Bypasses the auto-sync `user.strava.autoSync` gate and the 5-minute
  // sessionStorage throttle — also recomputes Form/Fitness from fresh calendar TSS.

  // ── Planned workouts + day themes for dashboard calendar ──────────────────
  const [dayPlans, setDayPlans] = useState([]);
  const [periods, setPeriods] = useState([]);
  const loadDashboardPlannedWorkouts = useCallback(async () => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
      const loadFor = isCoachLike && selectedAthleteId ? selectedAthleteId : user?._id;
      const opts = isCoachLike && selectedAthleteId ? { athleteId: selectedAthleteId } : {};
      const [pw, dp, ps] = await Promise.all([
        getPlannedWorkouts(opts),
        getDayPlans(opts).catch(() => []),
        getPeriods(opts).catch(() => []),
      ]);
      if (String(loadFor) !== String(activeDataAthleteRef.current)) return;
      setPlannedWorkouts(Array.isArray(pw) ? pw : []);
      setDayPlans(Array.isArray(dp) ? dp : []);
      setPeriods(Array.isArray(ps) ? ps : []);
    } catch (_) {}
  }, [selectedAthleteId, user?.role, user?._id]);

  useEffect(() => { loadDashboardPlannedWorkouts(); }, [loadDashboardPlannedWorkouts]);

  // ── Day theme save / delete ───────────────────────────────────────────────
  const handleDayPlanSave = useCallback(async (dateStr, payload) => {
    const role = String(user?.role || '').toLowerCase();
    const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
    const coachAthleteId = isCoachLike && selectedAthleteId ? selectedAthleteId : null;
    const result = await apiSetDayPlan(dateStr, payload || {}, coachAthleteId);
    setDayPlans(prev => {
      const without = prev.filter(p => p.date !== dateStr);
      if (result?.deleted) return without;
      return [...without, result];
    });
    return result;
  }, [selectedAthleteId, user?.role]);

  const handleDayPlanDelete = useCallback(async (dateStr) => {
    const role = String(user?.role || '').toLowerCase();
    const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
    const coachAthleteId = isCoachLike && selectedAthleteId ? selectedAthleteId : null;
    await apiDeleteDayPlan(dateStr, coachAthleteId);
    setDayPlans(prev => prev.filter(p => p.date !== dateStr));
  }, [selectedAthleteId, user?.role]);

  // ── Calendar period save / delete ─────────────────────────────────────────
  const handlePeriodSave = useCallback(async (payload) => {
    const role = String(user?.role || '').toLowerCase();
    const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
    const coachAthleteId = isCoachLike && selectedAthleteId ? selectedAthleteId : null;
    const result = await apiSavePeriod(payload, coachAthleteId);
    setPeriods(prev => {
      const without = prev.filter(p => String(p._id) !== String(result._id));
      return [...without, result];
    });
    return result;
  }, [selectedAthleteId, user?.role]);

  const handlePeriodDelete = useCallback(async (periodId) => {
    const role = String(user?.role || '').toLowerCase();
    const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
    const coachAthleteId = isCoachLike && selectedAthleteId ? selectedAthleteId : null;
    await apiDeletePeriod(periodId, coachAthleteId);
    setPeriods(prev => prev.filter(p => String(p._id) !== String(periodId)));
  }, [selectedAthleteId, user?.role]);

  // ── Native dashboard: fitness/form metrics (only fetched when native) ─────
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  const plannedWorkoutsRef = useRef([]);
  useEffect(() => { plannedWorkoutsRef.current = plannedWorkouts; }, [plannedWorkouts]);

  const calendarDataRef = useRef([]);
  useEffect(() => { calendarDataRef.current = calendarData; }, [calendarData]);

  const profileTssFingerprint = useMemo(() => {
    const p = user;
    if (!p) return '';
    const cz = p.powerZones?.cycling || {};
    const rz = p.runZones || {};
    const sz = p.swimZones || {};
    const hz = p.heartRateZones || {};
    return [
      cz.lt2, cz.ftp, p.ftp,
      rz.lt2, sz.lt2,
      hz.lt2, hz.lt2Hr, p.maxHr,
      p.tssDisplayMode,
    ].join('|');
  }, [user]);

  useEffect(() => {
    setTodayMetrics({});
    setSparklineData([]);
    setFormMetricsLoading(true);
    formFitnessRequestGen.current += 1;
    // Paint cached calendar immediately so native PMC can compute without waiting for network.
    if (dashboardDataAthleteId) {
      try {
        const cached = localStorage.getItem(`calendarData_${dashboardDataAthleteId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCalendarData(parsed);
          }
        }
      } catch (_) { /* ignore */ }
    }
  }, [dashboardDataAthleteId]);

  const pushFormFitnessWidget = useCallback((tm, raw) => {
    if (!tm || !isCapacitorNative()) return;
    const tsb14 = (raw || [])
      .slice(-14)
      .map(d => Number(d?.Form ?? d?.form ?? d?.tsb ?? 0));
    writeFormFitnessToWidget({
      fitness:   tm.fitness,
      fatigue:   tm.fatigue,
      form:      tm.form,
      formDelta: tm.formChange,
      sparkline: tsb14,
      todayCompleted: pickTodaysCompleted(calendarDataRef.current, plannedWorkoutsRef.current),
      todayPlanned:    pickTodaysPlanned(plannedWorkoutsRef.current, calendarDataRef.current),
      tomorrowPlanned: pickTomorrowPlanned(plannedWorkoutsRef.current),
    });
  }, []);

  const recomputeFormFitness = useCallback((acts, profile) => {
    if (!acts?.length || !profile) {
      setFormMetricsLoading(false);
      return false;
    }
    const { series, todayMetrics: tm } = computePmcFromActivities(acts, profile);
    if (!tm) {
      setFormMetricsLoading(false);
      return false;
    }
    formFitnessRequestGen.current += 1;
    setTodayMetrics(tm);
    if (series.length) setSparklineData(series);
    pushFormFitnessWidget(tm, series);
    setFormMetricsLoading(false);
    return true;
  }, [pushFormFitnessWidget]);

  const applyCalendarFormFitness = useCallback(() => {
    return recomputeFormFitness(calendarDataRef.current, userRef.current);
  }, [recomputeFormFitness]);

  const loadFormFitness = useCallback(async (targetId) => {
    if (!targetId) return;
    if (applyCalendarFormFitness()) return;
    // Native always derives CTL/ATL/TSB from calendar TSS — server API can lag behind.
    if (isCapacitorNative()) {
      setFormMetricsLoading(false);
      return;
    }
    const gen = ++formFitnessRequestGen.current;
    try {
      const [todayRes, sparkRes] = await Promise.all([
        getTodayMetrics(targetId).catch(() => ({ data: {} })),
        getFormFitnessData(targetId, 90, 'all').catch(() => ({ data: [] })),
      ]);
      if (gen !== formFitnessRequestGen.current) return;
      if (todayRes?.data) setTodayMetrics(todayRes.data);
      const raw = sparkRes?.data
        ? (Array.isArray(sparkRes.data) ? sparkRes.data : (sparkRes.data?.data || []))
        : [];
      if (raw.length > 0) setSparklineData(raw);

      if (todayRes?.data) {
        pushFormFitnessWidget(todayRes.data, raw);
      }
    } catch (_) {
      // ignore
    } finally {
      if (gen === formFitnessRequestGen.current) setFormMetricsLoading(false);
    }
  }, [applyCalendarFormFitness, pushFormFitnessWidget]);

  /** Native pull-to-refresh: reload activities + recompute CTL/ATL/TSB from calendar TSS. */
  const refreshNativeDashboard = useCallback(async ({ syncStrava = false } = {}) => {
    const targetId = dashboardDataAthleteId;
    if (!targetId) return null;

    clearFormFitnessCache();
    setFormMetricsLoading(true);
    try {
      localStorage.removeItem(`calendarData_${targetId}`);
      localStorage.removeItem(`calendarData_timestamp_${targetId}`);
    } catch (_) {}

    if (syncStrava && user?.strava?.accessToken) {
      try {
        const result = await autoSyncStravaActivities({ force: true });
        if (result?.error) {
          addNotification(`Strava sync: ${result.error}`, 'error');
        } else if (result?.imported > 0 || result?.updated > 0) {
          maybeNotifyStravaActivitiesImported(result.imported, user?.notifications, result.latestActivityId);
          addNotification(
            `Strava: ${result.imported || 0} new ${result.imported === 1 ? 'activity' : 'activities'} imported`,
            'success',
          );
        }
      } catch (e) {
        console.log('Strava sync during dashboard refresh failed:', e);
      }
    }

    const trainingsResult = await loadTrainings(targetId);
    const acts = await loadCalendarData(targetId, trainingsResult?.regularTrainings, trainingsResult?.allTrainings);
    await loadDashboardPlannedWorkouts();

    if (!recomputeFormFitness(acts || calendarDataRef.current, userRef.current)) {
      setFormMetricsLoading(false);
    }

    return acts;
  }, [
    dashboardDataAthleteId,
    user,
    addNotification,
    loadTrainings,
    loadCalendarData,
    loadDashboardPlannedWorkouts,
    recomputeFormFitness,
  ]);

  const performManualStravaSync = useCallback(async () => {
    try {
      const acts = await refreshNativeDashboard({ syncStrava: !!user?.strava?.accessToken });
      if (acts?.length) {
        addNotification('Dashboard refreshed.', 'info');
      }
      return acts;
    } catch (e) {
      console.log('Dashboard refresh failed:', e);
      addNotification('Refresh failed. Please try again.', 'error');
      return { imported: 0, updated: 0, error: e?.message };
    }
  }, [user?.strava?.accessToken, refreshNativeDashboard, addNotification]);

  useEffect(() => {
    syncDailyTrainingReminder(plannedWorkouts, user?.notifications).catch(() => {});
  }, [plannedWorkouts, user?.notifications]);

  // Native: derive CTL/ATL/TSB from calendar activities (never the server API).
  useEffect(() => {
    if (!isCapacitorNative()) {
      setFormMetricsLoading(false);
      return;
    }
    if (!dashboardDataAthleteId || !user?._id) {
      setFormMetricsLoading(false);
      return;
    }
    if (calendarLoading && !calendarData?.length) {
      setFormMetricsLoading(true);
      return;
    }
    if (!calendarData?.length) {
      setFormMetricsLoading(false);
      return;
    }
    const ok = recomputeFormFitness(
      calendarData,
      viewedAthleteProfile || userRef.current || user,
    );
    if (!ok) setFormMetricsLoading(false);
  }, [
    calendarData,
    calendarLoading,
    dashboardDataAthleteId,
    user,
    viewedAthleteProfile,
    profileTssFingerprint,
    recomputeFormFitness,
  ]);

  // Prompt zones setup when dashboard has workouts but no thresholds (web + native).
  useEffect(() => {
    if (!user?._id || !dashboardDataAthleteId) return;
    if (String(dashboardDataAthleteId) !== String(user._id)) return;
    if (calendarLoading) return;
    if (!calendarData?.length) return;
    const t = window.setTimeout(() => {
      maybePromptTrainingZonesSetup(user, calendarData);
    }, 2000);
    return () => window.clearTimeout(t);
  }, [user, dashboardDataAthleteId, calendarLoading, calendarData]);

  // When the planned workout list itself changes (athlete plans a new
  // session today, drag-drops one onto today, etc.) re-push the widget
  // payload so it doesn't stay stuck on yesterday's plan.
  useEffect(() => {
    if (!isCapacitorNative()) return;
    const tm = todayMetrics || {};
    if (tm.fitness == null && tm.fatigue == null && tm.form == null) return;
    const tsb14 = (sparklineData || [])
      .slice(-14)
      .map(d => Number(d?.Form ?? d?.form ?? d?.tsb ?? 0));
    writeFormFitnessToWidget({
      fitness:   tm.fitness,
      fatigue:   tm.fatigue,
      form:      tm.form,
      formDelta: tm.formChange,
      sparkline: tsb14,
      todayCompleted: pickTodaysCompleted(calendarData, plannedWorkouts),
      todayPlanned:    pickTodaysPlanned(plannedWorkouts, calendarData),
      tomorrowPlanned: pickTomorrowPlanned(plannedWorkouts),
    });
  }, [plannedWorkouts, calendarData, todayMetrics, sparklineData]);

  // Re-fetch CTL/ATL/TSB when a workout's TSS, duration or display mode changes.
  useEffect(() => {
    if (!isCapacitorNative() || !dashboardDataAthleteId) return;
    const refresh = (e) => {
      // Metric-patch events carry detail.id; TSS mode toggle does not.
      if (e?.type === 'activityMetricsUpdated' && !e?.detail?.id) return;
      clearFormFitnessCache();
      setFormMetricsLoading(true);
      window.setTimeout(() => {
        if (!recomputeFormFitness(calendarDataRef.current, userRef.current)) {
          setFormMetricsLoading(false);
        }
      }, 0);
    };
    window.addEventListener('activityMetricsUpdated', refresh);
    window.addEventListener(TSS_DISPLAY_MODE_EVENT, refresh);
    return () => {
      window.removeEventListener('activityMetricsUpdated', refresh);
      window.removeEventListener(TSS_DISPLAY_MODE_EVENT, refresh);
    };
  }, [dashboardDataAthleteId, recomputeFormFitness]);

  // ── Strava webhook → live dashboard refresh ───────────────────────────────
  // When the server receives a Strava webhook and saves a new activity it:
  //   (native) sends a push notification → NativeLayout dispatches stravaSyncComplete
  //   (web)    the notification poller in Layout dispatches stravaSyncComplete
  // Both paths land here and trigger a full reload of activities so the
  // dashboard calendar and zone charts update without the user pulling-to-refresh.
  useEffect(() => {
    if (!dashboardDataAthleteId) return;
    const onSync = async () => {
      setFormMetricsLoading(true);
      try {
        // Bust the 24-hour localStorage cache so loadCalendarData fetches fresh
        // data from the API instead of returning stale cached activities.
        localStorage.removeItem(`calendarData_${dashboardDataAthleteId}`);
        localStorage.removeItem(`calendarData_timestamp_${dashboardDataAthleteId}`);
        const trainingsResult = await loadTrainings(dashboardDataAthleteId);
        const acts = await loadCalendarData(dashboardDataAthleteId, trainingsResult?.regularTrainings, trainingsResult?.allTrainings);
        clearFormFitnessCache();
        if (!recomputeFormFitness(acts || calendarDataRef.current, userRef.current)) {
          await loadFormFitness(dashboardDataAthleteId);
        }
        window.dispatchEvent(new CustomEvent('activityMetricsUpdated'));
      } catch (_) {}
    };
    window.addEventListener('stravaSyncComplete', onSync);
    return () => window.removeEventListener('stravaSyncComplete', onSync);
  }, [dashboardDataAthleteId, loadTrainings, loadCalendarData, loadFormFitness, recomputeFormFitness]);

  const handleDashboardPlanSave = useCallback(async (data) => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
      const opts = isCoachLike && selectedAthleteId ? { athleteId: selectedAthleteId } : {};
      if (planModal?.workout?._id) {
        const updated = await updatePlannedWorkout(planModal.workout._id, data);
        setPlannedWorkouts(prev => prev.map(p => p._id === updated._id ? updated : p));
      } else {
        const created = await createPlannedWorkout({ ...data, ...opts });
        setPlannedWorkouts(prev => [...prev, created]);
      }
      setPlanModal(null);
    } catch (_) {}
  }, [planModal, selectedAthleteId, user?.role]);

  const handleDashboardPlanDelete = useCallback(async (pw) => {
    if (!window.confirm('Delete this planned workout?')) return;
    try {
      await deletePlannedWorkout(pw._id);
      setPlannedWorkouts(prev => prev.filter(p => p._id !== pw._id));
      setPlanModal(null);
    } catch (_) {}
  }, []);

  const handleDashboardCopyPlan = useCallback(async (pw, newDateStr) => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
      const opts = isCoachLike && selectedAthleteId ? { athleteId: selectedAthleteId } : {};
      const { _id, status, executionData, ...rest } = pw;
      const created = await createPlannedWorkout({ ...rest, date: newDateStr, status: 'planned', ...opts });
      setPlannedWorkouts(prev => [...prev, created]);
    } catch (_) {}
  }, [selectedAthleteId, user?.role]);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (recentTrainings.length > 0) {
      // Get available sports from recent trainings only (keeps UI snappy)
      const availableSports = [...new Set(recentTrainings.map(t => t.sport))].filter(Boolean);
      
      // If current selectedSport is not available and is not 'all', switch to first available
      // 'all' is always valid, so we don't reset it
      if (availableSports.length > 0 && selectedSport !== 'all' && !availableSports.includes(selectedSport)) {
        setSelectedSport(availableSports[0]);
        return;
      }
      
      const sportTrainings = selectedSport === 'all'
        ? recentTrainings
        : recentTrainings.filter(t => t.sport === selectedSport);

      // Preserve the user's pick across both sport and "raw vs exported"
      // boundaries. recentTrainings is capped at 40 and includes raw
      // Strava/FIT imports, so a Training-collection record the user just
      // picked from the dropdown (which is built from exportedTrainings —
      // a different 40-slice) may legitimately be absent here. Validate
      // against the full \`trainings\` array instead.
      const titleExists = !!selectedTitle && (trainings || []).some(t => t.title === selectedTitle);
      if (!titleExists) {
        const latest = [...sportTrainings].sort((a, b) =>
          new Date(b.date || b.startDate || b.timestamp || 0) - new Date(a.date || a.startDate || a.timestamp || 0)
        )[0];
        if (latest) {
          setSelectedTitle(latest.title);
          setSelectedTraining(latest._id || latest.id);
        }
      }
    }
  }, [selectedSport, recentTrainings, selectedTitle, trainings]);

  // Reset initialization flag whenever the viewed athlete changes so the banner
  // doesn't flash while the new athlete's data is still being fetched.
  useEffect(() => {
    setTrainingsInitialized(false);
    setShowEmptyWelcomeDelayed(false);
  }, [selectedAthleteId]);

  useEffect(() => {
    // Don't start the timer until we've received at least one response from the API/cache
    // — this prevents the welcome panel from flashing on initial load when data isn't ready yet
    if (!trainingsInitialized) return;
    const noTrainings = !recentTrainings || recentTrainings.length === 0;
    const noCalendar = !calendarData || calendarData.length === 0;
    if (!noTrainings || !noCalendar) {
      setShowEmptyWelcomeDelayed(false);
      return undefined;
    }
    // Short extra delay after data confirms empty (avoids a brief flash if calendar loads slightly later)
    const t = window.setTimeout(() => setShowEmptyWelcomeDelayed(true), 800);
    return () => clearTimeout(t);
  }, [recentTrainings, calendarData, trainingsInitialized]);

  const showAthleteEmptyWelcome =
    !isTestingRole &&
    user?.role === 'athlete' &&
    String(selectedAthleteId || '') === String(user._id || '') &&
    showEmptyWelcomeDelayed &&
    (!recentTrainings || recentTrainings.length === 0) &&
    (!calendarData || calendarData.length === 0);

  const hasCalendarData = (calendarData?.length ?? 0) > 0;
  const showCalendarSkeleton = calendarLoading && !hasCalendarData;
  const showCalendarEmpty = trainingsInitialized && !calendarLoading && !calendarError && !hasCalendarData;
  // Charts must wait for a finished calendar refresh + full athlete profile.
  // Using cached calendar while fetch is in-flight caused CTL/ATL to jump on refresh.
  const dashboardFitnessLoading = calendarLoading || !athleteProfileLoaded;

  // Lactate tests on the dashboard are independent of the training sport filter
  // (selectedSport drives TrainingStats/SpiderChart — mixing the two hid valid tests).
  const dashboardTests = useMemo(
    () => (Array.isArray(tests) ? tests.filter((t) => t && t._id) : []),
    [tests]
  );

  // Update currentTest when tests list changes
  useEffect(() => {
    if (dashboardTests.length === 0) {
      setCurrentTest(null);
      return;
    }
    if (currentTest && !dashboardTests.find(t => t._id === currentTest._id)) {
      const mostRecent = dashboardTests.reduce((latest, cur) =>
        new Date(cur.date) > new Date(latest.date) ? cur : latest
      );
      setCurrentTest(mostRecent);
    } else if (!currentTest) {
      const mostRecent = dashboardTests.reduce((latest, cur) =>
        new Date(cur.date) > new Date(latest.date) ? cur : latest
      );
      setCurrentTest(mostRecent);
    }
  }, [dashboardTests]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDateSelectorTestSelect = (testId) => {
    const selectedTest = dashboardTests.find(test => test._id === testId);
    if (selectedTest) {
      setCurrentTest(selectedTest);
    }
  };

  // Self-heal: if trainings loaded but tests stayed empty, retry once (stale cache / race).
  useEffect(() => {
    if (!dashboardDataAthleteId || isTestingRole) return;
    if (dashboardTests.length > 0) return;
    if (!trainingsInitialized) return;
    const hasTrainings = (trainings?.length ?? 0) > 0 || (calendarData?.length ?? 0) > 0;
    if (!hasTrainings) return;
    const t = window.setTimeout(() => {
      loadTests(dashboardDataAthleteId);
    }, 1200);
    return () => clearTimeout(t);
  }, [dashboardDataAthleteId, dashboardTests.length, trainingsInitialized, trainings?.length, calendarData?.length, isTestingRole, loadTests]);

  const handleDashboardAddTraining = async (formData) => {
    if (!user?._id) return;
    const targetId = dashboardDataAthleteId || user._id;
    const trainingData = { ...formData, athleteId: targetId, coachId: user._id };
    await addTraining(trainingData);
    setIsTrainingFormOpen(false);
  };

  // ── + Lactate from WeeklyCalendar activity modal: open TrainingForm prefilled
  // with Strava laps (and scroll to the lap the user clicked) ────────────────
  const [lactateFormModal, setLactateFormModal] = useState({ isOpen: false, initialData: null });
  const [lactateFormSubmitting, setLactateFormSubmitting] = useState(false);
  const [lactateFormError, setLactateFormError] = useState(null);

  const closeLactateForm = useCallback(() => {
    setLactateFormModal({ isOpen: false, initialData: null });
    setLactateFormError(null);
  }, []);

  // Map an array of Strava/FIT laps to TrainingForm `results` rows. Pulled
  // out as a helper so both the Strava-detail path and the FIT/regular
  // fallback share it.
  const lapsToResults = useCallback((laps, sportKey) => {
    const isRun = sportKey === 'run';
    const isSwim = sportKey === 'swim';
    const fmtDur = (sec) => {
      const s = Number(sec) || 0;
      const m = Math.floor(s / 60);
      const ss = Math.round(s % 60);
      return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    };
    return (Array.isArray(laps) ? laps : []).map((lap, idx) => {
      const durationSec = Math.round(
        lap.moving_time ?? lap.totalTimerTime ?? lap.totalElapsedTime ?? lap.elapsed_time ?? lap.duration ?? 0
      );
      const distM = Math.round(lap.distance ?? lap.totalDistance ?? lap.distanceMeters ?? 0);
      const speed = lap.average_speed ?? lap.avgSpeed ?? lap.avg_speed ?? lap.enhancedAvgSpeed ?? 0;
      let powerValue = '';
      if (isRun || isSwim) {
        const eff = speed > 0.05 ? speed : (distM > 0 && durationSec > 0 ? distM / durationSec : 0);
        if (eff > 0.05) {
          const paceSec = isSwim ? Math.round(100 / eff) : Math.round(1000 / eff);
          powerValue = fmtDur(paceSec);
        }
      } else {
        const w = lap.average_watts ?? lap.avgPower ?? lap.average_power ?? 0;
        powerValue = w > 0 ? String(Math.round(w)) : '';
      }
      const isSwimRest = isSwim && distM < 10;
      return {
        interval: idx + 1,
        power: powerValue,
        heartRate: String(Math.round(lap.average_heartrate ?? lap.avgHeartRate ?? lap.avg_heart_rate ?? 0) || ''),
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
  }, []);

  const handleDashboardAddLactate = useCallback(async (activity, lapIndex = null) => {
    if (!activity) return;
    setLactateFormError(null);

    const rawId = String(activity?.id || activity?.stravaId || activity?._id || '');
    const stravaNumericId = rawId.replace(/^strava-/i, '');
    const isStrava = activity?.type === 'strava' || !!activity?.stravaId ||
                     /^strava-/i.test(String(activity?.id || ''));
    const sportRaw = String(activity?.sport || activity?.sport_type || activity?.sportType || 'bike').toLowerCase();
    const sport = sportRaw.includes('swim') ? 'swim' : sportRaw.includes('run') ? 'run' : 'bike';

    // Open the modal IMMEDIATELY with whatever data the activity already
    // carries. Enrich asynchronously. This matches the native dashboard
    // behaviour and stops the "+ Lactate does nothing" silent failure when
    // the Strava detail fetch errors out.
    const baseLaps = Array.isArray(activity.laps) ? activity.laps : [];
    const existing = Array.isArray(activity.results) ? activity.results : [];
    const initialResults = existing.length > 0 ? existing : lapsToResults(baseLaps, sport);
    const activityDate = activity.date || activity.startDate || activity.timestamp || new Date();
    const parsedDate = new Date(activityDate);
    const dateStr = (Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate).toISOString().slice(0, 16);
    const initialData = {
      ...(activity._id && !isStrava ? { _id: activity._id } : {}),
      sport,
      type: 'interval',
      category: activity.category || '',
      title: activity.titleManual || activity.title || activity.name || 'Untitled Training',
      customTitle: '',
      description: activity.description || '',
      date: dateStr,
      ...(isStrava && stravaNumericId ? { sourceStravaActivityId: stravaNumericId } : {}),
      specifics: { specific: '', weather: '', customSpecific: '', customWeather: '' },
      results: initialResults,
      ...(lapIndex != null ? { _initialSelectedLap: lapIndex + 1 } : {}),
    };
    setLactateFormModal({ isOpen: true, initialData });

    // Best-effort enrichment from Strava detail. Errors are soft (toast).
    if (isStrava && stravaNumericId && initialResults.length === 0) {
      try {
        const isCoachViewing = dashboardDataAthleteId && user && String(dashboardDataAthleteId) !== String(user._id);
        const integAthleteId = isCoachViewing ? String(dashboardDataAthleteId) : null;
        const data = await getStravaActivityDetail(stravaNumericId, integAthleteId);
        const detail = data.detail || {};
        const laps = Array.isArray(data.laps) ? data.laps : [];
        if (laps.length === 0) return;
        const detailSport = (detail.sport_type || detail.sport || sport).toLowerCase();
        const finalSport = detailSport.includes('swim') ? 'swim' : detailSport.includes('run') ? 'run' : 'bike';
        const enrichedDate = detail.start_date_local || detail.start_date || activityDate;
        const enrichedParsed = new Date(enrichedDate);
        const enrichedDateStr = (Number.isNaN(enrichedParsed.getTime()) ? parsedDate : enrichedParsed).toISOString().slice(0, 16);
        setLactateFormModal({
          isOpen: true,
          initialData: {
            ...initialData,
            sport: finalSport,
            category: data.category || initialData.category,
            title: data.titleManual || detail.name || initialData.title,
            description: data.description || detail.description || initialData.description,
            date: enrichedDateStr,
            sourceStravaActivityId: String(detail.id || detail.stravaId || stravaNumericId),
            results: lapsToResults(laps, finalSport),
          },
        });
      } catch (err) {
        setLactateFormError(
          "Couldn't load Strava laps automatically — you can add rows manually."
        );
      }
    }
  }, [dashboardDataAthleteId, user, lapsToResults]);

  const handleLactateFormSubmit = useCallback(async (formData) => {
    try {
      setLactateFormSubmitting(true);
      setLactateFormError(null);
      const targetId = dashboardDataAthleteId || user?._id;
      const payload = { ...formData, athleteId: targetId, coachId: user?._id };
      if (formData._id) {
        await updateTraining(formData._id, payload);
      } else {
        await addTraining(payload);
      }
      // Refresh dashboard data so the new training appears in the calendar
      try {
        const trainingsResult = await loadTrainings(targetId);
        loadCalendarData(targetId, trainingsResult?.regularTrainings, trainingsResult?.allTrainings);
      } catch (_) {}
      closeLactateForm();
    } catch (err) {
      setLactateFormError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'Save failed'
      );
    } finally {
      setLactateFormSubmitting(false);
    }
  }, [dashboardDataAthleteId, user, loadTrainings, loadCalendarData, closeLactateForm]);

  // ── Mobile/Native: render the redesigned native dashboard ──────────────────
  if (isCapacitorNative()) return (
    <>
      <NativeDashboardPage
        activities={calendarData}
        plannedWorkouts={plannedWorkouts}
        tests={tests}
        todayMetrics={todayMetrics}
        sparklineData={sparklineData}
        loading={calendarLoading && !hasCalendarData}
        metricsLoading={formMetricsLoading && !hasCalendarData}
        user={user}
        athleteId={dashboardDataAthleteId}
        onPlannedWorkoutChanged={({ type, planned, id }) => {
          if (type === 'updated' && planned?._id) {
            setPlannedWorkouts(prev => prev.map(p => p._id === planned._id ? planned : p));
          } else if (type === 'deleted' && id) {
            setPlannedWorkouts(prev => prev.filter(p => p._id !== id));
          }
        }}
        onPlanWorkout={(date) => {
          if (!isPremium) { gate('Workout Planning', 'pro'); return; }
          setPlanModal({ date, workout: null });
        }}
        stravaConnected={stravaConnected}
        onRequestStravaSync={performManualStravaSync}
        dayPlans={dayPlans}
        onDayPlanSave={handleDayPlanSave}
        onDayPlanDelete={handleDayPlanDelete}
        periods={periods}
        onPeriodSave={handlePeriodSave}
        onPeriodDelete={handlePeriodDelete}
        onTaperApplied={loadDashboardPlannedWorkouts}
      />
      {/* WorkoutPlanModal must render in the native branch too — the early
          return above used to skip it, so tapping "+ Plan" on the iOS
          Today card flipped `planModal` state but the modal itself never
          mounted. The full <WorkoutPlanModal/> below the non-native branch
          would only render in the web path. */}
      {planModal && (
        <WorkoutPlanModal
          date={planModal.date}
          workout={planModal.workout}
          athleteId={selectedAthleteId}
          onSave={handleDashboardPlanSave}
          onDelete={handleDashboardPlanDelete}
          onClose={() => setPlanModal(null)}
          onAddDayTheme={(iso, preset) => { setPlanModal(null); setQuickTheme({ date: iso, preset: preset || null }); }}
          onAddPeriod={(iso) => { setPlanModal(null); setQuickPeriod({ defaultDate: iso }); }}
        />
      )}
      {quickTheme && (
        <Suspense fallback={null}>
          <DayPlanEditSheet
            date={quickTheme.date}
            plan={dayPlans.find(p => p.date === quickTheme.date) || (quickTheme.preset ? { title: quickTheme.preset } : undefined)}
            onClose={() => setQuickTheme(null)}
            onSave={async (payload, dates) => {
              const list = Array.isArray(dates) && dates.length ? dates : [quickTheme.date];
              for (const d of list) { await handleDayPlanSave(d, payload); }
              setQuickTheme(null);
            }}
            onDelete={async () => { await handleDayPlanDelete(quickTheme.date); setQuickTheme(null); }}
          />
        </Suspense>
      )}
      {quickPeriod && (
        <Suspense fallback={null}>
          <PeriodEditSheet
            defaultDate={quickPeriod.defaultDate}
            onClose={() => setQuickPeriod(null)}
            onSave={async (payload) => { await handlePeriodSave(payload); setQuickPeriod(null); }}
            onDelete={null}
          />
        </Suspense>
      )}
    </>
  );

  if (error) return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 text-red-600 bg-red-50 rounded-lg shadow-lg"
    >
      {error}
    </motion.div>
  );

  if (!user) return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 text-gray-600"
    >
      Please log in to view this page
    </motion.div>
  );

  return (
    <>
    <UpgradeModal {...UpgradeModalProps} />
    <WelcomePaywallModal
      open={showWelcomePaywall}
      onClose={dismissWelcomePaywall}
      userName={user?.name}
    />
    <WhatsNewModal
      open={showWhatsNew}
      onClose={dismissWhatsNew}
      userName={user?.name}
    />
    <IOSLaunchModal
      open={showIOSLaunch}
      onClose={dismissIOSLaunch}
      userName={user?.name}
    />
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto w-full max-w-[1600px] px-2 sm:px-4 py-4 md:p-6"
    >
      {/* CoachDashboardHeader is now shown globally in Layout (CoachAthleteBar) */}
      {isCoachLikeRole &&
        selectedAthleteId &&
        String(selectedAthleteId) !== String(user?._id || '') &&
        pendingAthleteIds.includes(String(selectedAthleteId)) && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This athlete is waiting for confirmation. Profile and historical data will unlock after the athlete accepts the invitation.
          </div>
        )}

      {/* Coach with zero linked athletes — surface the first natural action
          (add an athlete) right above the empty dashboard widgets. Only
          renders once the count actually loaded (null = still fetching). */}
      {isCoachLikeRole && coachAthletesCount === 0 && (
        <EmptyStateCTA
          variant="banner"
          emoji="👥"
          title="Add your first athlete"
          body="Invite athletes by email — they'll show up here with status, tests, and training load. You can also plan workouts for each of them."
          ctaLabel="Open Athletes"
          to="/athletes"
          className="mb-4"
        />
      )}
      
      {showAthleteEmptyWelcome && (
        <DashboardEmptyWelcome
          user={user}
          stravaConnected={stravaConnected}
          onConnectStrava={handleConnectStrava}
          hasTests={Array.isArray(tests) && tests.length > 0}
        />
      )}

      {/* Strava Connection Banner */}
      {!isTestingRole && showStravaBanner && !stravaConnected && !isCoachViewingOtherAthlete && (user?.role === 'athlete' || user?.role === 'coach') && !showAthleteEmptyWelcome && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-gradient-to-r from-orange-50 to-orange-100 border-2 border-orange-300 rounded-xl p-4 sm:p-6 shadow-lg"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-orange-200 rounded-full flex items-center justify-center flex-shrink-0">
                  <img src="/icon/strava.png" alt="Strava" className="w-6 h-6" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Connect Strava to Unlock More Features</h3>
              </div>
              <p className="text-sm sm:text-base text-gray-700 mb-3">
                Connect your Strava account to automatically sync your training activities and get personalized insights!
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="text-orange-600 font-bold">✓</span>
                  <span>Auto-import all your activities</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-orange-600 font-bold">✓</span>
                  <span>Smart test recommendations</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-orange-600 font-bold">✓</span>
                  <span>Track progress over time</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-orange-600 font-bold">✓</span>
                  <span>Sync profile picture</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button
                onClick={handleConnectStrava}
                className="px-6 py-3 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 transition-colors shadow-md hover:shadow-lg whitespace-nowrap"
              >
                Connect Strava
              </button>
              <button
                onClick={handleDismissBanner}
                className="px-4 py-3 bg-white text-gray-700 font-medium rounded-lg hover:bg-gray-50 border border-gray-300 transition-colors whitespace-nowrap"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </motion.div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {!isTestingRole && (
          <>
        {!showAthleteEmptyWelcome && (
          <>
        {/* If the user has zero activities (no Strava, no FIT, no manual,
            no plan), nudge them toward the Workout Planner — otherwise the
            calendar looks unhelpfully empty and they don't know it can be
            planned ahead. Restricted to the user's own dashboard so coaches
            looking at athletes don't see it. */}
        {!isCoachLikeRole && showCalendarEmpty && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="lg:col-span-5 md:col-span-2"
          >
            <EmptyStateCTA
              variant="banner"
              emoji="📅"
              title="Plan your first workout"
              body="Build a structured session — warm-up, intervals with target zones, cooldown — and drop it onto today or any upcoming day."
              ctaLabel="Open Planner"
              to="/workout-planner"
              className="mb-4"
            />
          </motion.div>
        )}

        {/* Weekly Calendar — at the top */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-5 md:col-span-2"
        >
          {showCalendarSkeleton && (
            <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm" aria-busy="true">
              <div className="mb-4 flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-9 w-28 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {Array.from({ length: 7 }).map((_, idx) => (
                  <div key={idx} className="rounded-xl border border-gray-100 p-3">
                    <Skeleton className="mb-3 h-3 w-16" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ))}
              </div>
            </div>
          )}
          {(calendarError || showCalendarEmpty) && (
            <div className={`mb-3 rounded-xl border px-4 py-3 text-sm shadow-sm ${
              calendarError ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-white text-gray-600'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-2">
                  <div>
                    <div className="font-semibold">
                      {calendarError ? 'Calendar sync needs attention' : 'No calendar activities yet'}
                    </div>
                    <div className="text-xs mt-0.5">
                      {calendarError || (
                        isCoachViewingOtherAthlete
                          ? 'This athlete has no synced activities yet. They can connect Strava or upload FIT files from their account.'
                          : isCoachLikeRole
                            ? 'Select an athlete above to view their training calendar, or connect Strava to sync your own activities.'
                            : stravaConnected
                              ? 'Strava is connected. Try refreshing the calendar or syncing new activities.'
                              : 'Connect Strava or upload a FIT file to fill the dashboard calendar.'
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {calendarError && (
                    <button
                      type="button"
                      onClick={async () => {
                        const trainingsResult = await loadTrainings(dashboardDataAthleteId);
                        loadCalendarData(dashboardDataAthleteId, trainingsResult?.regularTrainings, trainingsResult?.allTrainings);
                      }}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Retry
                    </button>
                  )}
                  {!stravaConnected && !isCoachViewingOtherAthlete && (
                    <button
                      type="button"
                      onClick={handleConnectStrava}
                      className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700"
                    >
                      Connect Strava
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          {!showCalendarSkeleton && (
          <WeeklyCalendar
            key={`wc-${dashboardDataAthleteId}`}
            selectedAthleteId={dashboardDataAthleteId}
            activities={calendarData || []}
            activitiesLoading={calendarLoading && !hasCalendarData}
            onSelectActivity={(activity) => {
              if (!activity) return;
              // Determine kind + id (same logic as NativeTrainingPage / detectActivityKind)
              let kind = 'regular';
              let id = String(activity._id || activity.id || '');
              if (activity.type === 'fit' || activity.source === 'fit' || id.startsWith('fit-')) {
                kind = 'fit';
                id = id.replace(/^fit-/, '');
              } else if (activity.type === 'strava' || activity.source === 'strava' || activity.stravaId || id.startsWith('strava-')) {
                kind = 'strava';
                id = String(activity.stravaId || id.replace(/^strava-/, ''));
              } else if (activity.type === 'regular') {
                kind = 'regular';
                id = id.replace(/^regular-/, '');
              }
              if (!id) return;
              const qs = dashboardDataAthleteId ? `?athleteId=${dashboardDataAthleteId}` : '';
              navigate(`/training-calendar/${encodeURIComponent(`${kind}-${id}`)}${qs}`);
            }}
            onActivityUpdate={(updatedActivity) => {
              setCalendarData(prev => {
                const updated = prev.map(act => {
                  if (updatedActivity.type === 'fit' && act.type === 'fit' && act._id === updatedActivity._id) {
                    return { ...act, ...updatedActivity, title: updatedActivity.title || updatedActivity.titleManual || act.title };
                  } else if (updatedActivity.type === 'strava' && act.type === 'strava' &&
                             (act.id === updatedActivity.id || act.stravaId === updatedActivity.stravaId || act.stravaId === updatedActivity.id)) {
                    return { ...act, ...updatedActivity, title: updatedActivity.title || updatedActivity.titleManual || updatedActivity.name || act.title };
                  }
                  return act;
                });
                console.log('[DashboardPage] Updated calendarData after activity update:', updatedActivity);
                return updated;
              });
              const cacheKey = `calendarData_${dashboardDataAthleteId}`;
              const cacheTimestampKey = `calendarData_timestamp_${dashboardDataAthleteId}`;
              localStorage.removeItem(cacheKey);
              localStorage.removeItem(cacheTimestampKey);
            }}
            onActivityDeleted={({ type, id }) => {
              // Drop the deleted activity from the local feed so the
              // calendar updates without a full reload. Also bust the
              // cache so the next dashboard mount doesn't resurrect it.
              setCalendarData(prev => prev.filter(act => {
                if (type === 'strava') {
                  const matchById = String(act.id || '').replace(/^strava-/, '') === String(id);
                  const matchByStravaId = String(act.stravaId || '') === String(id);
                  return !(act.type === 'strava' && (matchById || matchByStravaId));
                }
                return true;
              }));
              const cacheKey = `calendarData_${dashboardDataAthleteId}`;
              const cacheTimestampKey = `calendarData_timestamp_${dashboardDataAthleteId}`;
              localStorage.removeItem(cacheKey);
              localStorage.removeItem(cacheTimestampKey);
            }}
            onAddCompletedWorkout={() => {
              // Bust the cache so the calendar reloads on next render
              const cacheKey = `calendarData_${dashboardDataAthleteId}`;
              const cacheTimestampKey = `calendarData_timestamp_${dashboardDataAthleteId}`;
              localStorage.removeItem(cacheKey);
              localStorage.removeItem(cacheTimestampKey);
            }}
            plannedWorkouts={plannedWorkouts}
            dayPlans={dayPlans}
            onDayPlanSave={handleDayPlanSave}
            onDayPlanDelete={handleDayPlanDelete}
            periods={periods}
            onPlanWorkout={(date) => {
              if (!isPremium) { gate('Workout Planning', 'pro'); return; }
              setPlanModal({ date, workout: null });
            }}
            onSelectPlannedWorkout={(pw) => {
              if (!isPremium) { gate('Workout Planning', 'pro'); return; }
              // pw.date may be a full ISO datetime ('2026-05-04T00:00:00.000Z')
              // or a date-only 'YYYY-MM-DD' — slice to date-only first.
              const dateOnly = String(pw.date || '').slice(0, 10);
              const d = dateOnly ? new Date(`${dateOnly}T12:00:00`) : new Date();
              setPlanModal({ date: isNaN(d.getTime()) ? new Date() : d, workout: pw });
            }}
            onStartWorkout={(pw) => navigate(`/workout-execution/${pw._id}${selectedAthleteId ? `?athleteId=${selectedAthleteId}` : ''}`)}
            onCopyPlannedWorkout={handleDashboardCopyPlan}
            onDeletePlannedWorkout={handleDashboardPlanDelete}
            onAddTraining={() => setIsTrainingFormOpen(true)}
            onAddLactate={handleDashboardAddLactate}
            onPlannedSaved={(saved) => setPlannedWorkouts(prev => upsertPlannedWorkoutList(prev, saved))}
          />
          )}
        </motion.div>

        {/* Optional insight / race / wellness cards — single row so empty sections don't add grid gaps */}
        {dashboardDataAthleteId && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.23 }}
            className="lg:col-span-5 md:col-span-2 flex flex-col gap-4"
          >
            <TrainingInsightsCard
              key={`tic-${dashboardDataAthleteId}`}
              athleteId={dashboardDataAthleteId}
              todayMetrics={todayMetrics}
              plannedWorkouts={plannedWorkouts}
              activities={calendarData}
              tests={tests}
              sparklineData={sparklineData}
              userProfile={viewedAthleteProfile || user}
              loading={dashboardFitnessLoading || formMetricsLoading}
            />
            <RaceCountdownCard
              key={`rcc-${dashboardDataAthleteId}`}
              athleteId={dashboardDataAthleteId}
              currentCTL={todayMetrics?.fitness}
              currentForm={todayMetrics?.form}
              plannedWorkouts={plannedWorkouts}
              onTaperApplied={loadDashboardPlannedWorkouts}
            />
            <PostRaceFeedbackCard
              athleteId={dashboardDataAthleteId}
              focusRaceId={raceFeedbackFocusId}
              onSubmitted={() => setRaceFeedbackFocusId(null)}
            />
            <WellnessCard athleteId={dashboardDataAthleteId} />
          </motion.div>
        )}

        {/* Form & Fitness Chart + Weekly Training Load — side by side, equal height */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="lg:col-span-5 md:col-span-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 items-stretch"
        >
          <div className="lg:col-span-3 md:col-span-2 flex flex-col min-h-0">
            {isPremium ? (
              <FormFitnessChart
                key={`ffc-${dashboardDataAthleteId}`}
                athleteId={dashboardDataAthleteId}
                activities={calendarData}
                userProfile={viewedAthleteProfile || user}
                activitiesLoading={dashboardFitnessLoading}
                headlineMetrics={todayMetrics}
              />
            ) : (
              <PremiumLockedCard
                title="Form & Fitness"
                description="Track your fitness, fatigue and form trends over time."
                onUpgrade={() => gate('Form & Fitness', 'pro')}
              />
            )}
          </div>
          <div className="lg:col-span-2 md:col-span-2 flex flex-col min-h-0">
            {isPremium ? (
              <WeeklyTrainingLoad
                key={`wtl-${dashboardDataAthleteId}`}
                athleteId={dashboardDataAthleteId}
                activities={calendarData}
                userProfile={viewedAthleteProfile || user}
                activitiesLoading={dashboardFitnessLoading}
              />
            ) : (
              <PremiumLockedCard
                title="Weekly Training Load"
                description="See your weekly TSS trend and training consistency."
                onUpgrade={() => gate('Weekly Training Load', 'pro')}
              />
            )}
          </div>
        </motion.div>

        {/* Intensity distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.29 }}
          className="lg:col-span-3 md:col-span-2 flex flex-col self-start"
        >
          {isPremium ? (
            <IntensityDistributionChart athleteId={dashboardDataAthleteId} activities={calendarData || []} />
          ) : (
            <PremiumLockedCard
              title="Intensity Distribution"
              description="Analyse your training zone distribution across all sessions."
              onUpgrade={() => gate('Intensity Distribution', 'pro')}
            />
          )}
        </motion.div>

        {/* Zone Distribution — sits next to Intensity distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32 }}
          className="lg:col-span-2 md:col-span-2 flex flex-col self-start"
        >
          {isPremium ? (
            <ZoneDistributionChart key={`zdc-${dashboardDataAthleteId}`} selectedAthleteId={dashboardDataAthleteId} />
          ) : (
            <PremiumLockedCard
              title="Zone Distribution"
              description="See how your training time is split across HR and power zones."
              onUpgrade={() => gate('Zone Distribution', 'pro')}
            />
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-3 md:col-span-2 flex flex-col"
        >
          {isPremium ? (
            <TrainingLoadHeatmap
              calendarData={calendarData}
              trainings={recentTrainings}
            />
          ) : (
            <PremiumLockedCard
              title="Training Load Heatmap"
              description="Visualise your yearly training distribution at a glance."
              onUpgrade={() => gate('Training Load Heatmap', 'pro')}
            />
          )}
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2 md:col-span-2"
        >
          {isPremium ? (
            <SpiderChart
              key={`spider-${dashboardDataAthleteId}`}
              trainings={recentTrainings}
              selectedSport={selectedSport}
              setSelectedSport={setSelectedSport}
              calendarData={calendarData}
              athleteId={dashboardDataAthleteId}
            />
          ) : (
            <PremiumLockedCard
              title="Performance Profile"
              description="Unlock the radar chart to see your power / pace profile across sprint, VO₂max, threshold and endurance efforts."
              onUpgrade={() => gate('Performance Profile (Spider Chart)', 'pro')}
            />
          )}
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-3 md:col-span-2 flex flex-col h-full"
        >
          <TrainingStats
            key={`ts-${dashboardDataAthleteId}`}
            trainings={exportedTrainings}
            selectedSport={selectedSport}
            onSportChange={setSelectedSport}
            selectedTitle={selectedTitle}
            setSelectedTitle={setSelectedTitle}
            selectedTrainingId={selectedTraining}
            setSelectedTrainingId={setSelectedTraining}
            user={user}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="lg:col-span-2 md:col-span-2 flex flex-col h-full"
        >
          {isPremium ? (
            <TrainingGraph
              key={`tg-${dashboardDataAthleteId}`}
              trainingList={exportedTrainings}
              selectedSport={selectedSport}
              setSelectedSport={setSelectedSport}
              selectedTitle={selectedTitle}
              setSelectedTitle={setSelectedTitle}
              selectedTraining={selectedTraining}
              setSelectedTraining={setSelectedTraining}
            />
          ) : (
            <PremiumLockedCard
              title="Training Graph"
              description="Upgrade to Pro to view power, pace and heart rate trends across your training sessions."
              onUpgrade={() => gate('Training Graph', 'pro')}
            />
          )}
        </motion.div>
          </>
        )}

        {showAthleteEmptyWelcome && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-5 md:col-span-2 rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center"
          >
            <p className="text-sm text-slate-600 max-w-lg mx-auto">
              Form &amp; Fitness, weekly load, calendar, and training charts will appear here after you add activities (upload FIT or sync from Strava).
            </p>
          </motion.div>
        )}
          </>
        )}

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="lg:col-span-5 md:col-span-2 overflow-visible min-h-0"
        >
          <div className="space-y-6 overflow-visible">
            {dashboardTests.length > 0 ? (
              <>
                <DateSelector
                  tests={dashboardTests}
                  onSelectTest={handleDateSelectorTestSelect}
                  selectedTestId={currentTest?._id}
                />
                {currentTest && currentTest.results && (
                  <>
                    <LactateCurveCalculator mockData={currentTest} athleteId={dashboardDataAthleteId} />
                  </>
                )}
              </>
            ) : (
              <div className="text-center py-8 px-4 rounded-xl border border-white/15 bg-white/10 backdrop-blur-md text-lighterText">
                <p className="text-sm font-semibold text-text">No lactate tests yet</p>
                <p className="mt-1 text-sm text-lighterText">
                  {showAthleteEmptyWelcome
                    ? 'When you log a test under Testing, charts and comparisons show up here.'
                    : 'No tests available for this athlete.'}
                </p>
                {showAthleteEmptyWelcome && (
                  <button
                    type="button"
                    onClick={() => navigate('/testing')}
                    className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-colors"
                  >
                    Open Testing
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>

    {planModal && (
      <WorkoutPlanModal
        date={planModal.date}
        workout={planModal.workout}
        athleteId={selectedAthleteId}
        onSave={handleDashboardPlanSave}
        onDelete={handleDashboardPlanDelete}
        onClose={() => setPlanModal(null)}
        onAddDayTheme={(iso, preset) => { setPlanModal(null); setQuickTheme({ date: iso, preset: preset || null }); }}
        onAddPeriod={(iso) => { setPlanModal(null); setQuickPeriod({ defaultDate: iso }); }}
      />
    )}
    {quickTheme && (
      <DayPlanEditSheet
        date={quickTheme.date}
        plan={dayPlans.find(p => p.date === quickTheme.date) || (quickTheme.preset ? { title: quickTheme.preset } : undefined)}
        onClose={() => setQuickTheme(null)}
        onSave={async (payload, dates) => {
          const list = Array.isArray(dates) && dates.length ? dates : [quickTheme.date];
          for (const d of list) { await handleDayPlanSave(d, payload); }
          setQuickTheme(null);
        }}
        onDelete={async () => { await handleDayPlanDelete(quickTheme.date); setQuickTheme(null); }}
      />
    )}
    {quickPeriod && (
      <PeriodEditSheet
        defaultDate={quickPeriod.defaultDate}
        onClose={() => setQuickPeriod(null)}
        onSave={async (payload) => { await handlePeriodSave(payload); setQuickPeriod(null); }}
        onDelete={null}
      />
    )}

    <AnimatePresence>
      {isTrainingFormOpen && ReactDOM.createPortal(
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
            <TrainingForm
              onClose={() => setIsTrainingFormOpen(false)}
              onSubmit={handleDashboardAddTraining}
            />
          </motion.div>
        </motion.div>,
        document.getElementById('app-modal-root') || document.body
      )}
    </AnimatePresence>

    {/* Error banner for + Lactate failures (no laps, network, etc.) */}
    {lactateFormError && (
      <div
        role="alert"
        className="fixed left-4 right-4 bottom-4 z-[9998] flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-lg"
      >
        <span className="flex-1">{lactateFormError}</span>
        <button
          type="button"
          onClick={() => setLactateFormError(null)}
          className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-900 hover:bg-red-100"
        >
          Dismiss
        </button>
      </div>
    )}

    {/* + Lactate modal — mirrors FitAnalysisPage's pattern: plain
        conditional render, no AnimatePresence + portal combo. The earlier
        portal+AnimatePresence wrapper had a render race where the modal
        sometimes failed to mount when the parent ActivityFullModal was
        closing simultaneously. */}
    {lactateFormModal.isOpen && lactateFormModal.initialData && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ zIndex: 99998 }}
      >
        <div className="w-full sm:max-w-2xl">
          <TrainingForm
            key={lactateFormModal.initialData.sourceStravaActivityId || lactateFormModal.initialData._id || 'dash-lac'}
            onClose={closeLactateForm}
            onSubmit={handleLactateFormSubmit}
            initialData={lactateFormModal.initialData}
            isEditing={false}
            isLoading={lactateFormSubmitting}
            initialSelectedLap={lactateFormModal.initialData?._initialSelectedLap ?? null}
          />
        </div>
      </motion.div>
    )}
    </>
  );
}
