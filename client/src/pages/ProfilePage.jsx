import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import WeeklyCalendar from '../components/DashboardPage/WeeklyCalendar';
import TrainingGraph from '../components/DashboardPage/TrainingGraph';
import SpiderChart from "../components/DashboardPage/SpiderChart";
import EditProfileModal from "../components/Profile/EditProfileModal";
import ChangePasswordModal from "../components/Profile/ChangePasswordModal";
import WorkoutPlanModal from '../components/WorkoutPlanner/WorkoutPlanModal';
import TrainingForm from '../components/TrainingForm';
import UpgradeModal from '../components/UpgradeModal';
import { getZoneHistory, updateUserProfile } from '../services/api';
import { getPlannedWorkouts, createPlannedWorkout, updatePlannedWorkout, deletePlannedWorkout, getDayPlans, setDayPlan as apiSetDayPlan, deleteDayPlan as apiDeleteDayPlan, getPeriods } from '../services/workoutPlannerApi';
import { upsertPlannedWorkoutList } from '../utils/activityEventPatches';
import { usePremium } from '../hooks/usePremium';
import { useAuth } from '../context/AuthProvider';
import { getAvatarBySportAndGender } from '../utils/avatarUtils';
import { 
  PencilIcon, 
  KeyIcon,  EnvelopeIcon,
  PhoneIcon,
  CalendarIcon,
  MapPinIcon,
  ScaleIcon,
  ArrowTrendingUpIcon,
  TrophyIcon,
  AcademicCapIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import api, { getFitTrainings, listExternalActivities, addTraining } from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { isCapacitorNative } from '../utils/isNativeApp';
import NativeProfilePage from './NativeProfilePage';

const MAX_PROFILE_CALENDAR_ACTIVITIES = 2000;

function sortAndLimitCalendarActivities(combined) {
  const tMs = (act) => {
    const d = new Date(act?.date ?? act?.timestamp ?? act?.startDate ?? 0);
    const x = d.getTime();
    return Number.isNaN(x) ? 0 : x;
  };
  return [...combined].sort((a, b) => tMs(b) - tMs(a)).slice(0, MAX_PROFILE_CALENDAR_ACTIVITIES);
}

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPremium, gate, UpgradeModalProps } = usePremium();
  const [userInfo, setUserInfo] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const trainingsRef = useRef(trainings);
  useEffect(() => { trainingsRef.current = trainings; }, [trainings]);
  const [calendarData, setCalendarData] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);
  const [dayPlans, setDayPlans] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [planModal, setPlanModal] = useState(null);
  const [isTrainingFormOpen, setIsTrainingFormOpen] = useState(false);
  const [selectedSport] = useState('bike');
