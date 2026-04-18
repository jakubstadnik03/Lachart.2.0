import React, { useState } from "react";
import TrainingItem from "./TrainingItem";
import TrainingForm from "../TrainingForm";
import { deleteTraining, updateTraining } from "../../services/api";
import { useTrainings } from "../../context/TrainingContext"; // Předpokládám, že máte kontext pro správu tréninků
import { useNotification } from "../../context/NotificationContext"; // Přidáme import pro notifikace
import { prepareTrainingForLactateEntry } from "../../utils/trainingLactateModal";

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

const UserTrainingsTable = ({ trainings = [], onTrainingUpdate }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });
  const [trainingToEdit, setTrainingToEdit] = useState(null);
  const [trainingToDelete, setTrainingToDelete] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [focusLactateOnOpen, setFocusLactateOnOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { deleteTraining: removeTrainingFromContext } = useTrainings();
  const { addNotification } = useNotification(); // Přidáme hook pro notifikace

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
        const dateA = new Date(a[config.key] || a.timestamp || a.startDate || 0);
        const dateB = new Date(b[config.key] || b.timestamp || b.startDate || 0);
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

  const hasLactateData = (training) => {
    if (!training) return false;
    if (training.lactate !== null && training.lactate !== undefined && training.lactate !== '') return true;
    if (Array.isArray(training.results) && training.results.some((r) => r?.lactate !== null && r?.lactate !== undefined && r?.lactate !== '')) return true;
    if (Array.isArray(training.laps) && training.laps.some((lap) => lap?.lactate !== null && lap?.lactate !== undefined && lap?.lactate !== '')) return true;
    return false;
  };

  const isCuratedTraining = (training) => {
    if (!training) return false;
    const hasCategory = Boolean(training.category);
    const hasLactate = hasLactateData(training);
    const isExported = Boolean(
      training.sourceStravaActivityId ||
      training.linkedTrainingId ||
      training.isFromTrainingModel
    );
    const hasManualTitle = Boolean(training.titleManual || training.customTitle);
    return hasCategory || hasLactate || isExported || hasManualTitle;
  };

  const curatedTrainings = trainings.filter(isCuratedTraining);
  const sortedTrainings = sortData(curatedTrainings, sortConfig);

  const filteredTrainings = sortedTrainings.filter((training) =>
    (
      training.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      training.sport?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (training.specifics?.specific || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

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
    setFocusLactateOnOpen(false);
    setTrainingToEdit(training);
    setShowEditModal(true);
  };

  const handleAddLactateTraining = (training) => {
    setFocusLactateOnOpen(true);
    setTrainingToEdit(prepareTrainingForLactateEntry(training));
    setShowEditModal(true);
  };

  const handleDeleteTraining = (training) => {
    setTrainingToDelete(training);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!trainingToDelete || !trainingToDelete._id) {
      setError("Nelze smazat trénink bez ID");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Volání API pro smazání tréninku
      await deleteTraining(trainingToDelete._id);
      
      // Aktualizace kontextu
      removeTrainingFromContext(trainingToDelete._id);
      
      // Zavřít modální okno
      setShowDeleteModal(false);
      setTrainingToDelete(null);
      
      // Zobrazit notifikaci
      addNotification(`Trénink "${trainingToDelete.title}" byl úspěšně smazán`, 'success');
      
      // Obnovit stránku po krátké prodlevě
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
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

  if (curatedTrainings.length === 0) {
    return (
      <div className="text-center text-lg font-semibold mt-5">
        No exported or categorized trainings available.
      </div>
    );
  }

  return (
    <div className="training-table rounded-2xl shadow-lg mx-auto bg-white m-5 max-w-[1600px] p-4 sm:p-5">
      <div className="mb-4 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Training Log</h2>
        <input
          type="text"
          placeholder="Find training by title"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:w-1/3 p-2 border border-gray-300 rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
          style={{ WebkitAppearance: 'none', appearance: 'none' }}
        />
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-8 gap-2 p-4 bg-gray-100 border-b border-gray-300 text-sm font-medium rounded-t-2xl">
        <div key="date-header" className="cursor-pointer" onClick={() => handleSort("date")}>
          Date {sortConfig.key === "date" && (sortConfig.direction === "asc" ? "↑" : "↓")}
        </div>
        <div key="sport-header" className="flex justify-center cursor-pointer" onClick={() => handleSort("sport")}>
          Sport {sortConfig.key === "sport" && (sortConfig.direction === "asc" ? "↑" : "↓")}
        </div>
        <div key="title-header" className="cursor-pointer" onClick={() => handleSort("title")}>
          Title {sortConfig.key === "title" && (sortConfig.direction === "asc" ? "↑" : "↓")}
        </div>
        <div key="intervals-header" className="hidden sm:block col-span-3 text-center">Intervals</div>
        <div key="terrain-header" className="hidden sm:block">Terrain</div>
        <div key="weather-header" className="hidden sm:block">Weather</div>
      </div>

      <div className="space-y-2 mt-2">
        {paginatedTrainings.map((training) => (
          <div key={training._id} className="relative group">
            <TrainingItem 
              training={{
                ...training,
                date: formatDate(training.date || training.timestamp || training.startDate)
              }}
              isExpanded={expandedItems[training._id] || false}
              onToggleExpand={() => toggleExpand(training._id)}
            />
            <div className="absolute right-4 top-4 transform flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddLactateTraining(training);
                }}
                className="p-2 text-green-700 hover:text-green-900 hover:bg-green-50 rounded-full bg-white shadow-sm"
                title="Add lactate"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation(); // Zabrání rozbalení při kliknutí na tlačítko
                  handleEditTraining(training);
                }}
                className="p-2 text-primary hover:text-primary-dark hover:bg-blue-100 rounded-full bg-white shadow-sm"
                title="Edit training"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation(); // Zabrání rozbalení při kliknutí na tlačítko
                  handleDeleteTraining(training);
                }}
                className="p-2 text-red hover:text-red-dark hover:bg-red-100 rounded-full bg-white shadow-sm"
                title="Delete training"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={Math.ceil(filteredTrainings.length / rowsPerPage)}
        onPageChange={setCurrentPage}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={setRowsPerPage}
        totalItems={filteredTrainings.length}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && trainingToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && trainingToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 p-3 bg-red-100 text-red-700 rounded-lg z-50">
            {error}
          </div>
          
          <TrainingForm 
            key={`${trainingToEdit._id}-${focusLactateOnOpen ? "lac" : "edit"}`}
            onClose={() => {
              setShowEditModal(false);
              setTrainingToEdit(null);
              setFocusLactateOnOpen(false);
              setError(null);
            }}
            onSubmit={handleEditSubmit}
            initialData={trainingToEdit}
            isEditing={true}
            isLoading={isLoading}
            focusLactateOnOpen={focusLactateOnOpen}
          />
        </div>
      )}
    </div>
  );
};

export default UserTrainingsTable;
