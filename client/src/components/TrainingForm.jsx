"use client";

import React, { useState, useEffect } from "react";
import { getTrainingTitles } from "../services/api";
import { useNotification } from '../context/NotificationContext';

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

const DURATION_TYPES = [
  { type: "time", options: ["00:30", "01:00", "02:00", "05:00", "10:00", "15:00", "20:00"] },
  { type: "distance", options: ["100m", "200m", "400m", "800m", "1km", "2km", "5km"] }
];

const TERRAIN_OPTIONS = {
  bike: ["track", "road", "trail", "indoor"],
  run: ["track", "road", "trail", "indoor"],
  swim: [] // pro plavání používáme poolLength
};

const WEATHER_OPTIONS = ["sunny", "indoor", "rainy", "windy"];

const formatSecondsToMMSS = (seconds) => {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const parseMMSSToSeconds = (mmss) => {
  if (!mmss) return "";
  const [mins, secs] = mmss.split(":").map(Number);
  return mins * 60 + (secs || 0);
};

const TrainingForm = ({ onClose, onSubmit, initialData = null, isEditing = false, isLoading = false }) => {
  const { addNotification } = useNotification();
  const [formData, setFormData] = useState(initialData || {
    sport: "bike",
    type: "interval",
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
    if (initialData) {
      console.log('Editing training:', initialData);
      const formattedData = {
        ...initialData,
        date: new Date(initialData.date).toISOString().slice(0, 16),
        results: initialData.results.map(result => ({
          ...result,
          power: formData.sport === 'bike' ? result.power : formatSecondsToMMSS(result.power),
          duration: result.durationType === "time" ? formatSecondsToMMSS(result.duration) : result.duration
        }))
      };
      setFormData(formattedData);
    }
  }, [initialData]);

  const filteredTrainingTitles = trainingTitles;

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
            const [minutes, seconds] = interval.power.split(':').map(Number);
            updatedInterval.power = (minutes * 60 + seconds).toString();
          }
          
          return updatedInterval;
        });
      }
      
      // Zpracování duration pro všechny intervaly
      if (dataToSubmit.results) {
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
              const [minutes, seconds] = interval.duration.split(':').map(Number);
              updatedInterval.duration = (minutes * 60 + (seconds || 0)).toString();
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
          
          return updatedInterval;
        });
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
          power: "",
          heartRate: "",
          lactate: "",
          RPE: "",
          duration: "",
          durationType: "time",
          repeatCount: 1 // Přidáme výchozí hodnotu pro počet opakování
        }
      ]
    }));
  };

  const handleEditRepeatCount = (index) => {
    setEditingIntervalIndex(index);
    setTempRepeatCount(formData.results[index].repeatCount.toString());
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

  return (
    <div className="bg-white rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh] relative">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 text-gray-500 hover:text-gray-700"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="p-4 sm:p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold">{isEditing ? "Edit Training" : "Add New Training"}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <form 
          id="training-form"
          onSubmit={handleFormSubmit}
          className="space-y-6"
        >
          <div className="grid grid-cols-3 gap-2">
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
                className={`
                  flex items-center justify-center gap-2 px-4 py-2 rounded-full
                  ${formData.sport === activity.id 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-900'}
                  w-full
                `}
              >
                <img 
                  src={activity.icon} 
                  alt="" 
                  className={`w-5 h-5 sm:w-6 sm:h-6 ${formData.sport === activity.id ? 'brightness-0 invert' : ''}`}
                />
                <span>{activity.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Training title:</label>
                <div className="space-y-2">
                  {!isCustomTitle ? (
                    <>
                      <select
                        value={formData.title}
                        onChange={(e) => {
                          if (e.target.value === "custom") {
                            setIsCustomTitle(true);
                          } else {
                            setFormData(prev => ({ ...prev, title: e.target.value }));
                          }
                        }}
                        className="w-full border rounded-lg p-2"
                      >
                        <option value="">Select training</option>
                        {trainingTitles.map((title) => (
                          <option key={title} value={title}>
                            {title}
                          </option>
                        ))}
                        <option value="custom">+ Add custom title</option>
                      </select>
                    </>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.customTitle}
                        onChange={(e) => setFormData(prev => ({ ...prev, customTitle: e.target.value }))}
                        placeholder="Enter custom title"
                        className="flex-1 border rounded-lg p-2"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomTitle(false);
                          setFormData(prev => ({ ...prev, customTitle: "" }));
                        }}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <input
                  type="datetime-local"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full border rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {formData.sport === "swim" ? "Pool Length:" : "Terrain:"}
                </label>
                {!isCustomSpecific ? (
                  <div className="space-y-2">
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
                      className="w-full border rounded-lg p-2"
                    >
                      <option value="">Select {formData.sport === "swim" ? "pool length" : "terrain"}</option>
                      {formData.sport === "swim" ? (
                        <>
                          <option value="25m">25m</option>
                          <option value="50m">50m</option>
                          <option value="custom">+ Custom length</option>
                        </>
                      ) : (
                        <>
                          {TERRAIN_OPTIONS[formData.sport].map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                          <option value="custom">+ Custom terrain</option>
                        </>
                      )}
                    </select>
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
                      placeholder={`Enter custom ${formData.sport === "swim" ? "length" : "terrain"}`}
                      className="flex-1 border rounded-lg p-2"
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
                      className="text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Weather:</label>
                {!isCustomWeather ? (
                  <div className="space-y-2">
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
                      className="w-full border rounded-lg p-2"
                    >
                      <option value="">Select weather</option>
                      {WEATHER_OPTIONS.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                      <option value="custom">+ Custom weather</option>
                    </select>
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
                      placeholder="Enter custom weather"
                      className="flex-1 border rounded-lg p-2"
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
                      className="text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Write some text"
                className="w-full border rounded-lg p-2 min-h-[100px]"
              />
            </div>

            <div className="space-y-4">
              {formData.results.map((interval, index) => (
                <div key={index} className="border border-gray-200 rounded-lg">
                  <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-700">
                        {interval.repeatCount > 1 
                          ? `${index + 1}-${index + parseInt(interval.repeatCount)} interval`
                          : `${index + 1}. interval`}
                      </h3>
                      <button
                        type="button"
                        onClick={() => handleEditRepeatCount(index)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {interval.repeatCount > 1 && (
                        <span className="text-sm text-gray-500">
                          {interval.repeatCount}x
                        </span>
                      )}
                      <button 
                        type="button" 
                        className="text-red-500 hover:text-red-700 text-2xl font-bold w-8 h-8 flex items-center justify-center"
                        onClick={() => {
                          const newResults = formData.results.filter((_, i) => i !== index);
                          const updatedResults = newResults.map((res, i) => ({
                            ...res,
                            interval: i + 1
                          }));
                          setFormData(prev => ({ ...prev, results: updatedResults }));
                        }}
                      >
                        −
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:flex md:items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d={formData.sport === "bike" 
                              ? "M13 10V3L4 14h7v7l9-11h-7z" 
                              : "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"} 
                          />
                        </svg>
                      </span>
                      {formData.sport === "bike" ? (
                        <input
                          type="number"
                          placeholder="Power"
                          value={interval.power}
                          onChange={(e) => {
                            const newResults = [...formData.results];
                            newResults[index].power = e.target.value;
                            setFormData(prev => ({ ...prev, results: newResults }));
                          }}
                          className="border-b border-gray-300 focus:border-blue-500 outline-none px-2 py-1 w-full"
                        />
                      ) : (
                        <input
                          type="text"
                          placeholder={formData.sport === 'bike' ? "Power" : "Pace (MM:SS)"}
                          value={interval.power}
                          onChange={(e) => {
                            if (formData.sport === 'bike') {
                              const newResults = [...formData.results];
                              newResults[index].power = e.target.value;
                              setFormData(prev => ({ ...prev, results: newResults }));
                            } else {
                              handlePaceChange(index, e.target.value);
                            }
                          }}
                          className="border-b border-gray-300 focus:border-blue-500 outline-none px-2 py-1 w-full"
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                      </span>
                      <input
                        type="number"
                        placeholder="HR"
                        value={interval.heartRate}
                        onChange={(e) => {
                          const newResults = [...formData.results];
                          newResults[index].heartRate = e.target.value;
                          setFormData(prev => ({ ...prev, results: newResults }));
                        }}
                        className="border-b border-gray-300 focus:border-blue-500 outline-none px-2 py-1 w-full"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                      </span>
                      <input
                        type="number"
                        placeholder="Lac"
                        value={interval.lactate}
                        onChange={(e) => {
                          const newResults = [...formData.results];
                          newResults[index].lactate = e.target.value;
                          setFormData(prev => ({ ...prev, results: newResults }));
                        }}
                        className="border-b border-gray-300 focus:border-blue-500 outline-none px-2 py-1 w-full"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                      <input
                        type="number"
                        placeholder="RPE"
                        value={interval.RPE}
                        onChange={(e) => {
                          const newResults = [...formData.results];
                          newResults[index].RPE = e.target.value;
                          setFormData(prev => ({ ...prev, results: newResults }));
                        }}
                        className="border-b border-gray-300 focus:border-blue-500 outline-none px-2 py-1 w-full"
                      />
                    </div>

                    <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
                      <span className="text-gray-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                      <div className="relative flex-1">
                        <input
                          type="text"
                          placeholder={interval.durationType === "time" ? "MM:SS" : "Distance (e.g. 1 km, 400m)"}
                          value={interval.duration}
                          onChange={(e) => {
                            const newResults = [...formData.results];
                            let value = e.target.value;
                            
                            // Pokud je typ distance, povolíme formát s km nebo m
                            if (interval.durationType === "distance") {
                              // Povolíme čísla, tečku, mezeru a jednotky km/m
                              value = value.replace(/[^\d\s.km]/g, '');
                              
                              // Necháme uživatele zadat vlastní jednotku
                              // Automaticky nepřidáváme jednotku
                            } else {
                              // Pro typ "time" zpracujeme číselnou hodnotu
                              // Povolíme pouze čísla a dvojtečku
                              value = value.replace(/[^\d:]/g, '');
                              
                              // Pokud uživatel zadá číslo bez dvojtečky
                              if (value.length > 0 && !value.includes(':')) {
                                // Přidáme dvojtečku po druhém čísle
                                if (value.length >= 2) {
                                  value = `${value.slice(0, 2)}:${value.slice(2, 4)}`;
                                }
                              }
                            }
                            
                            newResults[index].duration = value;
                            setFormData(prev => ({ ...prev, results: newResults }));
                          }}
                          className="border-b border-gray-300 focus:border-blue-500 outline-none px-2 py-1 w-full"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newResults = [...formData.results];
                            newResults[index].durationType = interval.durationType === "time" ? "distance" : "time";
                            // Při přepnutí na time vymažeme hodnotu
                            if (newResults[index].durationType === "time") {
                              newResults[index].duration = "";
                            }
                            setFormData(prev => ({ ...prev, results: newResults }));
                          }}
                          className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddInterval}
              className="flex items-center gap-2 text-blue-500 border border-blue-500 rounded-lg px-4 py-2"
            >
              Add step
              <span className="text-xl">+</span>
            </button>
          </div>
        </form>
      </div>

      <div className="border-t border-gray-200 p-4 sm:p-6 bg-white">
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="training-form"
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-blue-300"
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : (isEditing ? "Update Training" : "Add Training")}
          </button>
        </div>
      </div>

      {editingIntervalIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Set Number of Repetitions</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Number of repetitions:</label>
                <input
                  type="number"
                  min="1"
                  value={tempRepeatCount}
                  onChange={(e) => setTempRepeatCount(e.target.value)}
                  className="w-full border rounded-lg p-2"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelEditRepeatCount}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveRepeatCount}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingForm;
