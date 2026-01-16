import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from '../context/AuthProvider';
import api from '../services/api';
import SportsSelector from "../components/Header/SportsSelector";
import PreviousTestingComponent from "../components/Testing-page/PreviousTestingComponent";
import NewTestingComponent from "../components/Testing-page/NewTestingComponent";
import NotificationBadge from "../components/Testing-page/NotificationBadge";
import AthleteSelector from "../components/AthleteSelector";
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import TrainingGlossary from '../components/DashboardPage/TrainingGlossary';
import { listExternalActivities } from '../services/api';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { XMarkIcon } from '@heroicons/react/24/outline';

const TestingPage = () => {
  const { athleteId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const [selectedAthleteId, setSelectedAthleteId] = useState(() => {
    if (athleteId) return athleteId;
    if (user?.role === 'coach') {
      try {
        const globalId = localStorage.getItem('global_selectedAthleteId');
        if (globalId) return globalId;
      } catch {
        // ignore storage errors
      }
      return user?._id || null;
    }
    return null;
  });
  const [showNewTesting, setShowNewTesting] = useState(false);
  const [selectedSport, setSelectedSport] = useState("all");
  const [tests, setTests] = useState([]);
  // Page-level loading starts as false; individual blocks/components show their own spinners.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [athleteProfile, setAthleteProfile] = useState(null);
  const [externalActivities, setExternalActivities] = useState([]);
  const [bikePowerMetrics, setBikePowerMetrics] = useState(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(true);
  const navigate = useNavigate();
  
  // Get testId from URL
  const testIdFromUrl = searchParams.get('testId');

  const sports = [
    { id: "all", name: "All Sports" },
    { id: "run", name: "Running" },
    { id: "bike", name: "Cycling" },
    { id: "swim", name: "Swimming" },
  ];

  const loadTests = useCallback(async (targetId) => {
    try {
      setLoading(true);
      setError(null);
      // For tester role, use any ID (backend will return all tests)
      const testId = user?.role === 'tester' ? user._id : targetId;
      const response = await api.get(`/test/list/${testId}`);
      setTests(response.data);
    } catch (err) {
      console.error('Error loading tests:', err);
      setError('Failed to load tests');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Synchronizace selectedAthleteId s URL parametrem
  useEffect(() => {
    if (athleteId) {
      setSelectedAthleteId(athleteId);
    } else if (user?.role === 'coach' && !selectedAthleteId) {
      // Pokud je trenér a není vybraný atlet, nastav sebe jako výchozí
      setSelectedAthleteId(user._id);
    }
  }, [athleteId, user, selectedAthleteId]);

  // Načtení dat při prvním načtení stránky nebo změně atleta
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
      return;
    }

    const targetId = selectedAthleteId || user._id;
    loadTests(targetId);
  }, [user, isAuthenticated, navigate, selectedAthleteId, loadTests]);
  
  // Listen for URL changes (including testId parameter)
  useEffect(() => {
    const handlePopState = () => {
      // Force re-render when URL changes
      const newParams = new URLSearchParams(window.location.search);
      setSearchParams(newParams);
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load zones/profile + Strava/FIT summary data for recommendations
  useEffect(() => {
    const loadAdvisor = async () => {
      if (!isAuthenticated || !user) return;
      const targetId = selectedAthleteId || user._id;
      if (!targetId) return;
      try {
        setAdvisorLoading(true);

        // 1) Athlete profile (zones + units)
        if (user.role === 'coach' && String(targetId) !== String(user._id)) {
          const { data } = await api.get(`/user/athlete/${targetId}/profile`);
          setAthleteProfile(data);
        } else {
          const { data } = await api.get('/user/profile');
          setAthleteProfile(data);
        }

        // 2) External activities (Strava/Garmin normalized list)
        const acts = await listExternalActivities(user.role === 'coach' ? { athleteId: targetId } : {});
        setExternalActivities(Array.isArray(acts) ? acts : []);

        // 3) Bike power metrics (includes Strava streams when possible)
        const params = new URLSearchParams();
        if (user.role === 'coach') params.set('athleteId', targetId);
        params.set('comparePeriod', '90days');
        const resp = await api.get(`/api/fit/power-metrics?${params.toString()}`);
        setBikePowerMetrics(resp.data || null);
      } catch (e) {
        console.warn('Failed to load testing advisor data:', e);
        setBikePowerMetrics(null);
      } finally {
        setAdvisorLoading(false);
      }
    };

    loadAdvisor();
  }, [user, isAuthenticated, selectedAthleteId]);

  // Persist "recommendations panel" visibility per athlete
  useEffect(() => {
    const targetId = selectedAthleteId || user?._id;
    if (!targetId) return;
    const key = `testing_recommendations_open_${targetId}`;
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      setShowRecommendations(saved === 'true');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAthleteId, user?._id]);

  useEffect(() => {
    const targetId = selectedAthleteId || user?._id;
    if (!targetId) return;
    const key = `testing_recommendations_open_${targetId}`;
    localStorage.setItem(key, String(showRecommendations));
  }, [showRecommendations, selectedAthleteId, user?._id]);

  // If user opens "New testing", make sure recommendations panel is visible above it
  useEffect(() => {
    if (showNewTesting) {
      setShowRecommendations(true);
    }
  }, [showNewTesting]);

  const formatDateShort = (dateLike) => {
    if (!dateLike) return '';
    try {
      return new Date(dateLike).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch {
      return '';
    }
  };

  const daysSince = (dateLike) => {
    if (!dateLike) return null;
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    const diff = Date.now() - d.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const formatPace = (secondsPerKm) => {
    if (!secondsPerKm || secondsPerKm <= 0) return '-';
    const m = Math.floor(secondsPerKm / 60);
    const s = Math.round(secondsPerKm % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Simple LT2 estimate from test: interpolate power/pace at 4.0 mmol/L if possible
  const estimateLt2FromTest = (test) => {
    if (!test?.results || test.results.length < 3) return null;
    const sport = test.sport;
    const isPaceSport = sport === 'run' || sport === 'swim';
    const baseLactate = Number(test.baseLactate || 1.0);
    const targetLac = 4.0;

    const pts = test.results
      .map(r => ({
        x: Number(String(r.power ?? '').replace(',', '.')),
        y: Number(String(r.lactate ?? '').replace(',', '.')),
        hr: Number(String(r.heartRate ?? '').replace(',', '.'))
      }))
      .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

    if (pts.length < 3) return null;

    // sort: bike ascending power; run/swim descending pace-seconds (slow->fast in seconds means higher seconds is slower)
    pts.sort((a, b) => isPaceSport ? (b.x - a.x) : (a.x - b.x));

    // Find segment crossing target lactate
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if ((a.y <= targetLac && b.y >= targetLac) || (a.y >= targetLac && b.y <= targetLac)) {
        const t = (targetLac - a.y) / (b.y - a.y || 1);
        const x = a.x + t * (b.x - a.x);
        const hr = (Number.isFinite(a.hr) && Number.isFinite(b.hr)) ? (a.hr + t * (b.hr - a.hr)) : null;
        return { x, hr, lac: targetLac };
      }
    }

    // Fallback: D-max-ish fallback: use point where lactate is ~ base*3 (classic), otherwise max x
    const target2 = baseLactate * 3.0;
    const closest = pts.reduce((best, p) => {
      const d = Math.abs(p.y - target2);
      if (!best || d < best.d) return { p, d };
      return best;
    }, null);
    if (closest?.p) return { x: closest.p.x, hr: closest.p.hr, lac: closest.p.y };

    return { x: pts[pts.length - 1].x, hr: pts[pts.length - 1].hr, lac: pts[pts.length - 1].y };
  };

  const latestBySport = useMemo(() => {
    const by = { bike: null, run: null, swim: null };
    (tests || []).forEach(t => {
      const s = t?.sport;
      if (!s) return;
      const d = new Date(t.date || t.createdAt || t.updatedAt);
      if (Number.isNaN(d.getTime())) return;
      if (!by[s] || d > new Date(by[s].date || by[s].createdAt || by[s].updatedAt)) by[s] = t;
    });
    return by;
  }, [tests]);

  const runRecentPerf = useMemo(() => {
    // Estimate threshold pace from fastest recent longish run avg speed
    const runs = (externalActivities || []).filter(a => (a?.sport || '').toLowerCase().includes('run'));
    const recent = runs
      .filter(a => (a?.totalElapsedTime || a?.movingTime || 0) >= 20 * 60)
      .slice()
      .sort((a, b) => new Date(b.date || b.startDate || 0) - new Date(a.date || a.startDate || 0));
    const best = recent.reduce((acc, a) => {
      const v = Number(a.avgSpeed || a.averageSpeed || 0);
      if (!v || v <= 0) return acc;
      // keep fastest avg speed among last 90d list (acts are already limited by DB, but ok)
      if (!acc || v > acc.avgSpeed) return { avgSpeed: v, date: a.date || a.startDate, id: a.id };
      return acc;
    }, null);
    if (!best) return null;
    const pace = Math.round(1000 / best.avgSpeed); // sec/km
    const estThreshold = Math.round(pace * 1.05); // threshold pace slightly slower than fastest sustained avg
    return { bestAvgPaceSecPerKm: pace, estThresholdPaceSecPerKm: estThreshold, date: best.date };
  }, [externalActivities]);

  const bikeFtpEstimate = useMemo(() => {
    const p20 = bikePowerMetrics?.personalRecords?.threshold20min || bikePowerMetrics?.allTime?.threshold20min || null;
    if (!p20 || p20 <= 0) return null;
    return Math.round(p20 * 0.95);
  }, [bikePowerMetrics]);

  const advisor = useMemo(() => {
    const zones = athleteProfile?.powerZones || {};

    // Bike recommendation
    const bikeLt2 = zones?.cycling?.lt2 || null;
    const bikeFtp = bikeFtpEstimate || bikeLt2 || null;
    const bikeStart = bikeFtp ? Math.max(80, Math.round((bikeFtp * 0.55) / 10) * 10) : null;
    const bikeEnd = bikeFtp ? Math.round((bikeFtp * 1.15) / 10) * 10 : null;
    const bikeStep = 25;
    const bikeStageMin = 4;
    const bikeRestMin = 1;
    const bikeStages = bikeStart && bikeEnd ? Math.max(1, Math.round((bikeEnd - bikeStart) / bikeStep) + 1) : null;

    // Run recommendation
    const runLt2 = zones?.running?.lt2 || null; // seconds per km
    const runThr = runLt2 || runRecentPerf?.estThresholdPaceSecPerKm || null;
    const runStart = runThr ? (runThr + 75) : null;
    const runEnd = runThr ? Math.max(120, runThr - 20) : null;
    const runStep = 15; // sec/km
    const runStageMin = 3;
    const runRestMin = 1;

    // Freshness + drift
    const lastBikeTest = latestBySport.bike;
    const lastRunTest = latestBySport.run;
    const bikeTestDays = daysSince(lastBikeTest?.date);
    const runTestDays = daysSince(lastRunTest?.date);
    const bikeLt2FromTest = estimateLt2FromTest(lastBikeTest)?.x || null;
    const runLt2FromTest = estimateLt2FromTest(lastRunTest)?.x || null;

    const bikeZoneShift = (bikeLt2 && bikeLt2FromTest)
      ? (Math.abs(bikeLt2 - bikeLt2FromTest) / bikeLt2) > 0.05
      : (bikeLt2 && bikeFtpEstimate) ? (Math.abs(bikeLt2 - bikeFtpEstimate) / bikeLt2) > 0.05 : false;

    const runZoneShift = (runLt2 && runLt2FromTest)
      ? (Math.abs(runLt2 - runLt2FromTest) / runLt2) > 0.05
      : (runLt2 && runRecentPerf?.estThresholdPaceSecPerKm) ? (Math.abs(runLt2 - runRecentPerf.estThresholdPaceSecPerKm) / runLt2) > 0.05 : false;

    return {
      bike: {
        ftp: bikeFtp,
        start: bikeStart,
        end: bikeEnd,
        step: bikeStep,
        stageMin: bikeStageMin,
        restMin: bikeRestMin,
        stages: bikeStages,
        lastTest: lastBikeTest,
        lastTestDays: bikeTestDays,
        lt2FromLastTest: bikeLt2FromTest,
        zoneShift: bikeZoneShift
      },
      run: {
        thresholdPaceSecPerKm: runThr,
        startPaceSecPerKm: runStart,
        endPaceSecPerKm: runEnd,
        stepSecPerKm: runStep,
        stageMin: runStageMin,
        restMin: runRestMin,
        lastTest: lastRunTest,
        lastTestDays: runTestDays,
        lt2FromLastTest: runLt2FromTest,
        zoneShift: runZoneShift
      }
    };
  }, [athleteProfile, latestBySport, bikeFtpEstimate, runRecentPerf]);

  const lt2History = useMemo(() => {
    const bySport = { bike: [], run: [] };
    (tests || []).forEach(t => {
      const s = t?.sport;
      if (s !== 'bike' && s !== 'run') return;
      const d = t.date || t.createdAt;
      const lt2 = estimateLt2FromTest(t)?.x;
      if (!lt2) return;
      bySport[s].push({ date: d, lt2 });
    });
    bySport.bike.sort((a, b) => new Date(a.date) - new Date(b.date));
    bySport.run.sort((a, b) => new Date(a.date) - new Date(b.date));
    return bySport;
  }, [tests]);

  // Posluchač pro změnu atleta z menu
  useEffect(() => {
    const handleAthleteChange = (event) => {
      const { athleteId } = event.detail;
      setSelectedAthleteId(athleteId);
      navigate(`/testing/${athleteId}`, { replace: true });
    };

    window.addEventListener('athleteChanged', handleAthleteChange);
    return () => window.removeEventListener('athleteChanged', handleAthleteChange);
  }, [navigate]);

  const handleAddTest = async (newTest) => {
    try {
      const processedTest = {
        ...newTest,
        athleteId: selectedAthleteId || user._id,
        results: newTest.results.map(result => ({
          ...result,
          power: Number(result.power) || 0,
          heartRate: Number(result.heartRate) || 0,
          lactate: Number(result.lactate) || 0,
          glucose: Number(result.glucose) || 0,
          RPE: Number(result.RPE) || 0
        }))
      };

      const response = await api.post('/test', processedTest);
      setTests(prev => [...prev, response.data]);
      setShowNewTesting(false);
    } catch (err) {
      console.error('Error adding test:', err);
      setError('Failed to add test. Please try again.');
    }
  };

  const handleAthleteChange = (newAthleteId) => {
    setSelectedAthleteId(newAthleteId);
    navigate(`/testing/${newAthleteId}`, { replace: true });
  };

  if (error) return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 text-red-600 bg-red-50 rounded-lg shadow-lg"
    >
      {error}
    </motion.div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-[1600px] mx-auto md:p-6 min-w-0"
    >
      {user?.role === 'coach' && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-2 sm:mb-4 md:mt-6"
        >
          <AthleteSelector
            selectedAthleteId={selectedAthleteId}
            onAthleteChange={handleAthleteChange}
            user={user}
          />
        </motion.div>
      )}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-4 mb-3 sm:mb-6">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full sm:w-auto sm:flex-1 min-w-0"
        >
          <SportsSelector
            sports={sports}
            selectedSport={selectedSport}
            onSportChange={setSelectedSport}
          />
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full sm:w-auto min-w-0 flex items-center gap-2"
        >
          <button
            onClick={() => setShowGlossary(true)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Show glossary"
            title="Training Glossary"
          >
            <InformationCircleIcon className="w-5 h-5 text-gray-500" />
          </button>
          <NotificationBadge
            isActive={showNewTesting}
            onToggle={() => setShowNewTesting((prev) => !prev)}
          />
        </motion.div>
      </div>

      {/* Lactate Test Advisor */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="w-full mb-3 sm:mb-6"
      >
        {!showRecommendations ? (
          <div className="flex items-center justify-between bg-white rounded-2xl shadow-lg border border-gray-100 p-3 sm:p-4">
            <div className="text-sm font-semibold text-gray-900">Recommendations hidden</div>
            <button
              onClick={() => setShowRecommendations(true)}
              className="px-3 py-2 text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-200 transition-colors"
            >
              Show recommendations
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-3 sm:p-4 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base md:text-lg font-semibold text-gray-900">
                  Lactate Test Recommendations
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                  Based on your saved zones + recent Strava/FIT performance (when available).
                </p>
              </div>
              <div className="flex items-center gap-2">
                {advisorLoading && (
                  <div className="text-xs text-gray-500 whitespace-nowrap">Loading…</div>
                )}
                <button
                  onClick={() => setShowRecommendations(false)}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  aria-label="Hide recommendations"
                  title="Hide recommendations"
                >
                  <XMarkIcon className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mt-3 sm:mt-4">
            {/* Bike */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-900 text-sm sm:text-base">Bike</div>
                <div className="text-xs text-gray-500">
                  Last test: {advisor.bike.lastTest?.date ? `${formatDateShort(advisor.bike.lastTest.date)} (${advisor.bike.lastTestDays ?? '-'}d)` : '—'}
                </div>
              </div>
              <div className="mt-2 text-xs sm:text-sm text-gray-700 space-y-1">
                <div>
                  <span className="font-semibold">Protocol:</span>{' '}
                  {advisor.bike.start && advisor.bike.end
                    ? `${advisor.bike.start}→${advisor.bike.end}W (+${advisor.bike.step}W), ${advisor.bike.stageMin}min stage + ${advisor.bike.restMin}min rest`
                    : 'Connect Strava/FIT power data to auto-suggest start/end.'}
                </div>
                <div>
                  <span className="font-semibold">Duration:</span>{' '}
                  {advisor.bike.stages
                    ? `${advisor.bike.stages} stages (~${advisor.bike.stages * (advisor.bike.stageMin + advisor.bike.restMin)} min incl. rests)`
                    : '—'}
                </div>
                {(advisor.bike.lastTestDays != null && advisor.bike.lastTestDays > 90) && (
                  <div className="text-rose-600 font-semibold">⚠ Test is older than 90 days</div>
                )}
                {advisor.bike.zoneShift && (
                  <div className="text-amber-700 font-semibold">
                    ⚠ Zones likely shifted (compare profile LT2 vs last test / recent power)
                  </div>
                )}
              </div>
            </div>

            {/* Run */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-900 text-sm sm:text-base">Run</div>
                <div className="text-xs text-gray-500">
                  Last test: {advisor.run.lastTest?.date ? `${formatDateShort(advisor.run.lastTest.date)} (${advisor.run.lastTestDays ?? '-'}d)` : '—'}
                </div>
              </div>
              <div className="mt-2 text-xs sm:text-sm text-gray-700 space-y-1">
                <div>
                  <span className="font-semibold">Protocol:</span>{' '}
                  {advisor.run.startPaceSecPerKm && advisor.run.endPaceSecPerKm
                    ? `${formatPace(advisor.run.startPaceSecPerKm)}→${formatPace(advisor.run.endPaceSecPerKm)} /km (-${advisor.run.stepSecPerKm}s), ${advisor.run.stageMin}min stage + ${advisor.run.restMin}min rest`
                    : 'Set threshold pace in profile or sync Strava runs to estimate.'}
                </div>
                <div>
                  <span className="font-semibold">Hint:</span> Keep lactate sampling consistent (same minute of each stage) + short standing rest.
                </div>
                {(advisor.run.lastTestDays != null && advisor.run.lastTestDays > 90) && (
                  <div className="text-rose-600 font-semibold">⚠ Test is older than 90 days</div>
                )}
                {advisor.run.zoneShift && (
                  <div className="text-amber-700 font-semibold">
                    ⚠ Zones likely shifted (compare profile LT2 vs last test / recent pace)
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* LT2 history charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mt-4">
            <div className="rounded-xl border border-gray-200 p-3 sm:p-4">
              <div className="text-sm font-semibold text-gray-900 mb-2">Bike LT2 trend</div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lt2History.bike.map(p => ({ ...p, dateLabel: formatDateShort(p.date) }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="lt2" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="text-xs text-gray-500 mt-2">LT2 estimated from each lactate test (≈4.0 mmol/L interpolation).</div>
            </div>

            <div className="rounded-xl border border-gray-200 p-3 sm:p-4">
              <div className="text-sm font-semibold text-gray-900 mb-2">Run LT2 trend</div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lt2History.run.map(p => ({ ...p, dateLabel: formatDateShort(p.date) }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} reversed />
                    <Tooltip formatter={(v) => `${formatPace(v)} /km`} />
                    <Line type="monotone" dataKey="lt2" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="text-xs text-gray-500 mt-2">Lower pace is better (axis is reversed).</div>
            </div>
          </div>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showNewTesting && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="mb-3 sm:mb-6 w-full"
          >
            <NewTestingComponent 
              selectedSport={selectedSport}
              onSubmit={handleAddTest}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="w-full min-w-0"
      >
        <PreviousTestingComponent 
          selectedSport={selectedSport}
          tests={tests}
          setTests={setTests}
          selectedTestId={testIdFromUrl}
        />
      </motion.div>

      {/* Glossary Modal */}
      <TrainingGlossary 
        isOpen={showGlossary} 
        onClose={() => setShowGlossary(false)} 
        initialTerm="Lactate Testing"
        initialCategory="Lactate"
      />
    </motion.div>
  );
};

export default TestingPage;
