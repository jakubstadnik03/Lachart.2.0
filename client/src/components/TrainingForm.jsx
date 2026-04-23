"use client";

import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { getTrainingTitles } from "../services/api";
import { useNotification } from '../context/NotificationContext';
import { mapSportForTrainingForm } from "../utils/trainingLactateModal";
import LapsBarChart from "./FitAnalysis/LapsBarChart";

const ACTIVITIES = [
  {
    id: "swim",
    label: "Swim",
    icon: "/icon/swim.svg"
  },
  {
    id: "bike",
    label: "Bike",
    icon: "/icon/bike.svg"
  },
  {
    id: "run",
    label: "Run",
    icon: "/icon/run.svg"
  }
];

const TERRAIN_OPTIONS = {
  bike: ["track", "road", "trail", "indoor"],
  run: ["track", "road", "trail", "indoor"],
  swim: []
};

const WEATHER_OPTIONS = ["sunny", "indoor", "rainy", "windy"];
const CATEGORY_OPTIONS = ["endurance", "tempo", "threshold", "vo2max", "anaerobic", "recovery", "hills"];

/** Pace/duration display: avoid float garbage (e.g. 14.699999999999989) from JS % and division. */
const formatSecondsToMMSS = (seconds) => {
  if (seconds === null || seconds === undefined || seconds === "") return "";
  if (typeof seconds === "string" && seconds.includes(":")) {
    const parts = seconds.split(":");
    if (parts.length >= 2) {
      const m = parseInt(parts[0], 10) || 0;
      const s = parseFloat(parts[1]) || 0;
      const total = Math.round(m * 60 + s);
      const M = Math.floor(total / 60);
      const S = total % 60;
      return `${String(M).padStart(2, "0")}:${String(S).padStart(2, "0")}`;
    }
  }
  const n = typeof seconds === "string" ? parseFloat(seconds) : Number(seconds);
  if (!Number.isFinite(n) || n < 0) return "";
  const total = Math.round(n);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

/** Interval type config — used in auto-detection and interval cards UI */
const INTERVAL_TYPES = [
  { id: 'work',     label: 'Work',      shortLabel: 'Work', icon: '⚡', bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  { id: 'warmup',   label: 'Warm-up',   shortLabel: 'WU',   icon: '↑',  bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200' },
  { id: 'cooldown', label: 'Cool-down', shortLabel: 'CD',   icon: '↓',  bg: 'bg-sky-100',    text: 'text-sky-700',    border: 'border-sky-200' },
  { id: 'recovery', label: 'Rest',      shortLabel: 'Rest', icon: '↩',  bg: 'bg-gray-100',   text: 'text-gray-500',   border: 'border-gray-200' },
];

/** Parse raw seconds from a form result (durationSeconds or MM:SS string). */
function parseIntervalDurSec(r) {
  if (!r) return 0;
  const ds = Number(r.durationSeconds);
  if (ds > 0) return ds;
  if (!r.duration) return 0;
  if (typeof r.duration === 'number') return r.duration;
  const parts = String(r.duration).split(':');
  if (parts.length === 2) return (parseInt(parts[0], 10) || 0) * 60 + (parseFloat(parts[1]) || 0);
  if (parts.length === 3) return (parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60 + (parseFloat(parts[2]) || 0);
  return parseFloat(String(r.duration)) || 0;
}

/**
 * Auto-classify results into warmup / work / recovery / cooldown.
 * Only sets intervalType on rows that don't already have it set.
 * Migrates legacy isRecovery:true → intervalType:'recovery'.
 */
function autoDetectIntervalTypes(results) {
  if (!results || results.length === 0) return results;

  // Migrate legacy isRecovery and keep manually-set types
  const migrated = results.map(r => ({
    ...r,
    intervalType: r.intervalType || (r.isRecovery ? 'recovery' : undefined),
  }));

  // If everything is already classified don't touch it
  if (migrated.every(r => r.intervalType)) return migrated;

  // ── Distance clustering (best for swim/run by distance) ─────────────────
  const withDist = migrated.map((r, i) => {
    const raw = r.distanceMeters ?? r.distance;
    const n = Number(raw);
    return { i, dist: Number.isFinite(n) && n > 0 ? n : null };
  });
  const distVals = withDist.map(x => x.dist).filter(Boolean);
  let workSet = new Set();

  if (distVals.length >= 2) {
    const sorted = [...distVals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const matched = withDist.filter(x => x.dist && Math.abs(x.dist - median) / median <= 0.25);
    if (matched.length >= 2 && matched.length < migrated.length) {
      matched.forEach(x => workSet.add(x.i));
    }
  }

  // ── Duration clustering fallback ─────────────────────────────────────────
  if (workSet.size === 0) {
    const withDur = migrated.map((r, i) => ({ i, dur: parseIntervalDurSec(r) }));
    const durVals = withDur.map(x => x.dur).filter(d => d > 0);
    if (durVals.length >= 2) {
      const sorted = [...durVals].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const matched = withDur.filter(x => x.dur > 0 && Math.abs(x.dur - median) / median <= 0.35);
      if (matched.length >= 2 && matched.length < migrated.length) {
        matched.forEach(x => workSet.add(x.i));
      }
    }
  }

  // No cluster found → all work
  if (workSet.size === 0) {
    return migrated.map(r => ({ ...r, intervalType: r.intervalType || 'work' }));
  }

  const firstWork = Math.min(...workSet);
  const lastWork  = Math.max(...workSet);

  return migrated.map((r, i) => {
    if (r.intervalType) return r;                           // already set manually
    if (workSet.has(i)) return { ...r, intervalType: 'work' };
    if (i < firstWork)  return { ...r, intervalType: 'warmup' };
    if (i > lastWork)   return { ...r, intervalType: 'cooldown' };
    return { ...r, intervalType: 'recovery' };
  });
}

const TrainingForm = ({
  onClose,
  onSubmit,
  initialData = null,
  isEditing = false,
  isLoading = false,
  initialSelectedLap = null,
}) => {
  const { addNotification } = useNotification();
  const [formData, setFormData] = useState(initialData || {
    sport: "bike",
    type: "interval",
    category: "",
    title: "",
    customTitle: "",
    description: "",
    date: new Date().toISOString().slice(0, 16),
    specifics: {
      specific: "",
      weather: "",
      customSpecific: "",
      customWeather: ""
    },
    results: []
  });

  const [trainingTitles, setTrainingTitles] = useState([]);
  const [isCustomTitle, setIsCustomTitle] = useState(initialData?.customTitle ? true : false);
  const [isCustomWeather, setIsCustomWeather] = useState(initialData?.specifics?.customWeather ? true : false);
  const [isCustomSpecific, setIsCustomSpecific] = useState(initialData?.specifics?.customSpecific ? true : false);
  const [editingIntervalIndex, setEditingIntervalIndex] = useState(null);
  const [tempRepeatCount, setTempRepeatCount] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [specificsOpen, setSpecificsOpen] = useState(false);
  const [selectedChartLap, setSelectedChartLap] = useState(null);
  const [typePickerOpenIdx, setTypePickerOpenIdx] = useState(null);
  const intervalRefs = useRef([]);
  const scrollBodyRef = useRef(null);
  const chartPanelRef = useRef(null);
  /** Format raw seconds → "M:SS" or "H:MM:SS" */
  const fmtDur = (val) => {
    const n = typeof val === "string" ? parseFloat(val) : Number(val);
    if (!Number.isFinite(n) || n <= 0) return "—";
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const s = Math.round(n % 60);
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    return `${m}:${String(s).padStart(2,"0")}`;
  };

  useEffect(() => {
    const loadTrainingTitles = async () => {
      try {
        const titles = await getTrainingTitles();
        setTrainingTitles(titles || []);
      } catch (error) {
        console.error("Error loading training titles:", error);
        setTrainingTitles([]);
      }
    };
    loadTrainingTitles();
  }, []);

  useEffect(() => {
    if (!initialData) return;
    const sportKey = mapSportForTrainingForm(initialData.sport);
    console.log("Editing training:", initialData);
    const rawResults = Array.isArray(initialData.results) ? initialData.results : [];
    const showPace = sportKey === "run" || sportKey === "swim";

    const formattedData = {
      ...initialData,
      sport: sportKey,
      date: new Date(initialData.date).toISOString().slice(0, 16),
      results: rawResults.map((result) => {
        let powerValue = result.power;
        if (
          showPace &&
          result.power !== undefined &&
          result.power !== null &&
          result.power !== ""
        ) {
          if (typeof result.power === "string" && result.power.includes(":")) {
            powerValue = formatSecondsToMMSS(result.power);
          } else {
            const seconds =
              typeof result.power === "string" ? parseFloat(result.power) : result.power;
            powerValue = formatSecondsToMMSS(seconds);
          }
        }

        const durType = result.durationType || "time";
        let durationValue = result.duration;
        if (
          durType === "time" &&
          result.duration !== undefined &&
          result.duration !== null &&
          result.duration !== ""
        ) {
          if (typeof result.duration === "string" && result.duration.includes(":")) {
            durationValue = formatSecondsToMMSS(result.duration);
          } else {
            const seconds =
              typeof result.duration === "string" ? parseFloat(result.duration) : result.duration;
            durationValue = formatSecondsToMMSS(seconds);
          }
        }

        const rawElev =
          result.elevation ?? result.total_elevation_gain ?? result.elevation_gain;
        let elevationDisp = "";
        if (rawElev !== undefined && rawElev !== null && rawElev !== "") {
          const e = Number(rawElev);
          if (Number.isFinite(e)) elevationDisp = String(Math.round(e));
        }

        return {
          ...result,
          durationType: durType,
          power: powerValue,
          duration: durationValue,
          elevation: elevationDisp,
          repeatCount: result.repeatCount ?? 1,
          distanceMeters: result.distanceMeters ?? undefined,
        };
      }),
    };
    setFormData({
      ...formattedData,
      results: autoDetectIntervalTypes(formattedData.results),
    });
  }, [initialData]);

  const handlePaceChange = (index, value) => {
    // Povolíme pouze čísla a dvojtečku
    const cleanValue = value.replace(/[^\d:]/g, '');

    // Automatické formátování
    let formattedValue = cleanValue;

    // Pokud uživatel zadá číslo bez dvojtečky
    if (cleanValue.length > 0 && !cleanValue.includes(':')) {
      // Přidáme dvojtečku po druhém čísle
      if (cleanValue.length >= 2) {
        formattedValue = `${cleanValue.slice(0, 2)}:${cleanValue.slice(2, 4)}`;
      }
    }

    // Validace formátu MM:SS
    const paceRegex = /^([0-5]?[0-9]):?([0-5]?[0-9])?$/;
    if (formattedValue && !paceRegex.test(formattedValue)) return;

    const newResults = [...formData.results];
    newResults[index].power = formattedValue;
    setFormData(prev => ({ ...prev, results: newResults }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    try {
      const dataToSubmit = { ...formData };

      // Rozepsání opakujících se intervalů
      if (dataToSubmit.results) {
        const expandedResults = [];
        dataToSubmit.results.forEach((interval, index) => {
          const repeatCount = parseInt(interval.repeatCount) || 1;
          for (let i = 0; i < repeatCount; i++) {
            expandedResults.push({
              ...interval,
              interval: expandedResults.length + 1,
              repeatCount: undefined // Odstraníme pole repeatCount z rozepsaných intervalů
            });
          }
        });
        dataToSubmit.results = expandedResults;
      }

      // Převod pace na sekundy pro run a swim
      if ((formData.sport === 'run' || formData.sport === 'swim') && dataToSubmit.results) {
        dataToSubmit.results = dataToSubmit.results.map(interval => {
          const updatedInterval = { ...interval };

          // Převod power (pace) z MM:SS na sekundy
          if (interval.power && interval.power.includes(':')) {
            const parts = interval.power.split(':');
            const minutes = parseInt(parts[0], 10) || 0;
            const seconds = parseFloat(parts[1]) || 0;
            updatedInterval.power = String(Math.round(minutes * 60 + seconds));
          }

          return updatedInterval;
        });
      }

      // Zpracování duration pro všechny intervaly
      if (dataToSubmit.results) {
        console.log('Processing durations before conversion:', dataToSubmit.results.map(r => ({
          interval: r.interval,
          duration: r.duration,
          durationType: r.durationType
        })));

        dataToSubmit.results = dataToSubmit.results.map(interval => {
          const updatedInterval = { ...interval };

          // Pokud je durationType "time"
          if (interval.durationType === "time") {
            // Pokud je duration prázdné, nastavíme výchozí hodnotu 0
            if (!interval.duration) {
              updatedInterval.duration = "0";
            }
            // Pokud duration obsahuje ":", převedeme na sekundy
            else if (interval.duration.includes(':')) {
              const parts = interval.duration.split(':');
              const minutes = parseInt(parts[0], 10) || 0;
              const seconds = parseFloat(parts[1]) || 0;
              updatedInterval.duration = String(Math.round(minutes * 60 + seconds));
            }
            // Pokud je zadáno pouze číslo bez dvojtečky, převedeme na sekundy
            else {
              const minutes = parseInt(interval.duration);
              if (!isNaN(minutes)) {
                updatedInterval.duration = (minutes * 60).toString();
              } else {
                updatedInterval.duration = "0";
              }
            }
          }
          // Pro distance typ, zajistíme, že máme hodnotu
          else if (interval.durationType === "distance") {
            if (!interval.duration) {
              updatedInterval.duration = "0";
            }
          }

          // Zajistíme, že duration není undefined nebo null
          if (updatedInterval.duration === undefined || updatedInterval.duration === null) {
            updatedInterval.duration = "0";
          }

          // Zajistíme, že durationType je vždy nastaven
          if (!updatedInterval.durationType) {
            updatedInterval.durationType = "time";
          }

          return updatedInterval;
        });

        console.log('Processed durations after conversion:', dataToSubmit.results.map(r => ({
          interval: r.interval,
          duration: r.duration,
          durationType: r.durationType
        })));
      }

      if (isCustomTitle && formData.customTitle) {
        dataToSubmit.title = formData.customTitle;
      }

      if (isCustomSpecific && formData.specifics.customSpecific) {
        dataToSubmit.specifics.specific = formData.specifics.customSpecific;
      }

      if (isCustomWeather && formData.specifics.customWeather) {
        dataToSubmit.specifics.weather = formData.specifics.customWeather;
      }

      // Přidáme ID pokud editujeme
      if (isEditing && initialData?._id) {
        dataToSubmit._id = initialData._id;
      }

      // Sync isRecovery from intervalType for server compatibility
      if (dataToSubmit.results) {
        dataToSubmit.results = dataToSubmit.results.map(interval => ({
          ...interval,
          isRecovery: interval.intervalType === 'recovery',
        }));
      }

      // Duration default + elevation (one pass so elevation is never skipped)
      if (dataToSubmit.results) {
        dataToSubmit.results = dataToSubmit.results.map((interval) => {
          const updatedInterval = { ...interval };
          if (!updatedInterval.duration) {
            updatedInterval.duration = "0";
          }
          if (
            updatedInterval.elevation !== undefined &&
            updatedInterval.elevation !== null &&
            updatedInterval.elevation !== ""
          ) {
            const elevation = Number(updatedInterval.elevation);
            updatedInterval.elevation = Number.isFinite(elevation)
              ? Math.round(elevation)
              : undefined;
          } else {
            delete updatedInterval.elevation;
          }
          return updatedInterval;
        });
      }

      console.log('Submitting training data:', dataToSubmit);

      await onSubmit(dataToSubmit);

      // Počkáme krátkou chvíli, aby se data stihla aktualizovat na serveru
      await new Promise(resolve => setTimeout(resolve, 500));

      addNotification(isEditing ? 'Training updated successfully' : 'Training added successfully', 'success');

      // Zavřeme formulář
      onClose();
    } catch (error) {
      console.error('Form submission error:', error);
      addNotification('Failed to save training data', 'error');
    }
  };

  const handleAddInterval = () => {
    setFormData(prev => ({
      ...prev,
      results: [
        ...prev.results,
        {
          interval: prev.results.length + 1,
          intervalType: 'work',
          power: "",
          heartRate: "",
          lactate: "",
          RPE: "",
          elevation: "",
          duration: "00:00",
          durationType: "time",
          repeatCount: 1
        }
      ]
    }));
  };

  const handleEditRepeatCount = (index) => {
    setEditingIntervalIndex(index);
    const rc = formData.results[index]?.repeatCount;
    setTempRepeatCount(rc != null && rc !== "" ? String(rc) : "1");
  };

  const handleSaveRepeatCount = () => {
    if (editingIntervalIndex !== null && tempRepeatCount) {
      const newResults = [...formData.results];
      newResults[editingIntervalIndex].repeatCount = Math.max(1, parseInt(tempRepeatCount) || 1);
      setFormData(prev => ({ ...prev, results: newResults }));
      setEditingIntervalIndex(null);
      setTempRepeatCount("");
    }
  };

  const handleCancelEditRepeatCount = () => {
    setEditingIntervalIndex(null);
    setTempRepeatCount("");
  };

  // Build chart-compatible laps from current formData.results
  const chartLaps = formData.results.map((interval, idx) => {
    const isSwim = formData.sport === 'swim';
    const isRun = formData.sport === 'run';
    let average_watts = 0;
    let average_speed = 0;
    if (formData.sport === 'bike') {
      average_watts = parseFloat(interval.power) || 0;
    } else {
      // parse MM:SS pace → m/s
      const raw = String(interval.power || '');
      const parts = raw.split(':');
      if (parts.length === 2) {
        const totalSec = (parseInt(parts[0], 10) || 0) * 60 + (parseFloat(parts[1]) || 0);
        if (totalSec > 0) average_speed = isSwim ? 100 / totalSec : 1000 / totalSec;
      }
      // Fallback: compute speed from distance / duration if pace field empty
      if (average_speed === 0 && (isRun || isSwim)) {
        const dist = parseFloat(interval.distanceMeters) || 0;
        const dur = parseFloat(interval.durationSeconds) || 0;
        if (dist > 0 && dur > 0) average_speed = dist / dur;
      }
    }
    return {
      lapNumber: idx + 1,
      average_watts,
      average_speed,
      average_heartrate: parseFloat(interval.heartRate) || 0,
      lactate: interval.lactate ? parseFloat(interval.lactate) : null,
      distance: interval.distanceMeters || 0,
      moving_time: interval.durationSeconds || 0,
      elapsed_time: interval.durationSeconds || 0,
    };
  });

  // Auto-scroll to initial lap after form data is loaded
  useEffect(() => {
    if (initialSelectedLap == null || formData.results.length === 0) return;
    const lapNum = initialSelectedLap;
    setSelectedChartLap(lapNum);
    // Wait for layout then scroll
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = intervalRefs.current[lapNum - 1];
        const scrollEl = scrollBodyRef.current;
        if (el && scrollEl) {
          const chartHeight = chartPanelRef.current?.offsetHeight || 0;
          const elRect = el.getBoundingClientRect();
          const containerRect = scrollEl.getBoundingClientRect();
          const targetScroll = scrollEl.scrollTop + (elRect.top - containerRect.top) - chartHeight - 8;
          scrollEl.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        }
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedLap, formData.results.length]);

  const handleChartSelect = (lapNumber) => {
    const next = selectedChartLap === lapNumber ? null : lapNumber;
    setSelectedChartLap(next);
    if (next != null) {
      const el = intervalRefs.current[next - 1];
      const scrollEl = scrollBodyRef.current;
      if (el && scrollEl) {
        // Use getBoundingClientRect so the sticky chart height is automatically accounted for
        requestAnimationFrame(() => {
          const chartHeight = chartPanelRef.current?.offsetHeight || 0;
          const elRect = el.getBoundingClientRect();
          const containerRect = scrollEl.getBoundingClientRect();
          const currentScroll = scrollEl.scrollTop;
          // Position the card just below the sticky chart with 8px breathing room
          const targetScroll = currentScroll + (elRect.top - containerRect.top) - chartHeight - 8;
          scrollEl.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
        });
      }
    }
  };

  /** Change one interval type and keep legacy isRecovery in sync. */
  const handleSetIntervalType = (index, type) => {
    const nextResults = [...formData.results];
    nextResults[index] = { ...nextResults[index], intervalType: type, isRecovery: type === 'recovery' };
    setFormData((prev) => ({ ...prev, results: nextResults }));
    setTypePickerOpenIdx(null);
  };

  /** Re-run interval type auto-detection from scratch. */
  const handleAutoDetect = () => {
    const cleared = formData.results.map((r) => ({ ...r, intervalType: undefined, isRecovery: false }));
    setFormData((prev) => ({ ...prev, results: autoDetectIntervalTypes(cleared) }));
  };

  // Shared input classes
  const inputBase =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary min-h-[44px]";
  const selectBase =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary appearance-none min-h-[44px] pr-8";
  const labelBase = "block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide";

  // ChevronDown inline SVG
  const ChevronDown = ({ className = "w-4 h-4" }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );

  return (
    <div
      className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl flex flex-col relative shadow-xl overflow-hidden"
      style={{ maxHeight: 'calc(95vh - env(safe-area-inset-top, 0px))' }}
    >

      {/* Drag handle — mobile only */}
      <div className="flex justify-center pt-2.5 pb-0 sm:hidden shrink-0" aria-hidden="true">
        <div className="h-1 w-10 rounded-full bg-gray-300" />
      </div>

      {/* ── Header (always visible) ── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-20">
        {/* Title */}
        <h2 className="flex-1 text-base font-semibold text-gray-900 truncate">
          {isEditing ? "Edit Training" : "New Training"}
        </h2>

        {/* Sport pills */}
        <div className="flex items-center gap-1">
          {ACTIVITIES.map((activity) => (
            <button
              key={activity.id}
              type="button"
              onClick={() => {
                const newResults = formData.results.map(result => ({
                  ...result,
                  power: activity.id === 'bike' ? result.power : formatSecondsToMMSS(result.power)
                }));
                setFormData(prev => ({
                  ...prev,
                  sport: activity.id,
                  results: newResults
                }));
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors min-h-[36px] ${
                formData.sport === activity.id
                  ? "bg-primary text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            >
              <img
                src={activity.icon}
                alt=""
                className={`w-4 h-4 ${formData.sport === activity.id ? "brightness-0 invert" : ""}`}
              />
              <span>{activity.label}</span>
            </button>
          ))}
        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-9 h-9 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div ref={scrollBodyRef} className="flex-1 overflow-y-auto min-h-0">
        <form id="training-form" noValidate onSubmit={handleFormSubmit}>

          {/* ── Top section ── */}
          <div className="px-4 pt-4 pb-2 space-y-4">

              {/* Date + Category row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelBase}>Date</label>
                  <input
                    type="datetime-local"
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    className={inputBase}
                  />
                </div>
                <div>
                  <label className={labelBase}>Category</label>
                  <div className="relative">
                    <select
                      value={formData.category || ""}
                      onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                      className={selectBase}
                    >
                      <option value="">Select</option>
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                        </option>
                      ))}
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <ChevronDown />
                    </span>
                  </div>
                </div>
              </div>

              {/* Training title */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelBase} style={{ marginBottom: 0 }}>Training title</label>
                  {!formData.title && !formData.customTitle && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 animate-pulse">
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
                      </svg>
                      Set a title
                    </span>
                  )}
                </div>
                {!isCustomTitle ? (
                  <div className="relative">
                    <select
                      value={formData.title}
                      onChange={(e) => {
                        if (e.target.value === "custom") {
                          setIsCustomTitle(true);
                        } else {
                          setFormData(prev => ({ ...prev, title: e.target.value }));
                        }
                      }}
                      className={`${selectBase} ${!formData.title ? 'border-amber-300 ring-1 ring-amber-200 focus:ring-primary focus:border-primary' : ''}`}
                    >
                      <option value="">Select training…</option>
                      {trainingTitles.map((title) => (
                        <option key={title} value={title}>{title}</option>
                      ))}
                      <option value="custom">+ Add custom title</option>
                    </select>
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <ChevronDown />
                    </span>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.customTitle}
                      onChange={(e) => setFormData(prev => ({ ...prev, customTitle: e.target.value }))}
                      placeholder="Enter custom title"
                      className={inputBase}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomTitle(false);
                        setFormData(prev => ({ ...prev, customTitle: "" }));
                      }}
                      className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-xl hover:bg-gray-100 min-h-[44px]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Description — collapsible */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDescriptionOpen(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <span>Description {formData.description ? <span className="text-primary">•</span> : null}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${descriptionOpen ? "rotate-180" : ""}`} />
                </button>
                {descriptionOpen && (
                  <div className="px-4 pb-4">
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Write some notes about this training…"
                      rows={3}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                    />
                  </div>
                )}
              </div>

              {/* Specifics — collapsible */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSpecificsOpen(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <span>
                    Specifics{" "}
                    {(formData.specifics?.specific || formData.specifics?.weather) ? <span className="text-primary">•</span> : null}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${specificsOpen ? "rotate-180" : ""}`} />
                </button>
                {specificsOpen && (
                  <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                    {/* Terrain / pool length */}
                    <div>
                      <label className={labelBase}>
                        {formData.sport === "swim" ? "Pool Length" : "Terrain"}
                      </label>
                      {!isCustomSpecific ? (
                        <div className="relative">
                          <select
                            value={formData.specifics.specific}
                            onChange={(e) => {
                              if (e.target.value === "custom") {
                                setIsCustomSpecific(true);
                              } else {
                                setFormData(prev => ({
                                  ...prev,
                                  specifics: { ...prev.specifics, specific: e.target.value }
                                }));
                              }
                            }}
                            className={selectBase}
                          >
                            <option value="">
                              Select {formData.sport === "swim" ? "pool length" : "terrain"}
                            </option>
                            {formData.sport === "swim" ? (
                              <>
                                <option value="25m">25m</option>
                                <option value="50m">50m</option>
                                <option value="custom">+ Custom length</option>
                              </>
                            ) : (
                              <>
                                {TERRAIN_OPTIONS[formData.sport]?.map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                                <option value="custom">+ Custom terrain</option>
                              </>
                            )}
                          </select>
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                            <ChevronDown />
                          </span>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={formData.specifics.customSpecific}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              specifics: { ...prev.specifics, customSpecific: e.target.value }
                            }))}
                            placeholder={`Custom ${formData.sport === "swim" ? "length" : "terrain"}`}
                            className={inputBase}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomSpecific(false);
                              setFormData(prev => ({
                                ...prev,
                                specifics: { ...prev.specifics, customSpecific: "" }
                              }));
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Weather */}
                    <div>
                      <label className={labelBase}>Weather</label>
                      {!isCustomWeather ? (
                        <div className="relative">
                          <select
                            value={formData.specifics.weather}
                            onChange={(e) => {
                              if (e.target.value === "custom") {
                                setIsCustomWeather(true);
                              } else {
                                setFormData(prev => ({
                                  ...prev,
                                  specifics: { ...prev.specifics, weather: e.target.value }
                                }));
                              }
                            }}
                            className={selectBase}
                          >
                            <option value="">Select weather</option>
                            {WEATHER_OPTIONS.map(option => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                            <option value="custom">+ Custom weather</option>
                          </select>
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                            <ChevronDown />
                          </span>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={formData.specifics.customWeather}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              specifics: { ...prev.specifics, customWeather: e.target.value }
                            }))}
                            placeholder="Custom weather"
                            className={inputBase}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIsCustomWeather(false);
                              setFormData(prev => ({
                                ...prev,
                                specifics: { ...prev.specifics, customWeather: "" }
                              }));
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

          {/* ── Laps bar chart — sticky once scrolled into view ── */}
          {formData.results.length > 0 && (
            <div ref={chartPanelRef} className="sticky top-0 z-10 bg-white border-y border-gray-100 px-4 pt-3 pb-2">
              <LapsBarChart
                laps={chartLaps}
                selectedLapNumber={selectedChartLap}
                onSelect={handleChartSelect}
                sport={formData.sport}
              />
            </div>
          )}

          {/* ── Interval cards ── */}
          <div className="px-4 pt-4 pb-4 space-y-3">

              {/* Title nudge banner — only when intervals exist but title is still empty */}
              {formData.results.length > 0 && !formData.title && !formData.customTitle && (
                <button
                  type="button"
                  onClick={() => scrollBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-medium hover:bg-amber-100 transition-colors text-left"
                >
                  <svg className="w-4 h-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                  </svg>
                  <span>Don't forget to set a training title ↑</span>
                </button>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-700">Intervals</h3>
                  {formData.results.length > 2 && (
                    <button
                      type="button"
                      onClick={handleAutoDetect}
                      title="Auto-detect warmup / work / recovery / cooldown"
                      className="text-[11px] px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors font-medium"
                    >
                      Auto-detect
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleAddInterval}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors min-h-[36px]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add interval
                </button>
              </div>

              {formData.results.map((interval, index) => {
                const itype = interval.intervalType || (interval.isRecovery ? 'recovery' : 'work');
                const tc = INTERVAL_TYPES.find(t => t.id === itype) || INTERVAL_TYPES[0];
                const isWork = itype === 'work';
                const isChartSelected = selectedChartLap === index + 1;
                const isPickerOpen = typePickerOpenIdx === index;

                /* Shared type-picker dropdown rendered inline */
                const TypePicker = () => (
                  <div className="relative" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setTypePickerOpenIdx(isPickerOpen ? null : index); }}
                      className={`text-[10px] px-2 py-0.5 rounded-lg font-semibold transition-colors ${tc.bg} ${tc.text}`}
                    >
                      {tc.icon} {tc.shortLabel} ▾
                    </button>
                    {isPickerOpen && (
                      <div className="absolute right-0 bottom-full mb-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-1 flex flex-col gap-0.5 min-w-[120px]">
                        {INTERVAL_TYPES.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); handleSetIntervalType(index, t.id); }}
                            className={`text-left text-[11px] px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${itype === t.id ? `${t.bg} ${t.text}` : 'text-gray-600 hover:bg-gray-50'}`}
                          >
                            <span>{t.icon}</span>
                            <span>{t.label}</span>
                            {itype === t.id && <span className="ml-auto opacity-50 text-[9px]">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );

                return (
                  <div
                    key={index}
                    ref={el => { intervalRefs.current[index] = el; }}
                    onFocus={() => setSelectedChartLap(index + 1)}
                    className={`rounded-xl border transition-all ${
                      !isWork
                        ? `border-dashed ${tc.border} bg-gray-50/40`
                        : isChartSelected
                          ? "border-primary bg-white shadow-md ring-2 ring-primary/20"
                          : "border-gray-200 bg-white shadow-sm"
                    }`}
                  >
                    {!isWork ? (
                      /* ── Compact row: warmup / cooldown / recovery ── */
                      <div className="flex items-center gap-2 px-3 py-1.5">
                        <span className={`text-xs shrink-0 ${tc.text}`}>{tc.icon}</span>
                        <span className={`text-[11px] font-medium shrink-0 ${tc.text}`}>
                          {tc.label} {index + 1}
                        </span>
                        {/* Duration */}
                        <div className="flex items-center gap-1 bg-gray-100 rounded px-1.5 py-0.5">
                          <span className="text-[9px] text-gray-400 uppercase leading-none shrink-0">dur</span>
                          <input
                            type="text" inputMode="numeric" placeholder="MM:SS"
                            value={interval.duration || ''}
                            onChange={(e) => {
                              const r=[...formData.results];
                              let v=e.target.value.replace(/[^\d:]/g,'');
                              if(v.length>0&&!v.includes(':')&&v.length>=2) v=`${v.slice(0,2)}:${v.slice(2,4)}`;
                              r[index].duration=v; r[index].durationType='time';
                              setFormData(p=>({...p,results:r}));
                            }}
                            className="w-12 text-[11px] text-gray-700 bg-transparent outline-none placeholder-gray-300"
                          />
                        </div>
                        {/* HR */}
                        <div className="flex items-center gap-1 bg-gray-100 rounded px-1.5 py-0.5">
                          <span className="text-[9px] text-gray-400 uppercase leading-none shrink-0">hr</span>
                          <input
                            type="number" inputMode="numeric" placeholder="—"
                            value={interval.heartRate || ''}
                            onChange={(e) => { const r=[...formData.results]; r[index].heartRate=e.target.value; setFormData(p=>({...p,results:r})); }}
                            className="w-10 text-[11px] text-gray-700 bg-transparent outline-none placeholder-gray-300"
                          />
                        </div>
                        <div className="flex-1" />
                        <TypePicker />
                        <button type="button" onClick={() => { setFormData(p=>({...p,results:p.results.filter((_,i)=>i!==index)})); }}
                          className="w-5 h-5 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors ml-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* ── Full work card ── */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                          <span className="flex-1 text-xs font-semibold text-gray-700">
                            Interval {index + 1}
                            {interval.durationSeconds > 0 && (
                              <span className="text-gray-400 font-normal ml-1.5">{fmtDur(interval.durationSeconds)}</span>
                            )}
                            {interval.distanceMeters > 0 && (
                              <span className="text-gray-400 font-normal ml-1.5">· {interval.distanceMeters}m</span>
                            )}
                          </span>
                          <TypePicker />
                          <button type="button" onClick={() => handleEditRepeatCount(index)}
                            className={`text-[10px] px-2 py-0.5 rounded-lg font-semibold ${interval.repeatCount > 1 ? "bg-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                          >×{interval.repeatCount > 1 ? interval.repeatCount : 1}</button>
                          <button type="button" onClick={() => { setFormData(p=>({...p,results:p.results.filter((_,i)=>i!==index)})); }}
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </div>

                        {/* Fields grid — 2 cols mobile, 3 on sm+ */}
                        <div className="grid gap-px bg-gray-100 rounded-b-xl overflow-hidden grid-cols-2 sm:grid-cols-3">
                          {/* Power / Pace */}
                          <div className="bg-white px-3 py-2.5">
                            <label className={labelBase}>{formData.sport === "bike" ? "Power W" : formData.sport === "swim" ? "Pace /100m" : "Pace /km"}</label>
                            {formData.sport === "bike" ? (
                              <input type="number" inputMode="numeric" placeholder="—" value={interval.power}
                                onChange={(e) => { const r=[...formData.results]; r[index].power=e.target.value; setFormData(p=>({...p,results:r})); }}
                                className="w-full text-sm text-gray-900 bg-transparent outline-none placeholder-gray-300 min-h-[36px]" />
                            ) : (
                              <input type="text" inputMode="numeric" placeholder="MM:SS" value={interval.power}
                                onChange={(e) => handlePaceChange(index, e.target.value)}
                                className="w-full text-sm text-gray-900 bg-transparent outline-none placeholder-gray-300 min-h-[36px]" />
                            )}
                          </div>
                          {/* HR */}
                          <div className="bg-white px-3 py-2.5">
                            <label className={labelBase}>HR bpm</label>
                            <input type="number" inputMode="numeric" placeholder="—" value={interval.heartRate}
                              onChange={(e) => { const r=[...formData.results]; r[index].heartRate=e.target.value; setFormData(p=>({...p,results:r})); }}
                              className="w-full text-sm text-gray-900 bg-transparent outline-none placeholder-gray-300 min-h-[36px]" />
                          </div>
                          {/* Lactate */}
                          <div className="px-3 py-2.5 bg-primary/5 border-l-2 border-primary">
                            <label className={`${labelBase} text-primary`}>Lactate</label>
                            <input id={`training-form-lactate-${index}`} type="number" inputMode="decimal" placeholder="—" value={interval.lactate}
                              onChange={(e) => { const r=[...formData.results]; r[index].lactate=e.target.value; setFormData(p=>({...p,results:r})); }}
                              className="w-full text-sm bg-transparent outline-none placeholder-gray-300 min-h-[36px] font-semibold text-primary" />
                          </div>
                          {/* RPE */}
                          <div className="bg-white px-3 py-2.5">
                            <label className={labelBase}>RPE</label>
                            <input type="number" inputMode="numeric" placeholder="—" value={interval.RPE}
                              onChange={(e) => { const r=[...formData.results]; r[index].RPE=e.target.value; setFormData(p=>({...p,results:r})); }}
                              className="w-full text-sm text-gray-900 bg-transparent outline-none placeholder-gray-300 min-h-[36px]" />
                          </div>
                          {/* Duration */}
                          <div className="bg-white px-3 py-2.5">
                            <label className={labelBase}>Duration</label>
                            <input type="text" inputMode="numeric" placeholder="MM:SS" value={interval.duration}
                              onChange={(e) => {
                                const r=[...formData.results];
                                let v=e.target.value.replace(/[^\d:]/g,'');
                                if(v.length>0&&!v.includes(':')&&v.length>=2) v=`${v.slice(0,2)}:${v.slice(2,4)}`;
                                r[index].duration=v; r[index].durationType='time';
                                setFormData(p=>({...p,results:r}));
                              }}
                              className="w-full text-sm text-gray-900 bg-transparent outline-none placeholder-gray-300 min-h-[36px]" />
                          </div>
                          {/* Distance */}
                          <div className="bg-white px-3 py-2.5">
                            <label className={labelBase}>{formData.sport === "swim" ? "Dist m" : "Dist"}</label>
                            <input type="text" inputMode="numeric" placeholder={formData.sport === "swim" ? "e.g. 400" : "e.g. 1km"}
                              value={interval.distanceMeters ? String(interval.distanceMeters) : ""}
                              onChange={(e) => {
                                const r=[...formData.results];
                                const v=e.target.value.replace(/[^\d.km\s]/g,'');
                                r[index].distanceMeters=v?parseFloat(v)||undefined:undefined;
                                setFormData(p=>({...p,results:r}));
                              }}
                              className="w-full text-sm text-gray-900 bg-transparent outline-none placeholder-gray-300 min-h-[36px]" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {formData.results.length === 0 && (
                <div className="text-center py-8 text-sm text-gray-400">
                  No intervals yet. Tap &ldquo;Add interval&rdquo; to get started.
                </div>
              )}
            </div>

          {/* Bottom spacer so sticky footer doesn't overlap last card */}
          <div className="h-2" />
        </form>
      </div>

      {/* ── Sticky footer ── */}
      <div
        className="shrink-0 bg-white border-t border-gray-100 px-4 flex gap-3"
        style={{ paddingTop: '0.75rem', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors min-h-[44px]"
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          form="training-form"
          disabled={isLoading}
          className="flex-1 px-4 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[44px]"
          style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
        >
          {isLoading ? "Saving…" : isEditing ? "Update" : "Save Training"}
        </button>
      </div>

      {/* ── Repeat-count modal — portaled so it appears above tab bar ── */}
      {editingIntervalIndex !== null && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[9999] p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs shadow-xl">
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 pb-0 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>
            <div className="px-5 pt-4 pb-4">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Repeat count</h3>
              <label className={labelBase}>Number of repetitions</label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={tempRepeatCount}
                onChange={(e) => setTempRepeatCount(e.target.value)}
                className={inputBase}
                autoFocus
              />
            </div>
            <div
              className="flex gap-2 px-5"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
            >
              <button
                type="button"
                onClick={handleCancelEditRepeatCount}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 min-h-[44px]"
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRepeatCount}
                className="flex-1 px-4 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 min-h-[44px]"
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default TrainingForm;
