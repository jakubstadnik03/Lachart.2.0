"use client";

import React, { useState, useEffect } from "react";
import { fetchTrainingTitles } from "../mock/mockApi";

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
  bike: ["track", "road", "trail"],
  run: ["track", "road", "trail"],
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

const TrainingForm = ({ onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
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
  const [isCustomTitle, setIsCustomTitle] = useState(false);
  const [isCustomWeather, setIsCustomWeather] = useState(false);
  const [isCustomSpecific, setIsCustomSpecific] = useState(false);

  useEffect(() => {
    const loadTrainingTitles = async () => {
      const titles = await fetchTrainingTitles();
      console.log("Loaded titles:", titles);
      setTrainingTitles(titles || []);
    };
    loadTrainingTitles();
  }, []);

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

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
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
          durationType: "time"
        }
      ]
    }));
  };

  return (
    <div className="bg-white rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
      {/* Fixed Header */}
      <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-200">
        <h2 className="text-xl sm:text-2xl font-bold">New training</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="overflow-y-auto flex-1 p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Activity Selector */}
          <div className="grid grid-cols-3 gap-2">
            {ACTIVITIES.map((activity) => (
              <button
                key={activity.id}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, sport: activity.id }))}
                className={`
                  flex items-center justify-center gap-2 px-4 py-2 rounded-full
                  ${formData.sport === activity.id 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-900'}
                  w-full
                `}
              >
                <img src={activity.icon} alt="" className="w-5 h-5 sm:w-6 sm:h-6" />
                <span>{activity.label}</span>
              </button>
            ))}
          </div>

          {/* Form Content */}
          <div className="space-y-6">
            {/* Training Details */}
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
                      <button
                        type="button"
                        onClick={() => setIsCustomTitle(true)}
                        className="text-sm text-blue-500 hover:text-blue-600"
                      >
                        + Add custom title
                      </button>
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

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Write some text"
                className="w-full border rounded-lg p-2 min-h-[100px]"
              />
            </div>

            {/* Intervals */}
            <div className="space-y-4">
              {formData.results.map((interval, index) => (
                <div key={index} className="border border-gray-200 rounded-lg">
                  <div className="flex justify-between items-center px-4 py-2 border-b border-gray-200">
                    <h3 className="font-medium text-gray-700">{interval.interval}. interval</h3>
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
                  
                  {/* Responsive interval inputs */}
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
                          placeholder="MM:SS"
                          value={interval.power}
                          onChange={(e) => handlePaceChange(index, e.target.value)}
                          maxLength={5}
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
                          placeholder={interval.durationType === "time" ? "MM:SS" : "Distance"}
                          value={interval.duration}
                          onChange={(e) => {
                            const newResults = [...formData.results];
                            newResults[index].duration = e.target.value;
                            setFormData(prev => ({ ...prev, results: newResults }));
                          }}
                          className="border-b border-gray-300 focus:border-blue-500 outline-none px-2 py-1 w-full"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newResults = [...formData.results];
                            newResults[index].durationType = interval.durationType === "time" ? "distance" : "time";
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

            {/* Add Step Button */}
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

      {/* Fixed Footer */}
      <div className="border-t border-gray-200 p-4 sm:p-6 bg-white">
        <div className="flex justify-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="px-6 sm:px-8 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            className="px-6 sm:px-8 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Save training
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrainingForm;
