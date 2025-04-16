import React, { useState } from "react";
import TrainingItem from "./TrainingItem";
import TrainingForm from "../TrainingForm";
import { deleteTraining, updateTraining } from "../../services/api";
import { useTrainings } from "../../context/TrainingContext"; // Předpokládám, že máte kontext pro správu tréninků

const Pagination = ({ currentPage, totalPages, onPageChange, rowsPerPage, onRowsPerPageChange, totalItems }) => {
  const pageNumbers = [];
  for (let i = 1; i <= totalPages; i++) {
    pageNumbers.push(i);
  }

  const getVisiblePages = () => {
    if (totalPages <= 5) return pageNumbers;
    
    if (currentPage <= 3) return pageNumbers.slice(0, 5);
    if (currentPage >= totalPages - 2) return pageNumbers.slice(totalPages - 5);
    
    return pageNumbers.slice(currentPage - 3, currentPage + 2);
  };

  return (
    <nav className="flex flex-wrap justify-between items-center py-2.5 px-2">
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-700">Show</span>
        <select
          value={rowsPerPage}
          onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
          className="border rounded px-2 py-1"
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { deleteTraining: removeTrainingFromContext } = useTrainings();

  // Přidáme nový state pro sledování rozbalených položek
  const [expandedItems, setExpandedItems] = useState({});

  const getStatusIcon = (status) => {
    const icons = {
      up: "/icon/arrow-up.svg",
      down: "/icon/arrow-down.svg",
      same: "/icon/arrow-same.svg"
    };
    return icons[status];
  };

  const getLactateStatus = (current, previous) => {
    // Převedeme prázdné hodnoty na 0
    const currentValue = current === '' || current === null || current === undefined ? 0 : Number(current);
    const previousValue = previous === '' || previous === null || previous === undefined ? 0 : Number(previous);
    
    if (previousValue === 0) return "same"; // První hodnota nemá s čím srovnat
    return currentValue > previousValue ? "up" : currentValue < previousValue ? "down" : "same";
  };

  // Funkce pro přepínání rozbalení položky
  const toggleExpand = (trainingId) => {
    setExpandedItems(prev => ({
      ...prev,
      [trainingId]: !prev[trainingId]
    }));
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  const sortData = (trainings, config) => {
    return [...trainings].sort((a, b) => {
      if (config.key === 'date') {
        const dateA = new Date(a[config.key]);
        const dateB = new Date(b[config.key]);
        return config.direction === "asc" 
          ? dateA - dateB 
          : dateB - dateA;
      }

      const aValue = a[config.key] ?? "";
      const bValue = b[config.key] ?? "";
      
      if (aValue < bValue) return config.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return config.direction === "asc" ? 1 : -1;
      return 0;
    });
  };

  const sortedTrainings = sortData(trainings, sortConfig);

  const filteredTrainings = sortedTrainings.filter((training) =>
    (training.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    training.sport?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    training.specifics?.specific?.toLowerCase().includes(searchQuery.toLowerCase()))
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
    setTrainingToEdit(training);
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
      
      // Aktualizace lokálního stavu
      const updatedTrainings = trainings.filter(training => training._id !== trainingToDelete._id);
      
      // Zavřít modální okno
      setShowDeleteModal(false);
      setTrainingToDelete(null);
      
    } catch (error) {
      console.error("Error deleting training:", error);
      setError("Nepodařilo se smazat trénink. " + (error.response?.data?.message || error.message));
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
      const response = await updateTraining(updatedTraining._id, updatedTraining);
      console.log('API call successful');
      
      // Aktualizace kontextu nebo znovu načtení dat
      if (onTrainingUpdate) {
        await onTrainingUpdate();
      }
      
      // Aktualizace lokálního stavu
      const updatedTrainings = trainings.map(training => 
        training._id === updatedTraining._id ? response : training
      );
      
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

  const renderWorkoutRow = (workout, index, array) => {
    const isLastRow = index === array.length - 1;
    const borderClass = isLastRow ? '' : 'border-solid border-b-[0.3px] border-b-[#686868]';
    
    const prevLactate = index > 0 ? array[index - 1].lactate : undefined;
    const lactateStatus = getLactateStatus(workout.lactate, prevLactate);
    const lactateIcon = lactateStatus !== "same" ? getStatusIcon(lactateStatus) : null;
  
    const efficiencyColor = lactateStatus === "down" 
      ? "text-red-700 bg-red-600"
      : lactateStatus === "up"
      ? "text-green-600 bg-green-600"
      : "text-gray-500 bg-gray-400";

    const getDurationUnit = (durationType, duration) => {
      if (!duration) return '';
      
      // Kontrola, zda hodnota obsahuje něco jiného než čísla a dvojtečku
      const hasNonNumeric = /[^\d:]/.test(duration);
      
      // Pokud obsahuje něco jiného než čísla a dvojtečku, nezobrazujeme jednotku
      if (hasNonNumeric) return '';
      
      return durationType === 'time' ? 'min' : 'm';
    };

    const formatDuration = (duration, durationType) => {
      if (!duration) return '';
      
      if (durationType === 'time') {
        // Pokud je duration ve formátu sekund, převedeme na MM:SS
        if (!duration.includes(':')) {
          const seconds = parseInt(duration);
          if (!isNaN(seconds)) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
          }
        }
        return duration;
      }
      
      return duration;
    };
  
    return (
      <div key={workout.interval} className={`grid grid-cols-6 sm:grid-cols-6 gap-1 sm:gap-2 justify-items-center w-full items-center py-1.5 ${borderClass} text-[#686868] text-sm sm:text-base`}>
        <div className="text-center w-8">{workout.interval}</div>
        <div className="text-center w-12 sm:w-16">{workout.power}</div>
        <div className="flex gap-0.5 items-center w-16">
          <img
            loading="lazy"
            src="/icon/heart-rate.svg"
            className="w-3 h-3 sm:w-4 sm:h-4"
            alt="Heart rate"
          />
          <div>{workout.heartRate}</div>
        </div>
        <div className="flex gap-0.5 items-center text-blue-500 w-12">
          <img
            loading="lazy"
            src="/icon/rpe.svg"
            className="w-3 h-3 sm:w-4 sm:h-4"
            alt="RPE"
          />
          <div>{workout.RPE}</div>
        </div>
        <div className={`flex gap-1 items-center p-1 w-12 sm:w-22 text-xs justify-center ${efficiencyColor} bg-opacity-10 rounded-md`}>
          {lactateIcon && <img
            loading="lazy"
            src={lactateIcon}
            className="w-2 h-2 sm:w-3 sm:h-3"
            alt="Lactate status"
          />}
          <div>{workout.lactate || ''}</div>
        </div>
        <div className="w-16">
          {formatDuration(workout.duration, workout.durationType)} {getDurationUnit(workout.durationType, workout.duration)}
        </div>
      </div>
    );
  };

  if (!trainings || trainings.length === 0) {
    return <div className="text-center text-lg font-semibold mt-5">No trainings available.</div>;
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
          className="w-full sm:w-1/3 p-2 border border-gray-300 rounded-2xl"
        />
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-8 gap-2 p-4 bg-gray-100 border-b border-gray-300 text-sm font-medium rounded-t-2xl">
        <div className="cursor-pointer" onClick={() => handleSort("date")}>
          Date {sortConfig.key === "date" && (sortConfig.direction === "asc" ? "↑" : "↓")}
        </div>
        <div className="flex justify-center cursor-pointer" onClick={() => handleSort("sport")}>
          Sport {sortConfig.key === "sport" && (sortConfig.direction === "asc" ? "↑" : "↓")}
        </div>
        <div className="cursor-pointer" onClick={() => handleSort("title")}>
          Title {sortConfig.key === "title" && (sortConfig.direction === "asc" ? "↑" : "↓")}
        </div>
        <div className="hidden sm:block col-span-3 text-center">Intervals</div>
        <div className="hidden sm:block">Terrain</div>
        <div className="hidden sm:block">Weather</div>
      </div>

      <div className="space-y-2 mt-2">
        {paginatedTrainings.map((training) => (
          <div key={training._id} className="relative group">
            <TrainingItem 
              training={{
                ...training,
                date: formatDate(training.date)
              }}
              isExpanded={expandedItems[training._id] || false}
              onToggleExpand={() => toggleExpand(training._id)}
            />
            <div className="absolute right-4 top-4 transform flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <button 
                onClick={(e) => {
                  e.stopPropagation(); // Zabrání rozbalení při kliknutí na tlačítko
                  handleEditTraining(training);
                }}
                className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded-full bg-white shadow-sm"
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
                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full bg-white shadow-sm"
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
          {error && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 p-3 bg-red-100 text-red-700 rounded-lg z-50">
              {error}
            </div>
          )}
          
          <TrainingForm 
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
      )}
    </div>
  );
};

export default UserTrainingsTable;
