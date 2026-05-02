import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom";
import TrainingItem from "./TrainingItem";
import TrainingForm from "../TrainingForm";
import { deleteTraining, updateTraining, deleteFitTraining } from "../../services/api";
import { useTrainings } from "../../context/TrainingContext"; // Předpokládám, že máte kontext pro správu tréninků
import { useNotification } from "../../context/NotificationContext"; // Přidáme import pro notifikace
import { prepareTrainingForLactateEntry } from "../../utils/trainingLactateModal";
import { SearchableSelect } from "../SearchableSelect";

const Pagination = ({ currentPage, totalPages, onPageChange, rowsPerPage, onRowsPerPageChange, totalItems }) => {
  const getVisiblePages = () => {
    const pages = [];
    // Rozlišení mezi mobilem a desktopem pomocí window.innerWidth
    const isMobile = window.innerWidth < 768; // 768px je běžný breakpoint pro tablet
    const maxVisiblePages = isMobile ? 2 : 3;
    
    if (totalPages <= maxVisiblePages) {
      // Pokud je stránek málo, zobrazíme všechny
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Pokud je stránek více, zobrazíme omezený počet kolem aktuální stránky
      let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
      let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
      
      // Upravíme startPage, pokud jsme na konci
      if (endPage === totalPages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  };

  return (
    <nav className="flex flex-wrap justify-between items-center py-2.5 px-2">
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-700">Show</span>
        <div className="relative">
          <select
            value={rowsPerPage}
            onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary pr-8"
            style={{ WebkitAppearance: 'none', appearance: 'none' }}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <span className="text-sm text-gray-700">entries</span>
      </div>

      <div className="flex items-center gap-4">
        <p className="text-sm text-gray-700">
          Showing {totalItems === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, totalItems)} of {totalItems} entries
        </p>
        
        <div className="flex gap-2 items-center">
          <button
            className={`px-2 py-2 rounded-full transition-all ${currentPage === 1 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-dark'}`}
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Previous page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          
          {getVisiblePages().map((page) => (
            <button
              key={page}
              className={`w-9 h-9 rounded-full text-sm font-semibold transition-all ${currentPage === page ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          ))}
          
          <button
            className={`px-2 py-2 rounded-full transition-all ${currentPage === totalPages ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-dark'}`}
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="Next page"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
};

/**
 * Detect trainings that look like structured lactate step tests:
 *  - relevant sport (bike / run / swim)
 *  - 3+ intervals or laps
 *  - meaningful intensity variation (structured, not just easy)
 *  - no lactate data recorded yet
 */
function looksLikeLactateWorkout(training) {
  if (!training) return false;

  // Only for structured sports
  const sport = (training.sport || training.sport_type || training.type || '').toLowerCase();
  const isRelevantSport =
    sport.includes('run') ||
    sport.includes('ride') || sport.includes('cycle') || sport.includes('bike') ||
    sport.includes('swim');
  if (!isRelevantSport) return false;

  // Skip if lactate data is already present
  const hasLactate =
    (training.lactate != null && training.lactate !== '') ||
    (Array.isArray(training.results) && training.results.some(r => r?.lactate != null && r?.lactate !== '')) ||
    (Array.isArray(training.laps)    && training.laps.some(l    => l?.lactate != null && l?.lactate !== ''));
  if (hasLactate) return false;

  // ── Manual results: has work intervals with power ─────────────────────────
  if (Array.isArray(training.results) && training.results.length >= 3) {
    const hasWork  = training.results.some(r => r.intervalType === 'work');
    const hasPower = training.results.some(r => r.power != null && r.power !== '');
    if (hasWork && hasPower) return true;

    // No explicit type? Check for meaningful power variation
    const powers = training.results
      .map(r => Number(r.power))
      .filter(v => !isNaN(v) && v > 0);
    if (powers.length >= 3) {
      const max = Math.max(...powers);
      const min = Math.min(...powers);
      if (max > 0 && (max - min) / max > 0.15) return true;
    }
  }

  // ── FIT / Strava laps: meaningful power OR speed variation ────────────────
  if (Array.isArray(training.laps) && training.laps.length >= 4) {
    const lapPowers = training.laps
      .map(l => l.avgPower ?? l.normalizedPower ?? l.average_watts)
      .filter(v => v != null && !isNaN(Number(v)) && Number(v) > 0)
      .map(Number);

    if (lapPowers.length >= 3) {
      const max = Math.max(...lapPowers);
      const min = Math.min(...lapPowers);
      if (max > 0 && (max - min) / max > 0.20) return true;
    }

    // Run / swim: use speed variation
    const lapSpeeds = training.laps
      .map(l => l.avgSpeed ?? l.average_speed)
      .filter(v => v != null && !isNaN(Number(v)) && Number(v) > 0)
      .map(Number);

    if (lapSpeeds.length >= 3) {
      const max = Math.max(...lapSpeeds);
      const min = Math.min(...lapSpeeds);
      if (max > 0 && (max - min) / max > 0.15) return true;
    }
  }

  return false;
}

const UserTrainingsTable = ({ trainings = [], onTrainingUpdate }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });
  const [trainingToEdit, setTrainingToEdit] = useState(null);
  const [trainingToDelete, setTrainingToDelete] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { deleteTraining: removeTrainingFromContext } = useTrainings();
  const { addNotification } = useNotification(); // Přidáme hook pro notifikace

  // Filter state — default to showing only "exported / curated" trainings
  const [showExportedOnly, setShowExportedOnly] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSport,    setFilterSport]    = useState('all');

  /** A training is "curated" if it has been exported, categorised, has lactate, or has a manual title. */
  const isCurated = (t) => {
    if (!t) return false;

    const hasTitle    = Boolean(t.title && t.title.trim() && t.title.trim().toLowerCase() !== 'untitled');
    const hasResults  = Array.isArray(t.results) && t.results.length > 0;
    const hasLaps     = Array.isArray(t.laps)    && t.laps.length > 0;
    const hasData     = hasResults || hasLaps;
    const hasCategory = Boolean(t.category);
    const hasManualTitle = Boolean(t.titleManual || t.customTitle);
    const hasLactate  = (
      (t.lactate != null && t.lactate !== '') ||
      (hasResults && t.results.some(r => r?.lactate != null && r?.lactate !== '')) ||
      (hasLaps    && t.laps.some(l    => l?.lactate != null && l?.lactate !== ''))
    );
    const isLinked = Boolean(t.sourceStravaActivityId || t.linkedTrainingId || t.isFromTrainingModel);

    // Always discard: no real title AND no interval/lap data at all
    if (!hasTitle && !hasData) return false;

    // Has a real title → show if it also has at least one other signal
    // (category, lactate, linked, or actual data)
    if (hasTitle) return hasData || hasCategory || hasLactate || isLinked || hasManualTitle;

    // Untitled: only show if it has actual interval/lap data
    return hasData && (hasCategory || hasLactate || isLinked);
  };

  /** Detect the storage type of a training to call the right delete endpoint. */
  const getTrainingType = (t) => {
    if (!t) return 'unknown';
    if (t.stravaId || t.sport_type) return 'strava';          // StravaActivity has stravaId / sport_type
    if (t.titleAuto !== undefined || t.manufacturer !== undefined) return 'fit'; // FitTraining fields
    if (t.sourceStravaActivityId && !t._id) return 'strava';
    return 'manual';
  };

  // Přidáme nový state pro sledování rozbalených položek
  const [expandedItems, setExpandedItems] = useState({});

  // Funkce pro přepínání rozbalení položky
  const toggleExpand = (trainingId) => {
    setExpandedItems(prev => ({
      ...prev,
      [trainingId]: !prev[trainingId]
    }));
  };

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  const sortData = (trainings, config) => {
    return [...trainings].sort((a, b) => {
      if (config.key === 'date') {
        const dateA = new Date(a.date || a.startDate || a.start_date || a.startTime || a.timestamp || 0);
        const dateB = new Date(b.date || b.startDate || b.start_date || b.startTime || b.timestamp || 0);
        const tsA = Number.isNaN(dateA.getTime()) ? 0 : dateA.getTime();
        const tsB = Number.isNaN(dateB.getTime()) ? 0 : dateB.getTime();
        return config.direction === "asc" 
          ? tsA - tsB 
          : tsB - tsA;
      }

      const aValue = a[config.key] ?? "";
      const bValue = b[config.key] ?? "";
      
      if (aValue < bValue) return config.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return config.direction === "asc" ? 1 : -1;
      return 0;
    });
  };

  // Derive unique categories and sports from the incoming trainings
  const availableCategories = useMemo(() => {
    const cats = new Set();
    trainings.forEach(t => { if (t.category) cats.add(t.category); });
    return Array.from(cats).sort();
  }, [trainings]);

  const availableSports = useMemo(() => {
    const set = new Set();
    trainings.forEach(t => {
      const s = (t.sport || t.sport_type || t.type || '').toLowerCase();
      if (!s) return;
      // Normalise to top-level bucket
      if (s.includes('run'))    set.add('run');
      else if (s.includes('ride') || s.includes('cycle') || s.includes('bike')) set.add('bike');
      else if (s.includes('swim')) set.add('swim');
      else set.add(s);
    });
    return Array.from(set).sort();
  }, [trainings]);

  // ── Previous same-title training map (for inline comparison) ──────────────
  // For each training, find the most-recent earlier training with the same title
  // that also has interval/lap data. O(n²) but n is typically small (≤200).
  const prevTrainingMap = useMemo(() => {
    const map = {};
    trainings.forEach(t => {
      const title = (t.title || t.titleManual || t.name || t.titleAuto || '').trim().toLowerCase();
      if (!title || title === 'untitled') return;
      const tMs = new Date(t.date || t.startDate || t.start_date || t.timestamp || t.createdAt || 0).getTime();
      if (!tMs) return;

      const prev = trainings
        .filter(other => {
          if (other._id === t._id) return false;
          const oTitle = (other.title || other.titleManual || other.name || other.titleAuto || '').trim().toLowerCase();
          if (oTitle !== title) return false;
          const hasData = (Array.isArray(other.results) && other.results.length > 0)
                       || (Array.isArray(other.laps)    && other.laps.length    > 0);
          if (!hasData) return false;
          const oMs = new Date(other.date || other.startDate || other.start_date || other.timestamp || other.createdAt || 0).getTime();
          return oMs < tMs;
        })
        .sort((a, b) => {
          const dA = new Date(a.date || a.startDate || a.start_date || a.timestamp || a.createdAt || 0).getTime();
          const dB = new Date(b.date || b.startDate || b.start_date || b.timestamp || b.createdAt || 0).getTime();
          return dB - dA; // most recent first
        });

      if (prev.length > 0) map[t._id] = prev[0];
    });
    return map;
  }, [trainings]);

  const sortedTrainings = sortData(trainings, sortConfig);

  const filteredTrainings = useMemo(() => {
    return sortedTrainings.filter((training) => {
      // exported-only toggle
      if (showExportedOnly && !isCurated(training)) return false;
      // text search
      const q = searchQuery.toLowerCase();
      if (q && !(
        (training.title || training.name || training.titleManual || training.titleAuto || '').toLowerCase().includes(q) ||
        (training.sport || training.sport_type || training.type || '').toLowerCase().includes(q) ||
        (training.specifics?.specific || '').toLowerCase().includes(q)
      )) return false;
      // category chip
      if (filterCategory !== 'all') {
        if (filterCategory === 'none' && training.category) return false;
        if (filterCategory !== 'none' && training.category !== filterCategory) return false;
      }
      // sport chip
      if (filterSport !== 'all') {
        const s = (training.sport || training.sport_type || training.type || '').toLowerCase();
        if (filterSport === 'run'  && !s.includes('run'))  return false;
        if (filterSport === 'bike' && !s.includes('ride') && !s.includes('cycle') && !s.includes('bike')) return false;
        if (filterSport === 'swim' && !s.includes('swim')) return false;
        if (!['run','bike','swim'].includes(filterSport) && !s.includes(filterSport)) return false;
      }
      return true;
    });
  }, [sortedTrainings, searchQuery, filterCategory, filterSport, showExportedOnly]);

  const handleSort = (key) => {
    setSortConfig((prevConfig) => {
      const direction = prevConfig.key === key && prevConfig.direction === "asc" ? "desc" : "asc";
      return { key, direction };
    });
  };

  const paginatedTrainings = filteredTrainings.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const handleEditTraining = (training) => {
    setTrainingToEdit(training);
    setShowEditModal(true);
  };

  const handleAddLactateTraining = (training) => {
    setTrainingToEdit(prepareTrainingForLactateEntry(training));
    setShowEditModal(true);
  };

  const handleDeleteTraining = (training) => {
    setTrainingToDelete(training);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!trainingToDelete) {
      setError("Nelze smazat trénink bez dat");
      return;
    }

    const trainingType = getTrainingType(trainingToDelete);
    const id = trainingToDelete._id;

    // Strava activities can't be deleted from LaChart (they live on Strava)
    if (trainingType === 'strava') {
      setError("Strava aktivity nelze smazat z LaChart — odstraňte je přímo na Strava.cz");
      return;
    }

    if (!id) {
      setError("Nelze smazat trénink bez ID");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (trainingType === 'fit') {
        await deleteFitTraining(id);
      } else {
        await deleteTraining(id);
      }

      removeTrainingFromContext(id);
      setShowDeleteModal(false);
      setTrainingToDelete(null);
      addNotification(`Trénink "${trainingToDelete.title || 'Untitled'}" byl úspěšně smazán`, 'success');

      setTimeout(() => { window.location.reload(); }, 1000);

    } catch (error) {
      console.error("Error deleting training:", error);
      setError("Nepodařilo se smazat trénink. " + (error.response?.data?.message || error.message));
      addNotification("Nepodařilo se smazat trénink", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditSubmit = async (updatedTraining) => {
    console.log('Edit submission started in UserTrainingsTable');
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Training data to update:', updatedTraining);
      
      // Volání API pro aktualizaci tréninku
      await updateTraining(updatedTraining._id, updatedTraining);
      console.log('API call successful');
      
      // Aktualizace kontextu nebo znovu načtení dat
      if (onTrainingUpdate) {
        await onTrainingUpdate();
      }
      
      // Zavření modálního okna
      setShowEditModal(false);
      setTrainingToEdit(null);
      
    } catch (error) {
      console.error("Error updating training:", error);
      setError("Nepodařilo se aktualizovat trénink. " + (error.response?.data?.message || error.message));
    } finally {
      setIsLoading(false);
    }
  };

  if (!trainings || trainings.length === 0) {
    return <div className="text-center text-lg font-semibold mt-5">No trainings available.</div>;
  }

  return (
    <div className="rounded-2xl shadow-lg mx-auto bg-white m-5 max-w-[1600px] p-4 sm:p-5">
      {/* ── Header bar ── */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Training Log</h2>
          <span className="hidden sm:inline-block text-xs text-gray-400 bg-gray-100 rounded-full px-2.5 py-0.5">
            {filteredTrainings.length} sessions
          </span>
          {/* Exported-only toggle */}
          <button
            onClick={() => { setShowExportedOnly(v => !v); setCurrentPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              showExportedOnly
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
            title={showExportedOnly ? 'Showing exported / curated trainings only — click to show all' : 'Showing all trainings — click to show only exported'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
            </svg>
            {showExportedOnly ? 'Exported only' : 'All trainings'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort buttons */}
          <div className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {[
              { key: 'date',  label: 'Date' },
              { key: 'sport', label: 'Sport' },
              { key: 'title', label: 'Title' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleSort(key)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  sortConfig.key === key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
                {sortConfig.key === key && (
                  <span className="ml-1 opacity-60">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search trainings…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full sm:w-56 pl-8 pr-3 py-1.5 border border-gray-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary relative"
            style={{ WebkitAppearance: 'none', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='%239ca3af' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: '0.6rem center', backgroundSize: '1rem' }}
          />
        </div>
      </div>

      {/* ── Filter chips ── */}
      {(availableSports.length > 1 || availableCategories.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {/* Sport chips — Bike / Run / Swim first, rest in a "More" dropdown */}
          {availableSports.length > 1 && (() => {
            const PRIORITY = ['bike', 'run', 'swim'];
            const SPORT_ICONS = { bike: '/icon/bike.svg', run: '/icon/run.svg', swim: '/icon/swim.svg' };
            const LABELS   = { bike: 'Bike', run: 'Run', swim: 'Swim' };
            const prioritySports = PRIORITY.filter(s => availableSports.includes(s));
            const otherSports    = availableSports.filter(s => !PRIORITY.includes(s));
            const isOtherActive  = filterSport !== 'all' && !PRIORITY.includes(filterSport);

            const chipCls = (active) =>
              `flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                active
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`;

            return (
              <div className="flex items-center gap-1 flex-wrap">
                {/* All sports */}
                <button onClick={() => { setFilterSport('all'); setCurrentPage(1); }} className={chipCls(filterSport === 'all')}>
                  All sports
                </button>

                {/* Bike · Run · Swim */}
                {prioritySports.map(key => (
                  <button key={key} onClick={() => { setFilterSport(key); setCurrentPage(1); }} className={chipCls(filterSport === key)}>
                    <img src={SPORT_ICONS[key]} alt={key} className={`w-4 h-4 flex-shrink-0 ${filterSport === key ? 'brightness-0 invert' : ''}`} />
                    {LABELS[key]}
                  </button>
                ))}

                {/* Other sports — compact searchable dropdown */}
                {otherSports.length > 0 && (
                  <SearchableSelect
                    value={isOtherActive ? filterSport : ''}
                    onChange={(val) => { setFilterSport(val || 'all'); setCurrentPage(1); }}
                    options={otherSports.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
                    placeholder={isOtherActive
                      ? filterSport.charAt(0).toUpperCase() + filterSport.slice(1)
                      : 'More…'}
                  />
                )}
              </div>
            );
          })()}

          {/* Divider */}
          {availableSports.length > 1 && availableCategories.length > 0 && (
            <div className="h-5 w-px bg-gray-200" />
          )}

          {/* Category chips */}
          {availableCategories.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { key: 'all',  label: 'All categories', color: null },
                ...availableCategories.map(c => ({
                  key: c,
                  label: c.charAt(0).toUpperCase() + c.slice(1),
                  color: { endurance: '#4299e1', tempo: '#f6ad55', threshold: '#ed8936', vo2max: '#e53e3e', anaerobic: '#9f7aea', recovery: '#68d391' }[c] || '#9ca3af',
                })),
                { key: 'none', label: 'No category', color: '#e5e7eb' },
              ].map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => { setFilterCategory(key); setCurrentPage(1); }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                    filterCategory === key
                      ? 'text-white border-transparent'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  }`}
                  style={filterCategory === key && color ? { backgroundColor: color, borderColor: color } : {}}
                >
                  {filterCategory === key && color && key !== 'all' && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/70 mr-1 mb-px" />
                  )}
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Active filter count badge */}
          {(filterSport !== 'all' || filterCategory !== 'all') && (
            <button
              onClick={() => { setFilterSport('all'); setFilterCategory('all'); setCurrentPage(1); }}
              className="ml-1 px-2 py-0.5 text-[10px] font-medium text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ── Column hint bar (desktop only) ── */}
      <div className="hidden md:flex items-center px-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-300" style={{ gap: 16 }}>
        <div style={{ minWidth: 180, maxWidth: 240, flexShrink: 0 }}>Activity</div>
        {/* 3 metric cols — same flex:1 1 0 as in TrainingItem */}
        <div className="flex-1 flex" style={{ gap: 0 }}>
          <span style={{ flex: '1 1 0', textAlign: 'center' }}>Power / Pace</span>
          <span style={{ flex: '1 1 0', textAlign: 'center' }}>Heart Rate</span>
          <span style={{ flex: '1 1 0', textAlign: 'center' }}>Lactate</span>
        </div>
        <div style={{ width: 180, flexShrink: 0, textAlign: 'center' }}>Skyline</div>
        <div style={{ width: 24, flexShrink: 0 }} />
      </div>

      {filteredTrainings.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-400">
          No trainings match the current filters.{' '}
          <button className="underline hover:text-gray-600" onClick={() => { setFilterSport('all'); setFilterCategory('all'); setSearchQuery(''); setShowExportedOnly(false); setCurrentPage(1); }}>
            Clear all filters
          </button>
        </div>
      )}

      <div className="space-y-2">
        {paginatedTrainings.map((training) => {
          const suggestLactate = looksLikeLactateWorkout(training);
          return (
            <div key={training._id} className="relative group">
              <TrainingItem
                training={{
                  ...training,
                  date: formatDate(training.date || training.startDate || training.start_date || training.startTime || training.timestamp)
                }}
                isExpanded={expandedItems[training._id] || false}
                onToggleExpand={() => toggleExpand(training._id)}
                prevTraining={prevTrainingMap[training._id] || null}
              />

              {/* ── Smart lactate suggestion banner ── */}
              {suggestLactate && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleAddLactateTraining(training); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border-x border-b border-amber-200 transition-colors"
                  style={{ marginTop: -2, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
                >
                  {/* Droplet / lactate icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  <span className="flex-1 text-left">Structured workout — looks like you measured lactate. Add measurements?</span>
                  <span className="flex items-center gap-1 text-amber-600 font-semibold shrink-0">
                    Add lactate
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </button>
              )}

              {/* ── Hover action buttons (desktop) ── */}
              <div className={`absolute right-4 top-4 flex gap-2 transition-opacity z-10 ${suggestLactate ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                {/* Add lactate — always shown on hover; suggestion banner handles mobile */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleAddLactateTraining(training); }}
                  className="p-2 text-green-700 hover:text-green-900 hover:bg-green-50 rounded-full bg-white shadow-sm"
                  title="Add lactate"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleEditTraining(training); }}
                  className="p-2 text-primary hover:text-primary-dark hover:bg-blue-100 rounded-full bg-white shadow-sm"
                  title="Edit training"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteTraining(training); }}
                  className="p-2 text-red hover:text-red-dark hover:bg-red-100 rounded-full bg-white shadow-sm"
                  title="Delete training"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(filteredTrainings.length / rowsPerPage)}
        onPageChange={setCurrentPage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={setRowsPerPage}
        totalItems={filteredTrainings.length}
      />

      {/* Delete Confirmation Modal — portaled to body so it covers NativeLayout header/tabs on iOS */}
      {showDeleteModal && trainingToDelete && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Delete Training</h3>
            <p className="mb-6">
              Are you sure you want to delete the training "{trainingToDelete.title}" from {formatDate(trainingToDelete.date)}?
              This action cannot be undone.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-4">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setTrainingToDelete(null);
                  setError(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-red-300"
                disabled={isLoading}
              >
                {isLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Modal — portaled to body so it covers NativeLayout header/tabs on iOS */}
      {showEditModal && trainingToEdit && ReactDOM.createPortal(
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ zIndex: 99998 }}
        >
          <div className="w-full sm:max-w-2xl">
            <TrainingForm
              key={trainingToEdit._id}
              onClose={() => {
                setShowEditModal(false);
                setTrainingToEdit(null);
                setError(null);
              }}
              onSubmit={handleEditSubmit}
              initialData={trainingToEdit}
              isEditing={true}
              isLoading={isLoading}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default UserTrainingsTable;
