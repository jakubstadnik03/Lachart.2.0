import React, { useState, useEffect } from 'react';
import Modal from '../Modal';

const EditProfileModal = ({ isOpen, onClose, onSubmit, userData }) => {
  const [formData, setFormData] = useState({});
  const [error, setError] = useState('');
  const [selectedSport, setSelectedSport] = useState('cycling'); // cycling or running

  const formatDateForInput = (dateString) => {
    if (!dateString) return '';
    try {
      console.log('Formatting date for input:', dateString);
      
      // Pokud je datum ve formátu DD.MM.YY
      if (dateString.includes('.')) {
        const [day, month, year] = dateString.split('.');
        // Přidáme 20 před rok, pokud je rok ve formátu YY
        const fullYear = year.length === 2 ? `20${year}` : year;
        const date = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        if (isNaN(date.getTime())) return ''; // Invalid date
        return date.toISOString().split('T')[0];
      }
      
      // Pro ostatní formáty
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return ''; // Invalid date
      
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      
      const formattedDate = `${year}-${month}-${day}`;
      console.log('Formatted date for input:', formattedDate);
      return formattedDate;
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  const parseDateForSubmit = (dateString) => {
    if (!dateString) return '';
    try {
      console.log('Parsing date for submit:', dateString);
      // Vytvoříme datum s časem nastaveným na půlnoc UTC
      const date = new Date(dateString + 'T00:00:00.000Z');
      if (isNaN(date.getTime())) return ''; // Invalid date
      
      const isoDate = date.toISOString();
      console.log('Parsed date for submit:', isoDate);
      return isoDate;
    } catch (error) {
      console.error('Error parsing date:', error);
      return '';
    }
  };

  useEffect(() => {
    if (userData) {
      try {
        console.log('Initial userData:', userData);
        const cyclingZones = userData.powerZones?.cycling || {};
        const runningZones = userData.powerZones?.running || {};
        const initialFormData = {
          name: userData.name || '',
          dateOfBirth: formatDateForInput(userData.dateOfBirth),
          address: userData.address || '',
          phone: userData.phone || '',
          height: userData.height || '',
          weight: userData.weight || '',
          sport: userData.sport || '',
          specialization: userData.specialization || '',
          bio: userData.bio || '',
          powerZones: {
            cycling: {
              zone1: { min: cyclingZones.zone1?.min || '', max: cyclingZones.zone1?.max || '', description: cyclingZones.zone1?.description || '' },
              zone2: { min: cyclingZones.zone2?.min || '', max: cyclingZones.zone2?.max || '', description: cyclingZones.zone2?.description || '' },
              zone3: { min: cyclingZones.zone3?.min || '', max: cyclingZones.zone3?.max || '', description: cyclingZones.zone3?.description || '' },
              zone4: { min: cyclingZones.zone4?.min || '', max: cyclingZones.zone4?.max || '', description: cyclingZones.zone4?.description || '' },
              zone5: { min: cyclingZones.zone5?.min || '', max: cyclingZones.zone5?.max || '', description: cyclingZones.zone5?.description || '' },
              lt1: cyclingZones.lt1 || '',
              lt2: cyclingZones.lt2 || ''
            },
            running: {
              zone1: { min: runningZones.zone1?.min || '', max: runningZones.zone1?.max || '', description: runningZones.zone1?.description || '' },
              zone2: { min: runningZones.zone2?.min || '', max: runningZones.zone2?.max || '', description: runningZones.zone2?.description || '' },
              zone3: { min: runningZones.zone3?.min || '', max: runningZones.zone3?.max || '', description: runningZones.zone3?.description || '' },
              zone4: { min: runningZones.zone4?.min || '', max: runningZones.zone4?.max || '', description: runningZones.zone4?.description || '' },
              zone5: { min: runningZones.zone5?.min || '', max: runningZones.zone5?.max || '', description: runningZones.zone5?.description || '' },
              lt1: runningZones.lt1 || '',
              lt2: runningZones.lt2 || ''
            }
          }
        };
        console.log('Initial formData:', initialFormData);
        setFormData(initialFormData);
      } catch (error) {
        console.error('Error setting form data:', error);
        setFormData({
          name: userData.name || '',
          dateOfBirth: '',
          address: userData.address || '',
          phone: userData.phone || '',
          height: userData.height || '',
          weight: userData.weight || '',
          sport: userData.sport || '',
          specialization: userData.specialization || '',
          bio: userData.bio || '',
          powerZones: {
            cycling: {
              zone1: { min: '', max: '', description: '' },
              zone2: { min: '', max: '', description: '' },
              zone3: { min: '', max: '', description: '' },
              zone4: { min: '', max: '', description: '' },
              zone5: { min: '', max: '', description: '' },
              lt1: '',
              lt2: ''
            },
            running: {
              zone1: { min: '', max: '', description: '' },
              zone2: { min: '', max: '', description: '' },
              zone3: { min: '', max: '', description: '' },
              zone4: { min: '', max: '', description: '' },
              zone5: { min: '', max: '', description: '' },
              lt1: '',
              lt2: ''
            }
          }
        });
      }
    }
  }, [userData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    // Základní validace
    if (!formData.name?.trim()) {
      setError('Name is required');
      return;
    }

    // Převedení data zpět do ISO formátu před odesláním
    const dataToSubmit = {
      ...formData,
      dateOfBirth: parseDateForSubmit(formData.dateOfBirth),
      // Převést power zones na správný formát (čísla místo stringů)
      powerZones: formData.powerZones ? {
        cycling: formData.powerZones.cycling ? {
          zone1: {
            min: formData.powerZones.cycling.zone1.min ? Number(formData.powerZones.cycling.zone1.min) : undefined,
            max: formData.powerZones.cycling.zone1.max ? Number(formData.powerZones.cycling.zone1.max) : undefined,
            description: formData.powerZones.cycling.zone1.description || undefined
          },
          zone2: {
            min: formData.powerZones.cycling.zone2.min ? Number(formData.powerZones.cycling.zone2.min) : undefined,
            max: formData.powerZones.cycling.zone2.max ? Number(formData.powerZones.cycling.zone2.max) : undefined,
            description: formData.powerZones.cycling.zone2.description || undefined
          },
          zone3: {
            min: formData.powerZones.cycling.zone3.min ? Number(formData.powerZones.cycling.zone3.min) : undefined,
            max: formData.powerZones.cycling.zone3.max ? Number(formData.powerZones.cycling.zone3.max) : undefined,
            description: formData.powerZones.cycling.zone3.description || undefined
          },
          zone4: {
            min: formData.powerZones.cycling.zone4.min ? Number(formData.powerZones.cycling.zone4.min) : undefined,
            max: formData.powerZones.cycling.zone4.max ? Number(formData.powerZones.cycling.zone4.max) : undefined,
            description: formData.powerZones.cycling.zone4.description || undefined
          },
          zone5: {
            min: formData.powerZones.cycling.zone5.min ? Number(formData.powerZones.cycling.zone5.min) : undefined,
            max: formData.powerZones.cycling.zone5.max ? Number(formData.powerZones.cycling.zone5.max) : undefined,
            description: formData.powerZones.cycling.zone5.description || undefined
          },
          lt1: formData.powerZones.cycling.lt1 ? Number(formData.powerZones.cycling.lt1) : undefined,
          lt2: formData.powerZones.cycling.lt2 ? Number(formData.powerZones.cycling.lt2) : undefined,
          lastUpdated: new Date()
        } : undefined,
        running: formData.powerZones.running ? {
          zone1: {
            min: formData.powerZones.running.zone1.min ? Number(formData.powerZones.running.zone1.min) : undefined,
            max: formData.powerZones.running.zone1.max ? Number(formData.powerZones.running.zone1.max) : undefined,
            description: formData.powerZones.running.zone1.description || undefined
          },
          zone2: {
            min: formData.powerZones.running.zone2.min ? Number(formData.powerZones.running.zone2.min) : undefined,
            max: formData.powerZones.running.zone2.max ? Number(formData.powerZones.running.zone2.max) : undefined,
            description: formData.powerZones.running.zone2.description || undefined
          },
          zone3: {
            min: formData.powerZones.running.zone3.min ? Number(formData.powerZones.running.zone3.min) : undefined,
            max: formData.powerZones.running.zone3.max ? Number(formData.powerZones.running.zone3.max) : undefined,
            description: formData.powerZones.running.zone3.description || undefined
          },
          zone4: {
            min: formData.powerZones.running.zone4.min ? Number(formData.powerZones.running.zone4.min) : undefined,
            max: formData.powerZones.running.zone4.max ? Number(formData.powerZones.running.zone4.max) : undefined,
            description: formData.powerZones.running.zone4.description || undefined
          },
          zone5: {
            min: formData.powerZones.running.zone5.min ? Number(formData.powerZones.running.zone5.min) : undefined,
            max: formData.powerZones.running.zone5.max ? Number(formData.powerZones.running.zone5.max) : undefined,
            description: formData.powerZones.running.zone5.description || undefined
          },
          lt1: formData.powerZones.running.lt1 ? Number(formData.powerZones.running.lt1) : undefined,
          lt2: formData.powerZones.running.lt2 ? Number(formData.powerZones.running.lt2) : undefined,
          lastUpdated: new Date()
        } : undefined
      } : undefined
    };

    console.log('Submitting form data:', dataToSubmit);
    onSubmit(dataToSubmit);
  };

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    console.log('Date changed:', newDate);
    setFormData(prev => ({ ...prev, dateOfBirth: newDate }));
  };

  // Generate zones from LTP1 and LTP2
  const generateZones = (sport) => {
    const lt1 = parseFloat(formData.powerZones?.[sport]?.lt1);
    const lt2 = parseFloat(formData.powerZones?.[sport]?.lt2);

    if (!lt1 || !lt2 || isNaN(lt1) || isNaN(lt2)) {
      setError(`Please enter both LTP1 and LTP2 for ${sport === 'cycling' ? 'cycling' : 'running'}`);
      return;
    }

    if (sport === 'cycling') {
      // For cycling: LTP2 > LTP1 (power in watts)
      if (lt2 <= lt1) {
        setError('LTP2 must be greater than LTP1 for cycling');
        return;
      }

      const zones = {
        zone1: {
          min: Math.round(lt1 * 0.70),
          max: Math.round(lt1 * 0.90),
          description: '70–90% LT1 (recovery, reference wide zone)'
        },
        zone2: {
          min: Math.round(lt1 * 0.90),
          max: Math.round(lt1 * 1.00),
          description: '90%–100% LT1'
        },
        zone3: {
          min: Math.round(lt1 * 1.00),
          max: Math.round(lt2 * 0.95),
          description: '100% LT1 – 95% LT2'
        },
        zone4: {
          min: Math.round(lt2 * 0.96),
          max: Math.round(lt2 * 1.04),
          description: '96%–104% LT2 (threshold)'
        },
        zone5: {
          min: Math.round(lt2 * 1.05),
          max: Math.round(lt2 * 1.20),
          description: '105–120% LT2 (sprint/VO2max+ reference)'
        }
      };

      setFormData(prev => ({
        ...prev,
        powerZones: {
          ...prev.powerZones,
          cycling: {
            ...prev.powerZones?.cycling,
            ...zones,
            lt1: lt1,
            lt2: lt2
          }
        }
      }));
    } else {
      // For running: LTP2 < LTP1 (pace in seconds - faster pace = lower seconds)
      if (lt2 >= lt1) {
        setError('LTP2 must be less than LTP1 for running (faster pace = lower seconds)');
        return;
      }

      const zones = {
        zone1: {
          min: Math.round(lt1 / 0.70), // slower (more seconds)
          max: Math.round(lt1 / 0.90), // faster (fewer seconds)
          description: '70–90% LT1 (recovery, reference wide zone)'
        },
        zone2: {
          min: Math.round(lt1 / 0.90),
          max: Math.round(lt1 / 1.00),
          description: '90%–100% LT1'
        },
        zone3: {
          min: Math.round(lt1 / 1.00),
          max: Math.round(lt2 / 0.95),
          description: '100% LT1 – 95% LT2'
        },
        zone4: {
          min: Math.round(lt2 / 0.96),
          max: Math.round(lt2 / 1.04),
          description: '96%–104% LT2 (threshold)'
        },
        zone5: {
          min: Math.round(lt2 / 1.05),
          max: Math.round(lt2 / 1.20),
          description: '105–120% LT2 (sprint/VO2max+ reference)'
        }
      };

      setFormData(prev => ({
        ...prev,
        powerZones: {
          ...prev.powerZones,
          running: {
            ...prev.powerZones?.running,
            ...zones,
            lt1: lt1,
            lt2: lt2
          }
        }
      }));
    }

    setError('');
  };

  // Format pace for display (seconds to mm:ss)
  const formatPace = (seconds) => {
    if (!seconds || seconds === 0 || isNaN(seconds)) return '';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Parse pace from mm:ss to seconds
  const parsePace = (paceString) => {
    if (!paceString) return '';
    const parts = paceString.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseInt(parts[1]) || 0;
      return minutes * 60 + seconds;
    }
    return paceString;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Profile">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 text-sm text-red-700 bg-red-50 rounded-xl border border-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Date of Birth</label>
            <input
              type="date"
              value={formData.dateOfBirth || ''}
              onChange={handleDateChange}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Address</label>
            <input
              type="text"
              value={formData.address || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="Enter your address"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Phone</label>
            <input
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="+420 123 456 789"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Height (cm)</label>
            <input
              type="number"
              value={formData.height || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, height: e.target.value }))}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="175"
              min="0"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Weight (kg)</label>
            <input
              type="number"
              value={formData.weight || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, weight: e.target.value }))}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="70"
              min="0"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Sport</label>
            <select
              value={formData.sport || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, sport: e.target.value }))}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            >
              <option value="">Select sport</option>
              <option value="triathlon">Triathlon</option>
              <option value="cycling">Cycling</option>
              <option value="running">Running</option>
              <option value="swimming">Swimming</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">Specialization</label>
            <input
              type="text"
              value={formData.specialization || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, specialization: e.target.value }))}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="e.g. Long distance, Sprint..."
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700">Bio</label>
            <textarea
              value={formData.bio || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
              rows={4}
              className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
              placeholder="Tell us about yourself..."
            />
          </div>
        </div>

        {/* Power Zones Section */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h3 className="text-xl font-bold text-gray-900">Training Zones</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedSport('cycling')}
                className={`px-4 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                  selectedSport === 'cycling'
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Cycling
              </button>
              <button
                type="button"
                onClick={() => setSelectedSport('running')}
                className={`px-4 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                  selectedSport === 'running'
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Running
              </button>
            </div>
          </div>
          
          <p className="text-sm text-gray-600 mb-6 bg-blue-50 p-4 rounded-xl border border-blue-100">
            {selectedSport === 'cycling' 
              ? 'Set LTP1 and LTP2 (in watts) to automatically generate power zones, or set zones manually.'
              : 'Set LTP1 and LTP2 (in seconds, e.g., 240 for 4:00/km) to automatically generate pace zones, or set zones manually.'}
          </p>
          
          <div className="space-y-6">
            {/* LTP1 and LTP2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  LTP1 {selectedSport === 'cycling' ? '(W)' : '(seconds, e.g., 240 for 4:00/km)'}
                </label>
                <input
                  type="number"
                  value={formData.powerZones?.[selectedSport]?.lt1 || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    powerZones: {
                      ...prev.powerZones,
                      [selectedSport]: {
                        ...prev.powerZones?.[selectedSport],
                        lt1: e.target.value
                      }
                    }
                  }))}
                  className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder={selectedSport === 'cycling' ? 'e.g. 200' : 'e.g. 240'}
                />
                {selectedSport === 'running' && formData.powerZones?.running?.lt1 && (
                  <p className="text-xs text-gray-500 mt-1 font-medium">
                    {formatPace(Number(formData.powerZones.running.lt1))} /km
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  LTP2 {selectedSport === 'cycling' ? '(W)' : '(seconds, e.g., 200 for 3:20/km)'}
                </label>
                <input
                  type="number"
                  value={formData.powerZones?.[selectedSport]?.lt2 || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    powerZones: {
                      ...prev.powerZones,
                      [selectedSport]: {
                        ...prev.powerZones?.[selectedSport],
                        lt2: e.target.value
                      }
                    }
                  }))}
                  className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder={selectedSport === 'cycling' ? 'e.g. 280' : 'e.g. 200'}
                />
                {selectedSport === 'running' && formData.powerZones?.running?.lt2 && (
                  <p className="text-xs text-gray-500 mt-1 font-medium">
                    {formatPace(Number(formData.powerZones.running.lt2))} /km
                  </p>
                )}
              </div>
            </div>

            {/* Generate Zones Button */}
            <button
              type="button"
              onClick={() => generateZones(selectedSport)}
              className="w-full px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark font-semibold shadow-md hover:shadow-lg transition-all"
            >
              Generate Zones from LTP1 & LTP2
            </button>

            {/* Zone inputs */}
            <div className="space-y-1">
              {[1, 2, 3, 4, 5].map(zoneNum => (
                <div key={zoneNum} className="p-1.5 bg-gray-50 rounded-md border border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full font-bold text-xs flex-shrink-0 ${
                      zoneNum === 1 ? 'bg-blue-100 text-blue-700' :
                      zoneNum === 2 ? 'bg-green-100 text-green-700' :
                      zoneNum === 3 ? 'bg-yellow-100 text-yellow-700' :
                      zoneNum === 4 ? 'bg-orange-100 text-orange-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {zoneNum}
                    </span>
                    <div className="flex-1 grid grid-cols-5 gap-1.5 items-center">
                      <div className="min-w-0">
                        <label className="block text-xs font-medium text-gray-600 mb-0.5">
                          Min {selectedSport === 'cycling' ? '(W)' : '(s)'}
                        </label>
                        <input
                          type="number"
                          value={formData.powerZones?.[selectedSport]?.[`zone${zoneNum}`]?.min || ''}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            powerZones: {
                              ...prev.powerZones,
                              [selectedSport]: {
                                ...prev.powerZones?.[selectedSport],
                                [`zone${zoneNum}`]: {
                                  ...prev.powerZones?.[selectedSport]?.[`zone${zoneNum}`],
                                  min: e.target.value
                                }
                              }
                            }
                          }))}
                          className="w-full px-1.5 py-0.5 text-xs bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition-all"
                          placeholder="Min"
                        />
                        {selectedSport === 'running' && formData.powerZones?.running?.[`zone${zoneNum}`]?.min && (
                          <p className="text-xs text-gray-400 mt-0.5 leading-tight">
                            {formatPace(Number(formData.powerZones.running[`zone${zoneNum}`].min))}
                          </p>
                        )}
                      </div>
                      <div className="min-w-0">
                        <label className="block text-xs font-medium text-gray-600 mb-0.5">
                          Max {selectedSport === 'cycling' ? '(W)' : '(s)'}
                        </label>
                        <input
                          type="number"
                          value={formData.powerZones?.[selectedSport]?.[`zone${zoneNum}`]?.max || ''}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            powerZones: {
                              ...prev.powerZones,
                              [selectedSport]: {
                                ...prev.powerZones?.[selectedSport],
                                [`zone${zoneNum}`]: {
                                  ...prev.powerZones?.[selectedSport]?.[`zone${zoneNum}`],
                                  max: e.target.value
                                }
                              }
                            }
                          }))}
                          className="w-full px-1.5 py-0.5 text-xs bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition-all"
                          placeholder={zoneNum === 5 ? "∞" : "Max"}
                        />
                        {selectedSport === 'running' && formData.powerZones?.running?.[`zone${zoneNum}`]?.max && (
                          <p className="text-xs text-gray-400 mt-0.5 leading-tight">
                            {formatPace(Number(formData.powerZones.running[`zone${zoneNum}`].max))}
                          </p>
                        )}
                      </div>
                      <div className="col-span-3 min-w-0">
                        <label className="block text-xs font-medium text-gray-600 mb-0.5">Description</label>
                        <input
                          type="text"
                          value={formData.powerZones?.[selectedSport]?.[`zone${zoneNum}`]?.description || ''}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            powerZones: {
                              ...prev.powerZones,
                              [selectedSport]: {
                                ...prev.powerZones?.[selectedSport],
                                [`zone${zoneNum}`]: {
                                  ...prev.powerZones?.[selectedSport]?.[`zone${zoneNum}`],
                                  description: e.target.value
                                }
                              }
                            }
                          }))}
                          className="w-full px-1.5 py-0.5 text-xs bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition-all"
                          placeholder="e.g. Recovery, Aerobic..."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-6 py-3 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-dark shadow-md hover:shadow-lg transition-all"
          >
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditProfileModal; 