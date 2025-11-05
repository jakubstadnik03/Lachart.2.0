import React, { useState, useEffect, useRef } from 'react';
import { ClockIcon, MapPinIcon, HeartIcon, BoltIcon, PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { formatDuration, formatDistance } from '../../utils/fitAnalysisUtils';
import { updateFitTraining, getAllTitles } from '../../services/api';

const TrainingStats = ({ training, onDelete, onUpdate }) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [title, setTitle] = useState(training?.titleManual || training?.titleAuto || training?.originalFileName || '');
  const [description, setDescription] = useState(training?.description || '');
  const [saving, setSaving] = useState(false);
  const [allTitles, setAllTitles] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredTitles, setFilteredTitles] = useState([]);
  const titleInputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Update state when training changes
  useEffect(() => {
    if (training) {
      setTitle(training.titleManual || training.titleAuto || training.originalFileName || '');
      setDescription(training.description || '');
    }
  }, [training]);

  // Load all titles when editing starts
  useEffect(() => {
    if (isEditingTitle) {
      getAllTitles().then(titles => {
        setAllTitles(titles);
        setFilteredTitles(titles); // Zobrazit všechny titles na začátku
        setShowSuggestions(titles.length > 0); // Zobrazit dropdown hned
      }).catch(err => console.error('Error loading titles:', err));
    }
  }, [isEditingTitle]);

  // Filter titles based on input
  useEffect(() => {
    if (title.trim() === '') {
      setFilteredTitles(allTitles);
      setShowSuggestions(allTitles.length > 0);
    } else {
      const filtered = allTitles.filter(t => 
        t.toLowerCase().includes(title.toLowerCase())
      );
      setFilteredTitles(filtered);
      setShowSuggestions(filtered.length > 0);
    }
  }, [title, allTitles]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target) &&
        titleInputRef.current &&
        !titleInputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    if (isEditingTitle) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isEditingTitle]);

  if (!training) return null;

  const handleSaveTitle = async () => {
    try {
      setSaving(true);
      await updateFitTraining(training._id, { title: title.trim() || null });
      setIsEditingTitle(false);
      if (onUpdate) {
        await onUpdate(training._id);
      }
    } catch (error) {
      console.error('Error saving title:', error);
      alert('Error saving title');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDescription = async () => {
    try {
      setSaving(true);
      await updateFitTraining(training._id, { description: description.trim() || null });
      setIsEditingDescription(false);
      if (onUpdate) await onUpdate(training._id);
    } catch (error) {
      console.error('Error saving description:', error);
      alert('Error saving description');
    } finally {
      setSaving(false);
    }
  };

  const displayTitle = training?.titleManual || training?.titleAuto || training?.originalFileName || 'Untitled Training';

  return (
    <>
      {/* Title - Large and prominent */}
      <div className="mb-6 pb-4 border-b border-gray-200">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onFocus={() => {
                      if (allTitles.length > 0) {
                        setShowSuggestions(true);
                      }
                    }}
                    className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg text-3xl font-bold focus:outline-none focus:border-purple-500"
                    placeholder="Enter title..."
                    autoFocus
                  />
                  {showSuggestions && filteredTitles.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
                    >
                      {filteredTitles.map((suggestion, index) => (
                        <div
                          key={index}
                          onClick={() => {
                            setTitle(suggestion);
                            setShowSuggestions(false);
                          }}
                          className="px-4 py-2 hover:bg-purple-50 cursor-pointer text-sm"
                        >
                          {suggestion}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSaveTitle}
                  disabled={saving}
                  className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  title="Save title"
                >
                  <CheckIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={() => {
                    setIsEditingTitle(false);
                    setTitle(displayTitle);
                  }}
                  className="p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  title="Cancel"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 group">
                <h1 className="text-3xl font-bold text-gray-900">{displayTitle}</h1>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                  title="Edit title"
                >
                  <PencilIcon className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
          {onDelete && (
            <button
              onClick={() => onDelete(training._id)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>
      
      {/* Description - Prominent box */}
      <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border-2 border-purple-200 shadow-sm">
        <div className="flex items-start gap-2">
          {isEditingDescription ? (
            <>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex-1 px-4 py-3 border-2 border-purple-300 rounded-lg min-h-[100px] bg-white text-gray-800 focus:outline-none focus:border-purple-500 resize-y"
                placeholder="Enter description..."
                autoFocus
              />
              <div className="flex flex-col gap-2 flex-shrink-0">
                <button
                  onClick={handleSaveDescription}
                  disabled={saving}
                  className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  title="Save description"
                >
                  <CheckIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={() => {
                    setIsEditingDescription(false);
                    setDescription(training?.description || '');
                  }}
                  className="p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  title="Cancel"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-3 w-full group">
              <div className="flex-1">
                {description ? (
                  <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-base">{description}</p>
                ) : (
                  <button
                    onClick={() => setIsEditingDescription(true)}
                    className="text-gray-500 italic hover:text-gray-700 w-full text-left py-2 transition-colors"
                  >
                    📝 Click to add description...
                  </button>
                )}
              </div>
              <button
                onClick={() => setIsEditingDescription(true)}
                className="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg transition-all flex-shrink-0"
                title="Edit description"
              >
                <PencilIcon className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-sm text-gray-600 flex items-center gap-1">
            <ClockIcon className="w-4 h-4" />
            Duration
          </div>
          <div className="text-xl font-bold mt-1">
            {formatDuration(training.totalElapsedTime)}
          </div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-sm text-gray-600 flex items-center gap-1">
            <MapPinIcon className="w-4 h-4" />
            Distance
          </div>
          <div className="text-xl font-bold mt-1">
            {formatDistance(training.totalDistance)}
          </div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-sm text-gray-600 flex items-center gap-1">
            <HeartIcon className="w-4 h-4" />
            Avg Heart Rate
          </div>
          <div className="text-xl font-bold mt-1">
            {training.avgHeartRate ? `${Math.round(training.avgHeartRate)} bpm` : '-'}
          </div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg">
          <div className="text-sm text-gray-600 flex items-center gap-1">
            <BoltIcon className="w-4 h-4" />
            Avg Power
          </div>
          <div className="text-xl font-bold mt-1">
            {training.avgPower ? `${Math.round(training.avgPower)} W` : '-'}
          </div>
        </div>
      </div>
    </>
  );
};

export default TrainingStats;