const [selectedTitle, setSelectedTitle] = useState(null);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isZonesModalOpen, setIsZonesModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [selectedZoneSport, setSelectedZoneSport] = useState('cycling'); // cycling or running
  const [zoneHistory, setZoneHistory] = useState({ powerZonesHistory: [], heartRateZonesHistory: [] });
  const [compareHistoryAKey, setCompareHistoryAKey] = useState('');
  const [compareHistoryBKey, setCompareHistoryBKey] = useState('');

  const normalizeSportName = useCallback((sport) => {
    const s = String(sport || '').toLowerCase();
    if (s === 'bike') return 'cycling';
    if (s === 'run') return 'running';
    if (s === 'swim') return 'swimming';
    return s;
  }, []);

  const effectiveTrainingGraphSport = useMemo(() => {
    const preferred = normalizeSportName(selectedSport);
    const hasPreferred = trainings.some((t) => normalizeSportName(t?.sport) === preferred);
    if (hasPreferred) return preferred;

    const firstAvailable = trainings
      .map((t) => normalizeSportName(t?.sport))
      .find(Boolean);

    return firstAvailable || preferred;
  }, [trainings, selectedSport, normalizeSportName]);
  

  // const getUserProfile = async () => {
  //   try {
  //     const response = await axios.get(API_ENDPOINTS.PROFILE, {
  //       headers: {
  //         'Authorization': `Bearer ${token}`
  //       }
  //     });
  //     return response.data;
  //   } catch (error) {
  //     console.error('Error fetching user profile:', error);
  //     throw error;
  //   }
  // };

  // const getTrainingsByAthleteId = async (athleteId) => {
  //   try {
  //     const response = await axios.get(API_ENDPOINTS.TRAININGS(athleteId), {
  //       headers: {
  //         'Authorization': `Bearer ${token}`
  //       }
  //     });
  //     return response.data;
  //   } catch (error) {
  //     console.error('Error fetching trainings:', error);
  //     throw error;
  //   }
  // };

  // const getAthleteTests = async (athleteId) => {
  //   try {
  //     const response = await axios.get(API_ENDPOINTS.ATHLETE_TESTS(athleteId), {
  //       headers: {
  //         'Authorization': `Bearer ${token}`
  //       }
  //     });
  //     return response.data;
  //   } catch (error) {
  //     console.error('Error fetching tests:', error);
  //     throw error;
  //   }
  // };

  // Formátování data
  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    try {
      // Pokud je to ISO string, parsujeme ho
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Not set';
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    return `${day}.${month}.${year}`;
    } catch (error) {
      return 'Not set';
    }
  };

  // Get unitSystem from userInfo
  const unitSystem = userInfo?.units?.distance === 'imperial' ? 'imperial' : 'metric';
  
  // Format pace for display (seconds to mm:ss)
  const formatPace = (seconds) => {
    if (!seconds || seconds === 0 || isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };
  
  const getPaceUnit = (sport) => {
    if (sport === 'swimming') {
      return unitSystem === 'imperial' ? '/100yd' : '/100m';
    }
    return unitSystem === 'imperial' ? '/mile' : '/km';
  };

  const formatZoneBound = (value) => {
    if (value === Infinity || value === null || value === undefined || value === '') return '∞';
    const num = Number(value);
    return Number.isFinite(num) ? `${num}` : '∞';
  };

  const formatPowerOrPaceRange = (zone, sport) => {
    if (!zone) return '-';
    const min = zone.min ?? 0;
    const max = zone.max;
    if (sport === 'cycling') {
      return `${formatZoneBound(min)}-${formatZoneBound(max)} W`;
    }
    const paceMin = formatPace(min);
    const paceMax = max === Infinity || max === null || max === undefined ? '∞' : formatPace(max);
    return `${paceMin}-${paceMax} ${getPaceUnit(sport)}`;
  };

  const formatHeartRateRange = (zone) => {
    if (!zone) return '-';
    const min = zone.min ?? 0;
    const max = zone.max;
    return `${formatZoneBound(min)}-${formatZoneBound(max)} BPM`;
  };

  const formatLactateRange = (lactate) => {
    if (!lactate) return '-';
    const min = lactate.min;
    const max = lactate.max;
    if (!Number.isFinite(Number(min)) && !Number.isFinite(Number(max))) return '-';
    const fmt = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '∞');
    return `${fmt(min)}-${fmt(max)} mmol/L`;
  };

  const hasConfiguredZonesForSport = useCallback((sportKey) => {
    const zones = userInfo?.powerZones?.[sportKey];
    if (!zones || typeof zones !== 'object') return false;

    if (zones.lt1 != null || zones.lt2 != null) return true;

    for (let i = 1; i <= 5; i++) {
      const zone = zones[`zone${i}`];
      if (!zone || typeof zone !== 'object') continue;
      if (
        zone.min != null ||
        zone.max != null ||
        zone.description ||
        (zone.lactate && (zone.lactate.min != null || zone.lactate.max != null))
      ) {
        return true;
      }
    }
    return false;
  }, [userInfo]);

  const availableZoneSports = useMemo(
    () => ['cycling', 'running', 'swimming'].filter((sport) => hasConfiguredZonesForSport(sport)),
    [hasConfiguredZonesForSport]
  );

  useEffect(() => {
    if (availableZoneSports.length === 0) return;
    if (!availableZoneSports.includes(selectedZoneSport)) {
      setSelectedZoneSport(availableZoneSports[0]);
    }
  }, [availableZoneSports, selectedZoneSport]);

  const selectedZoneHistory = useMemo(() => {
    const power = Array.isArray(zoneHistory?.powerZonesHistory) ? zoneHistory.powerZonesHistory : [];
    const hr = Array.isArray(zoneHistory?.heartRateZonesHistory) ? zoneHistory.heartRateZonesHistory : [];

    const bucket = new Map();
    power.forEach((entry, idx) => {
      const ts = entry?.createdAt ? new Date(entry.createdAt).toISOString() : `power-${idx}`;
      const prev = bucket.get(ts) || { key: ts, createdAt: entry?.createdAt || null, powerSnapshot: null, hrSnapshot: null, source: null, note: null };
      prev.powerSnapshot = entry?.zones?.[selectedZoneSport] || null;
      prev.source = entry?.source || prev.source;
      prev.note = entry?.note || prev.note;
      bucket.set(ts, prev);
    });
    hr.forEach((entry, idx) => {
      const ts = entry?.createdAt ? new Date(entry.createdAt).toISOString() : `hr-${idx}`;
      const prev = bucket.get(ts) || { key: ts, createdAt: entry?.createdAt || null, powerSnapshot: null, hrSnapshot: null, source: null, note: null };
      prev.hrSnapshot = entry?.zones?.[selectedZoneSport] || null;
      prev.source = entry?.source || prev.source;
      prev.note = entry?.note || prev.note;
      bucket.set(ts, prev);
    });

    return Array.from(bucket.values())
      .filter((e) => e.powerSnapshot || e.hrSnapshot)
      .sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0));
  }, [zoneHistory, selectedZoneSport]);

  useEffect(() => {
    if (!selectedZoneHistory.length) {
      setCompareHistoryAKey('');
      setCompareHistoryBKey('');
      return;
    }
    const newest = selectedZoneHistory[0]?.key || '';
    const previous = selectedZoneHistory[1]?.key || newest;
    setCompareHistoryAKey((prev) => (prev && selectedZoneHistory.some((x) => x.key === prev) ? prev : newest));
    setCompareHistoryBKey((prev) => (prev && selectedZoneHistory.some((x) => x.key === prev) ? prev : previous));
  }, [selectedZoneHistory]);

  const comparedSnapshotA = useMemo(
    () => selectedZoneHistory.find((x) => x.key === compareHistoryAKey) || null,
    [selectedZoneHistory, compareHistoryAKey]
  );
  const comparedSnapshotB = useMemo(
    () => selectedZoneHistory.find((x) => x.key === compareHistoryBKey) || null,
    [selectedZoneHistory, compareHistoryBKey]
  );

  const formatNumericDelta = (a, b, suffix = '') => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return '-';
    const delta = na - nb;
    const sign = delta > 0 ? '+' : '';
    return `${sign}${Math.round(delta)}${suffix}`;
  };

  const formatPaceDelta = (a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return '-';
    const delta = na - nb;
    const sign = delta > 0 ? '+' : '-';
    return `${sign}${formatPace(Math.abs(delta))}`;
  };

  // Load training calendar data (FIT, regular trainings, Strava) — same merge as Dashboard
  const loadCalendarData = useCallback(async (targetId, regularTrainingsParam) => {
    const regTrainings = regularTrainingsParam ?? trainingsRef.current;
    try {
      const cacheKey = `calendarData_${targetId}`;
      const cacheTimestampKey = `calendarData_timestamp_${targetId}`;
      const CACHE_DURATION = 24 * 60 * 60 * 1000;

      const cachedData = localStorage.getItem(cacheKey);
      const cacheTimestamp = localStorage.getItem(cacheTimestampKey);
      const now = Date.now();

      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          const isCacheValid = cacheTimestamp && (now - parseInt(cacheTimestamp)) < CACHE_DURATION;
          if (isCacheValid && parsed.length > 0) {
            setCalendarData(parsed);
          } else if (parsed.length > 0) {
            setCalendarData(parsed);
          }
        } catch (e) {
          console.error('Error parsing cached calendar data:', e);
        }
      }

      setCalendarLoading(true);
      const [fitData, stravaData] = await Promise.all([
        getFitTrainings(targetId).catch(err => {
          console.error('Error loading FIT trainings:', err);
          return [];
        }),
        listExternalActivities({
          athleteId: targetId,
          summaryOnly: true,
          limit: MAX_PROFILE_CALENDAR_ACTIVITIES,
        }).catch(err => {
          if (err.response?.status !== 429 && err.code !== 'ERR_NETWORK' && err.code !== 'ERR_EMPTY_RESPONSE') {
            console.error('Error loading Strava activities:', err);
          }
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
            avgSpeed: t.avgSpeed || t.averageSpeed || null,
          })),
        ...(stravaData || []).map(a => {
          const stravaId = a.stravaId || a.id;
          const linkedTraining = trainingByStravaId.get(String(stravaId));
          return {
            ...a,
            type: 'strava',
            date: a.startDate,
            title: linkedTraining?.title || a.titleManual || a.name || 'Untitled Activity',
            linkedTrainingTitle: linkedTraining?.title || null,
            sport: a.sport,
            stravaId,
            id: `strava-${stravaId}`,
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
            kilojoules: a.kilojoules ?? a.raw?.kilojoules,
          };
        }),
      ];

      const limitedForView = sortAndLimitCalendarActivities(combined);

      try {
        if (limitedForView.length > 0) {
          const dataToCache = JSON.stringify(limitedForView);
          if (dataToCache.length < 450000) {
            localStorage.setItem(cacheKey, dataToCache);
            localStorage.setItem(cacheTimestampKey, now.toString());
          }
        }
      } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          console.warn('localStorage quota exceeded, skipping cache');
        }
      }

      setCalendarData(limitedForView);
    } catch (error) {
      console.error('Error loading calendar data:', error);
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  const loadProfilePlannedWorkouts = useCallback(async (athleteId) => {
    if (!athleteId) return;
    try {
      const [pw, dp, ps] = await Promise.all([
        getPlannedWorkouts({}),
        getDayPlans({}).catch(() => []),
        getPeriods({}).catch(() => []),
      ]);
      setPlannedWorkouts(Array.isArray(pw) ? pw : []);
      setDayPlans(Array.isArray(dp) ? dp : []);
      setPeriods(Array.isArray(ps) ? ps : []);
    } catch (_) {}
  }, []);

  const handleDayPlanSave = useCallback(async (dateStr, payload) => {
    const result = await apiSetDayPlan(dateStr, payload || {}, null);
    setDayPlans(prev => {
      const without = prev.filter(p => p.date !== dateStr);
      if (result?.deleted) return without;
      return [...without, result];
    });
    return result;
  }, []);

  const handleDayPlanDelete = useCallback(async (dateStr) => {
    await apiDeleteDayPlan(dateStr, null);
    setDayPlans(prev => prev.filter(p => p.date !== dateStr));
  }, []);

  const handleProfilePlanSave = useCallback(async (data) => {
    try {
      if (planModal?.workout?._id) {
        const updated = await updatePlannedWorkout(planModal.workout._id, data);
        setPlannedWorkouts(prev => prev.map(p => p._id === updated._id ? updated : p));
      } else {
        const created = await createPlannedWorkout(data);
        setPlannedWorkouts(prev => [...prev, created]);
      }
      setPlanModal(null);
    } catch (_) {}
  }, [planModal]);

  const handleProfilePlanDelete = useCallback(async (pw) => {
    if (!window.confirm('Delete this planned workout?')) return;
    try {
      await deletePlannedWorkout(pw._id);
      setPlannedWorkouts(prev => prev.filter(p => p._id !== pw._id));
      setPlanModal(null);
    } catch (_) {}
  }, []);

  const handleProfileCopyPlan = useCallback(async (pw, newDateStr) => {
    try {
      const { _id, status, executionData, ...rest } = pw;
      const created = await createPlannedWorkout({ ...rest, date: newDateStr, status: 'planned' });
      setPlannedWorkouts(prev => [...prev, created]);
    } catch (_) {}
  }, []);

  const profileAthleteId = userInfo?._id || user?._id || null;
  const hasCalendarData = Array.isArray(calendarData) && calendarData.length > 0;

  const handleProfileAddTraining = useCallback(async (formData) => {
    if (!profileAthleteId || !user?._id) return;
    const trainingData = { ...formData, athleteId: profileAthleteId, coachId: user._id };
    await addTraining(trainingData);
    setIsTrainingFormOpen(false);
    const trainingsResponse = await api.get(`/user/athlete/${profileAthleteId}/trainings`).catch(() => ({ data: trainings }));
    const trainingsData = Array.isArray(trainingsResponse.data) ? trainingsResponse.data : trainings;
    setTrainings(trainingsData);
    loadCalendarData(profileAthleteId, trainingsData);
  }, [profileAthleteId, user?._id, trainings, loadCalendarData]);

  const loadProfileData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const profileResponse = await api.get(`/user/profile`);
      const profileData = profileResponse.data;
      const historyPromise = getZoneHistory().catch(() => ({ powerZonesHistory: [], heartRateZonesHistory: [] }));

      // Use the new utility function to get avatar
      const avatar = getAvatarBySportAndGender(profileData);

      setUserInfo({
        name: `${profileData.name} ${profileData.surname}`,
        email: profileData.email,
        phone: profileData.phone || 'Not set',
        weight: profileData.weight || 'Not set',
        height: profileData.height || 'Not set',
        bio: profileData.bio || 'Not set',
        dateOfBirth: profileData.dateOfBirth ? formatDate(profileData.dateOfBirth) : 'Not set',
        dateOfBirthRaw: profileData.dateOfBirth, // Keep raw for display
        address: profileData.address || 'Not set',
        sport: profileData.sport || 'Not set',
        specialization: profileData.specialization || 'Not set',
        title: profileData.role === 'coach' ? 'Coach' : profileData.specialization || 'Not set',
        avatar: avatar,
        _id: profileData._id,
        role: profileData.role,
        gender: profileData.gender || 'male',
        powerZones: profileData.powerZones, // Include power zones
        heartRateZones: profileData.heartRateZones, // Include heart rate zones
        units: profileData.units || { distance: 'metric', weight: 'kg', temperature: 'celsius' } // Include units
      });
      const historyData = await historyPromise;
      setZoneHistory({
        powerZonesHistory: historyData?.powerZonesHistory || [],
        heartRateZonesHistory: historyData?.heartRateZonesHistory || []
      });

      // Vlastní FIT / Strava / tréninky v kalendáři — i pro trenéra (propojená Strava patří jeho účtu)
      const athleteKey = String(profileData._id);
      let trainingsData = [];
      try {
        const trainingsResponse = await api.get(`/user/athlete/${athleteKey}/trainings`);
        trainingsData = Array.isArray(trainingsResponse.data) ? trainingsResponse.data : [];
        setTrainings(trainingsData);
      } catch (loadErr) {
        const status = loadErr?.response?.status;
        if (status === 403 || status === 404) {
          console.warn('[ProfilePage] Trainings not available:', status, loadErr?.response?.data?.error);
        } else {
          console.error('[ProfilePage] Error loading trainings:', loadErr);
        }
        setTrainings([]);
      }

      loadCalendarData(profileData._id, trainingsData);
      loadProfilePlannedWorkouts(profileData._id);

    } catch (error) {
      console.error('Error loading profile data:', error);
      setError(error.message || 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  }, [loadCalendarData, loadProfilePlannedWorkouts]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  // Přidáme efekt pro změnu sportu
  useEffect(() => {
    if (trainings.length > 0) {
      const sportTrainings = trainings.filter(
        (t) => normalizeSportName(t?.sport) === effectiveTrainingGraphSport
      );
      const uniqueTitles = [...new Set(sportTrainings.map(t => t.title))];
      
      if (!selectedTitle || !sportTrainings.some(t => t.title === selectedTitle)) {
        setSelectedTitle(uniqueTitles[0]);
        const firstTrainingWithTitle = sportTrainings.find(t => t.title === uniqueTitles[0]);
        if (firstTrainingWithTitle) {
          setSelectedTraining(firstTrainingWithTitle._id);
        }
      }
    }
  }, [effectiveTrainingGraphSport, trainings, selectedTitle, normalizeSportName]);

  const handleProfileActivitySelect = useCallback((activity) => {
    if (!activity) return;
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
    navigate(`/training-calendar/${encodeURIComponent(`${kind}-${id}`)}`);
  }, [navigate]);

  const handleProfileUpdate = async (updatedData) => {
    try {
      const { name, ...restData } = updatedData;
      const hasName = typeof name === 'string' && name.trim().length > 0;
      const [firstName = '', ...lastNameParts] = hasName ? name.split(' ') : [];
      const surname = lastNameParts.join(' ');

      const dataToSend = {
        ...restData,
        ...(hasName ? { name: firstName, surname } : {}),
        height: restData.height ? Number(restData.height) : undefined,
        weight: restData.weight ? Number(restData.weight) : undefined,
      };

      const response = await updateUserProfile(dataToSend);
      const updatedUser = response.data;

      setUserInfo({
        name: `${updatedUser.name} ${updatedUser.surname}`,
        email: updatedUser.email,
        phone: updatedUser.phone || '',
        weight: updatedUser.weight || '',
        height: updatedUser.height || '',
        bio: updatedUser.bio || '',
        dateOfBirth: updatedUser.dateOfBirth ? formatDate(updatedUser.dateOfBirth) : '',
        dateOfBirthRaw: updatedUser.dateOfBirth,
        address: updatedUser.address || '',
        sport: updatedUser.sport || '',
        specialization: updatedUser.specialization || '',
        title: updatedUser.specialization || '',
        avatar: getAvatarBySportAndGender(updatedUser),
        gender: updatedUser.gender || 'male',
        powerZones: updatedUser.powerZones || userInfo.powerZones, // Keep power zones
        heartRateZones: updatedUser.heartRateZones || userInfo.heartRateZones, // Keep heart rate zones
        units: updatedUser.units || userInfo.units || { distance: 'metric', weight: 'kg', temperature: 'celsius' } // Keep units
      });

      setIsEditModalOpen(false);
      setIsZonesModalOpen(false);
      const historyData = await getZoneHistory().catch(() => ({ powerZonesHistory: [], heartRateZonesHistory: [] }));
      setZoneHistory({
        powerZonesHistory: historyData?.powerZonesHistory || [],
        heartRateZonesHistory: historyData?.heartRateZonesHistory || []
      });
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  if (loading) return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center justify-center h-screen"
    >
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </motion.div>
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

  if (!userInfo) return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-6 text-gray-600"
    >
      No user data available
    </motion.div>
  );

  // Native app gets a mobile-optimised view that reuses the dashboard's design language
  if (isCapacitorNative()) {
    return <NativeProfilePage userInfo={userInfo} calendarData={calendarData} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto w-full max-w-[1600px] px-2 sm:px-4 py-4 md:p-6 space-y-4 overflow-x-hidden"
    >
      {/* ── HERO CARD ── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative bg-white rounded-2xl shadow-sm overflow-hidden"
      >
        {/* Banner */}
        <div className="h-20 sm:h-28 bg-gradient-to-r from-violet-500 via-purple-400 to-indigo-400" />

        {/* Action buttons */}
        <div className="absolute top-3 right-3 flex gap-1.5">
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/80 backdrop-blur-sm text-xs font-medium text-gray-700 hover:bg-white shadow-sm transition-all"
          >
            <PencilIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Edit</span>
          </button>
          <button
            onClick={() => setIsPasswordModalOpen(true)}
            className="p-1.5 rounded-lg bg-white/80 backdrop-blur-sm text-gray-700 hover:bg-white shadow-sm transition-all"
            title="Change password"
          >
            <KeyIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 sm:px-6 pb-4 sm:pb-5">
          {/* Avatar + name row */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4 -mt-8 sm:-mt-10 mb-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 border-white shadow-md overflow-hidden bg-white shrink-0">
              <img src={userInfo.avatar} alt="Profile" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">{userInfo.name}</h1>
              <p className="text-sm text-gray-500">{userInfo.title !== 'Not set' ? userInfo.title : userInfo.sport}</p>
            </div>
          </div>

          {/* Quick stats pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {userInfo.weight && userInfo.weight !== 'Not set' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                <ScaleIcon className="w-3.5 h-3.5 text-gray-400" />
                {userInfo.weight} kg
              </span>
            )}
            {userInfo.height && userInfo.height !== 'Not set' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                <ArrowTrendingUpIcon className="w-3.5 h-3.5 text-gray-400" />
                {userInfo.height} cm
              </span>
            )}
            {userInfo.sport && userInfo.sport !== 'Not set' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-100 text-xs font-medium text-violet-700">
                <TrophyIcon className="w-3.5 h-3.5" />
                {userInfo.sport}
              </span>
            )}
            {userInfo.dateOfBirthRaw && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
                {formatDate(userInfo.dateOfBirthRaw)}
              </span>
            )}
          </div>

          {/* Personal info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { icon: EnvelopeIcon, label: 'Email', value: userInfo.email, breakAll: true },
              { icon: PhoneIcon, label: 'Phone', value: userInfo.phone },
              { icon: AcademicCapIcon, label: 'Specialization', value: userInfo.specialization },
              { icon: MapPinIcon, label: 'Address', value: userInfo.address },
              { icon: InformationCircleIcon, label: 'Bio', value: userInfo.bio, fullWidth: true },
            ].filter(({ value }) => value && value !== 'Not set').map(({ icon: Icon, label, value, breakAll, fullWidth }) => (
              <div
                key={label}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors${fullWidth ? ' sm:col-span-2' : ''}`}
              >
                <Icon className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide leading-none mb-0.5">{label}</p>
                  <p className={`text-sm text-gray-800 font-medium ${breakAll ? 'break-all' : 'break-words'}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── TRAINING ZONES ── */}
      {availableZoneSports.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative flex flex-col gap-2 sm:gap-4 p-2 sm:p-4 bg-white/60 backdrop-blur-lg rounded-2xl sm:rounded-3xl border border-white/30 shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-white/20 bg-white/20 rounded-t-2xl sm:rounded-t-3xl backdrop-blur">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-base sm:text-lg font-semibold text-gray-900 drop-shadow-[0_1px_8px_rgba(0,0,30,0.10)]">
                Training Zones
              </h4>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Sport tabs */}
                <div className="flex gap-1.5">
                  {[
                    { id: 'cycling',  label: 'Bike', icon: '/icon/bike.svg' },
                    { id: 'running',  label: 'Run',  icon: '/icon/run.svg'  },
                    { id: 'swimming', label: 'Swim', icon: '/icon/swim.svg' },
                  ].filter(s => hasConfiguredZonesForSport(s.id)).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedZoneSport(s.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                        selectedZoneSport === s.id
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <img
                        src={s.icon}
                        alt={s.label}
                        className={`w-3.5 h-3.5 object-contain ${selectedZoneSport === s.id ? 'invert' : ''}`}
                      />
                      {s.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setIsZonesModalOpen(true)}
                  className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all shadow-sm text-xs font-medium"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>

          {['cycling', 'running', 'swimming'].map((sport) => {
            if (!hasConfiguredZonesForSport(sport) || selectedZoneSport !== sport) return null;
            const zones = userInfo.powerZones[sport];
            const hrZones = userInfo.heartRateZones?.[sport];
            const lt1 = zones.lt1;
            const lt2 = zones.lt2;
            const zoneColors = [
              'bg-[#22c55e]/60',
              'bg-[#3b82f6]/60',
              'bg-[#fbbf24]/60',
              'bg-[#ef4444]/60',
              'bg-[#8b5cf6]/60',
            ];
            const zoneNames = ['Recovery / Easy', 'Aerobic Base', 'Tempo / Steady', 'Threshold', 'VO₂max / Sprint'];
            const fmtMain = (val) => {
              if (val == null || val === '' || val === Infinity) return '∞';
              if (sport === 'cycling') return `${val}W`;
              if (sport === 'swimming') return `${formatPace(val)}/100m`;
              return `${formatPace(val)}${getPaceUnit('running')}`;
            };

            return (
              <React.Fragment key={sport}>
                {/* LT1 / LT2 */}
                {(lt1 || lt2) && (
                  <div className="grid grid-cols-2 gap-2 px-3 sm:px-6">
                    {lt1 && (
                      <div className="p-3 bg-sky-50/80 rounded-xl border border-sky-100">
                        <p className="text-[10px] font-semibold text-sky-500 uppercase tracking-wide mb-0.5">LTP1</p>
                        <p className="text-xl font-bold text-sky-700">{fmtMain(lt1)}</p>
                      </div>
                    )}
                    {lt2 && (
                      <div className="p-3 bg-violet-50/80 rounded-xl border border-violet-100">
                        <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide mb-0.5">
                          LTP2{sport === 'cycling' ? ' / FTP' : ''}
                        </p>
                        <p className="text-xl font-bold text-violet-700">{fmtMain(lt2)}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Zones table */}
                <div className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0 max-w-[320px] sm:max-w-full mx-auto">
                  <div className="inline-block min-w-full align-middle">
                    <table className="w-full min-w-[300px] sm:min-w-full select-text">
                      <thead className="bg-white/10">
                        <tr>
                          <th className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">Zone</th>
                          <th className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20 hidden sm:table-cell">Description</th>
                          <th className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">
                            {sport === 'cycling' ? 'Power (W)' : sport === 'swimming' ? 'Pace /100m' : 'Pace /km'}
                          </th>
                          <th className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-r border-white/20">HR</th>
                          <th className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Lactate</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white/30 divide-y divide-white/30 rounded-b-3xl">
                        {[1, 2, 3, 4, 5].map((zoneNum, index) => {
                          const zone = zones[`zone${zoneNum}`];
                          if (!zone || (!zone.min && !zone.max)) return null;
                          const hrZone = hrZones?.[`zone${zoneNum}`];
                          const fmtBound = (v) => (v == null || v === Infinity || v === '') ? '∞' : String(v);
                          const lactateStr = zone.lactate
                            ? `${Number.isFinite(Number(zone.lactate.min)) ? Number(zone.lactate.min).toFixed(1) : '?'}–${Number.isFinite(Number(zone.lactate.max)) ? Number(zone.lactate.max).toFixed(1) : '?'} mmol/L`
                            : null;
                          return (
                            <motion.tr
                              key={`z${zoneNum}`}
                              className="transition-all duration-200 hover:bg-white/40 hover:backdrop-blur"
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.09 }}
                            >
                              <td className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 border-r border-white/20">
                                <div className="flex items-center">
                                  <span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full mr-1 sm:mr-2 inline-block border border-white/70 shadow ${zoneColors[zoneNum - 1]}`} />
                                  <span className="text-xs sm:text-sm font-semibold text-gray-900">{zoneNum}</span>
                                </div>
                              </td>
                              <td className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 border-r border-white/20 hidden sm:table-cell">
                                <span className="text-xs sm:text-sm text-gray-700">{zone.description || zoneNames[zoneNum - 1]}</span>
                              </td>
                              <td className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 border-r border-white/20">
                                <span className="text-xs sm:text-sm text-gray-900 font-mono tracking-tight">
                                  {fmtMain(zone.min || 0)}–{fmtMain(zone.max)}
                                </span>
                              </td>
                              <td className="px-1 sm:px-3 md:px-6 py-2 sm:py-3 border-r border-white/20">
                                <span className="text-xs sm:text-sm text-gray-900 font-mono tracking-tight">
                                  {hrZone ? `${hrZone.min || 0}–${fmtBound(hrZone.max)}` : '-'}
                                </span>
                              </td>
                              <td className="px-1 sm:px-3 md:px-6 py-2 sm:py-3">
                                <span className="text-xs sm:text-sm text-gray-900 font-mono tracking-tight">
                                  {lactateStr || '-'}
                                </span>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {zones.lastUpdated && (
                  <p className="text-[10px] text-gray-400 px-3 sm:px-6 pb-1">Updated: {new Date(zones.lastUpdated).toLocaleDateString()}</p>
                )}

                {(!zones.zone1 || !zones.zone1.min) && !lt1 && !lt2 && (
                  <div className="mx-3 sm:mx-6 p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <p className="text-xs text-amber-700">No {sport} zones configured. Click Edit to set zones.</p>
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {/* History compare */}
          {selectedZoneHistory.length > 1 && (
            <div className="mx-3 sm:mx-6 pt-3 border-t border-white/30">
              <h3 className="text-xs font-semibold text-gray-700 mb-2">Compare snapshots</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <label className="text-[11px] text-gray-500">
                  Snapshot A
                  <select
                    value={compareHistoryAKey}
                    onChange={(e) => setCompareHistoryAKey(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  >
                    {selectedZoneHistory.map((item) => (
                      <option key={`a-${item.key}`} value={item.key}>
                        {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown date'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] text-gray-500">
                  Snapshot B
                  <select
                    value={compareHistoryBKey}
                    onChange={(e) => setCompareHistoryBKey(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700"
                  >
                    {selectedZoneHistory.map((item) => (
                      <option key={`b-${item.key}`} value={item.key}>
                        {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown date'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {comparedSnapshotA && comparedSnapshotB && (
                <div className="overflow-x-auto rounded-xl border border-white/30">
                  <table className="w-full min-w-[420px] text-xs">
                    <thead>
                      <tr className="bg-white/20 border-b border-white/20">
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Zone</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Power/Pace (A vs B)</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">HR (A vs B)</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Lactate (A vs B)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3, 4, 5].map((zoneNum) => {
                        const aPz = comparedSnapshotA.powerSnapshot?.[`zone${zoneNum}`];
                        const bPz = comparedSnapshotB.powerSnapshot?.[`zone${zoneNum}`];
                        const aHz = comparedSnapshotA.hrSnapshot?.[`zone${zoneNum}`];
                        const bHz = comparedSnapshotB.hrSnapshot?.[`zone${zoneNum}`];
                        const deltaMain = selectedZoneSport === 'cycling'
                          ? formatNumericDelta(aPz?.max, bPz?.max, ' W')
                          : formatPaceDelta(aPz?.max, bPz?.max);
                        const deltaHr = formatNumericDelta(aHz?.max, bHz?.max, ' bpm');
                        const deltaLac = (() => {
                          const aL = Number(aPz?.lactate?.max);
                          const bL = Number(bPz?.lactate?.max);
                          if (!Number.isFinite(aL) || !Number.isFinite(bL)) return '-';
                          const d = aL - bL;
                          return `${d > 0 ? '+' : ''}${d.toFixed(1)} mmol/L`;
                        })();
                        return (
                          <tr key={`cmp-${zoneNum}`} className="border-b border-white/20 last:border-b-0">
                            <td className="py-2 px-3 font-bold text-gray-700">Z{zoneNum}</td>
                            <td className="py-2 px-3 text-gray-700">
                              <span className="font-mono">{formatPowerOrPaceRange(aPz, selectedZoneSport)}</span>
                              <span className="text-gray-400 mx-1">vs</span>
                              <span className="font-mono">{formatPowerOrPaceRange(bPz, selectedZoneSport)}</span>
                              <span className="ml-1.5 text-primary font-bold">({deltaMain})</span>
                            </td>
                            <td className="py-2 px-3 text-gray-700">
                              <span className="font-mono">{formatHeartRateRange(aHz)}</span>
                              <span className="text-gray-400 mx-1">vs</span>
                              <span className="font-mono">{formatHeartRateRange(bHz)}</span>
                              <span className="ml-1.5 text-primary font-bold">({deltaHr})</span>
                            </td>
                            <td className="py-2 px-3 text-gray-700">
                              <span className="font-mono">{formatLactateRange(aPz?.lactate)}</span>
                              <span className="text-gray-400 mx-1">vs</span>
                              <span className="font-mono">{formatLactateRange(bPz?.lactate)}</span>
                              <span className="ml-1.5 text-primary font-bold">({deltaLac})</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ── PERFORMANCE CHARTS (side-by-side on lg) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="min-w-0 overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100"
        >
          <SpiderChart
            trainings={trainings}
            selectedSport={selectedSport}
            className="w-full"
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="min-w-0 overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100"
        >
          <TrainingGraph
            trainingList={trainings}
            selectedSport={effectiveTrainingGraphSport}
            selectedTitle={selectedTitle}
            setSelectedTitle={setSelectedTitle}
            selectedTraining={selectedTraining}
            setSelectedTraining={setSelectedTraining}
          />
        </motion.div>
      </div>

      {/* ── WEEKLY CALENDAR (same as Dashboard) ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="min-w-0"
      >
        <WeeklyCalendar
          selectedAthleteId={profileAthleteId}
          activities={calendarData || []}
          activitiesLoading={calendarLoading && !hasCalendarData}
          onSelectActivity={handleProfileActivitySelect}
          onActivityUpdate={(updatedActivity) => {
            setCalendarData(prev => prev.map(act => {
              if (updatedActivity.type === 'fit' && act.type === 'fit' && act._id === updatedActivity._id) {
                return { ...act, ...updatedActivity, title: updatedActivity.title || updatedActivity.titleManual || act.title };
              }
              if (updatedActivity.type === 'strava' && act.type === 'strava' &&
                  (act.id === updatedActivity.id || act.stravaId === updatedActivity.stravaId || act.stravaId === updatedActivity.id)) {
                return { ...act, ...updatedActivity, title: updatedActivity.title || updatedActivity.titleManual || updatedActivity.name || act.title };
              }
              return act;
            }));
            if (profileAthleteId) {
              localStorage.removeItem(`calendarData_${profileAthleteId}`);
              localStorage.removeItem(`calendarData_timestamp_${profileAthleteId}`);
            }
          }}
          onActivityDeleted={({ type, id }) => {
            setCalendarData(prev => prev.filter(act => {
              if (type === 'strava') {
                const matchById = String(act.id || '').replace(/^strava-/, '') === String(id);
                const matchByStravaId = String(act.stravaId || '') === String(id);
                return !(act.type === 'strava' && (matchById || matchByStravaId));
              }
              return true;
            }));
            if (profileAthleteId) {
              localStorage.removeItem(`calendarData_${profileAthleteId}`);
              localStorage.removeItem(`calendarData_timestamp_${profileAthleteId}`);
            }
          }}
          onAddCompletedWorkout={() => {
            if (profileAthleteId) {
              localStorage.removeItem(`calendarData_${profileAthleteId}`);
              localStorage.removeItem(`calendarData_timestamp_${profileAthleteId}`);
            }
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
            const dateOnly = String(pw.date || '').slice(0, 10);
            const d = dateOnly ? new Date(`${dateOnly}T12:00:00`) : new Date();
            setPlanModal({ date: isNaN(d.getTime()) ? new Date() : d, workout: pw });
          }}
          onStartWorkout={(pw) => navigate(`/workout-execution/${pw._id}`)}
          onCopyPlannedWorkout={handleProfileCopyPlan}
          onDeletePlannedWorkout={handleProfilePlanDelete}
          onAddTraining={() => setIsTrainingFormOpen(true)}
          onPlannedSaved={(saved) => setPlannedWorkouts(prev => upsertPlannedWorkoutList(prev, saved))}
        />
      </motion.div>

      <AnimatePresence>
        {isEditModalOpen && (
          <EditProfileModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onSubmit={handleProfileUpdate}
            userData={{ ...userInfo, _selectedSport: selectedZoneSport }}
          />
        )}
        {isZonesModalOpen && (
          <EditProfileModal
            isOpen={isZonesModalOpen}
            onClose={() => setIsZonesModalOpen(false)}
            onSubmit={handleProfileUpdate}
            zonesOnly={true}
            userData={{ ...userInfo, _selectedSport: selectedZoneSport }}
          />
        )}
        {isPasswordModalOpen && (
          <ChangePasswordModal
            isOpen={isPasswordModalOpen}
            onClose={() => setIsPasswordModalOpen(false)}
          />
        )}
      </AnimatePresence>

      <UpgradeModal {...UpgradeModalProps} />

      {planModal && (
        <WorkoutPlanModal
          date={planModal.date}
          workout={planModal.workout}
          onClose={() => setPlanModal(null)}
          onSave={handleProfilePlanSave}
          onDelete={handleProfilePlanDelete}
        />
      )}

      {isTrainingFormOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
            <TrainingForm
              onClose={() => setIsTrainingFormOpen(false)}
              onSubmit={handleProfileAddTraining}
            />
          </div>
        </div>,
        document.body
      )}
    </motion.div>
  );
};

export default ProfilePage;