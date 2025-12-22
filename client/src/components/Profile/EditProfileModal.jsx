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
      if (typeof dateString === 'string' && dateString.includes('.')) {
        const [day, month, year] = dateString.split('.');
        // Přidáme 20 před rok, pokud je rok ve formátu YY
        const fullYear = year && year.length === 2 ? `20${year}` : year;
        if (!fullYear || !month || !day) return '';
        const date = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
        if (isNaN(date.getTime())) return ''; // Invalid date
        return date.toISOString().split('T')[0];
      }
      
      // Pro ostatní formáty (ISO string, Date object, etc.)
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
        // Auto-select sport if provided from TrainingZonesGenerator
        if (userData._selectedSport) {
          setSelectedSport(userData._selectedSport);
        }
        const cyclingZones = userData.powerZones?.cycling || {};
        const runningZones = userData.powerZones?.running || {};
        const swimmingZones = userData.powerZones?.swimming || {};
        const cyclingHrZones = userData.heartRateZones?.cycling || {};
        const runningHrZones = userData.heartRateZones?.running || {};
        const swimmingHrZones = userData.heartRateZones?.swimming || {};
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
          units: userData.units || { distance: 'metric', weight: 'kg', temperature: 'celsius' },
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
              zone1: { 
                min: runningZones.zone1?.min !== undefined && runningZones.zone1?.min !== null ? String(runningZones.zone1.min) : '', 
                max: runningZones.zone1?.max !== undefined && runningZones.zone1?.max !== null ? String(runningZones.zone1.max) : '', 
                description: runningZones.zone1?.description || '' 
              },
              zone2: { 
                min: runningZones.zone2?.min !== undefined && runningZones.zone2?.min !== null ? String(runningZones.zone2.min) : '', 
                max: runningZones.zone2?.max !== undefined && runningZones.zone2?.max !== null ? String(runningZones.zone2.max) : '', 
                description: runningZones.zone2?.description || '' 
              },
              zone3: { 
                min: runningZones.zone3?.min !== undefined && runningZones.zone3?.min !== null ? String(runningZones.zone3.min) : '', 
                max: runningZones.zone3?.max !== undefined && runningZones.zone3?.max !== null ? String(runningZones.zone3.max) : '', 
                description: runningZones.zone3?.description || '' 
              },
              zone4: { 
                min: runningZones.zone4?.min !== undefined && runningZones.zone4?.min !== null ? String(runningZones.zone4.min) : '', 
                max: runningZones.zone4?.max !== undefined && runningZones.zone4?.max !== null ? String(runningZones.zone4.max) : '', 
                description: runningZones.zone4?.description || '' 
              },
              zone5: { 
                min: runningZones.zone5?.min !== undefined && runningZones.zone5?.min !== null ? String(runningZones.zone5.min) : '', 
                max: runningZones.zone5?.max !== undefined && runningZones.zone5?.max !== null ? String(runningZones.zone5.max) : '', 
                description: runningZones.zone5?.description || '' 
              },
              lt1: runningZones.lt1 || '',
              lt2: runningZones.lt2 || ''
            },
            swimming: {
              zone1: { 
                min: swimmingZones.zone1?.min !== undefined && swimmingZones.zone1?.min !== null ? String(swimmingZones.zone1.min) : '', 
                max: swimmingZones.zone1?.max !== undefined && swimmingZones.zone1?.max !== null ? String(swimmingZones.zone1.max) : '', 
                description: swimmingZones.zone1?.description || '' 
              },
              zone2: { 
                min: swimmingZones.zone2?.min !== undefined && swimmingZones.zone2?.min !== null ? String(swimmingZones.zone2.min) : '', 
                max: swimmingZones.zone2?.max !== undefined && swimmingZones.zone2?.max !== null ? String(swimmingZones.zone2.max) : '', 
                description: swimmingZones.zone2?.description || '' 
              },
              zone3: { 
                min: swimmingZones.zone3?.min !== undefined && swimmingZones.zone3?.min !== null ? String(swimmingZones.zone3.min) : '', 
                max: swimmingZones.zone3?.max !== undefined && swimmingZones.zone3?.max !== null ? String(swimmingZones.zone3.max) : '', 
                description: swimmingZones.zone3?.description || '' 
              },
              zone4: { 
                min: swimmingZones.zone4?.min !== undefined && swimmingZones.zone4?.min !== null ? String(swimmingZones.zone4.min) : '', 
                max: swimmingZones.zone4?.max !== undefined && swimmingZones.zone4?.max !== null ? String(swimmingZones.zone4.max) : '', 
                description: swimmingZones.zone4?.description || '' 
              },
              zone5: { 
                min: swimmingZones.zone5?.min !== undefined && swimmingZones.zone5?.min !== null ? String(swimmingZones.zone5.min) : '', 
                max: swimmingZones.zone5?.max !== undefined && swimmingZones.zone5?.max !== null ? String(swimmingZones.zone5.max) : '', 
                description: swimmingZones.zone5?.description || '' 
              },
              lt1: swimmingZones.lt1 || '',
              lt2: swimmingZones.lt2 || ''
            }
          },
          heartRateZones: {
            cycling: {
              zone1: { min: cyclingHrZones.zone1?.min || '', max: cyclingHrZones.zone1?.max || '', description: cyclingHrZones.zone1?.description || '' },
              zone2: { min: cyclingHrZones.zone2?.min || '', max: cyclingHrZones.zone2?.max || '', description: cyclingHrZones.zone2?.description || '' },
              zone3: { min: cyclingHrZones.zone3?.min || '', max: cyclingHrZones.zone3?.max || '', description: cyclingHrZones.zone3?.description || '' },
              zone4: { min: cyclingHrZones.zone4?.min || '', max: cyclingHrZones.zone4?.max || '', description: cyclingHrZones.zone4?.description || '' },
              zone5: { min: cyclingHrZones.zone5?.min || '', max: cyclingHrZones.zone5?.max || '', description: cyclingHrZones.zone5?.description || '' },
              maxHeartRate: cyclingHrZones.maxHeartRate || ''
            },
            running: {
              zone1: { min: runningHrZones.zone1?.min || '', max: runningHrZones.zone1?.max || '', description: runningHrZones.zone1?.description || '' },
              zone2: { min: runningHrZones.zone2?.min || '', max: runningHrZones.zone2?.max || '', description: runningHrZones.zone2?.description || '' },
              zone3: { min: runningHrZones.zone3?.min || '', max: runningHrZones.zone3?.max || '', description: runningHrZones.zone3?.description || '' },
              zone4: { min: runningHrZones.zone4?.min || '', max: runningHrZones.zone4?.max || '', description: runningHrZones.zone4?.description || '' },
              zone5: { min: runningHrZones.zone5?.min || '', max: runningHrZones.zone5?.max || '', description: runningHrZones.zone5?.description || '' },
              maxHeartRate: runningHrZones.maxHeartRate || ''
            },
            swimming: {
              zone1: { min: swimmingHrZones.zone1?.min || '', max: swimmingHrZones.zone1?.max || '', description: swimmingHrZones.zone1?.description || '' },
              zone2: { min: swimmingHrZones.zone2?.min || '', max: swimmingHrZones.zone2?.max || '', description: swimmingHrZones.zone2?.description || '' },
              zone3: { min: swimmingHrZones.zone3?.min || '', max: swimmingHrZones.zone3?.max || '', description: swimmingHrZones.zone3?.description || '' },
              zone4: { min: swimmingHrZones.zone4?.min || '', max: swimmingHrZones.zone4?.max || '', description: swimmingHrZones.zone4?.description || '' },
              zone5: { min: swimmingHrZones.zone5?.min || '', max: swimmingHrZones.zone5?.max || '', description: swimmingHrZones.zone5?.description || '' },
              maxHeartRate: swimmingHrZones.maxHeartRate || ''
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
          units: userData.units || { distance: 'metric', weight: 'kg', temperature: 'celsius' },
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
      units: formData.units || { distance: 'metric', weight: 'kg', temperature: 'celsius' },
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
        } : undefined,
        swimming: formData.powerZones.swimming ? {
          zone1: {
            min: formData.powerZones.swimming.zone1.min ? Number(formData.powerZones.swimming.zone1.min) : undefined,
            max: formData.powerZones.swimming.zone1.max ? Number(formData.powerZones.swimming.zone1.max) : undefined,
            description: formData.powerZones.swimming.zone1.description || undefined
          },
          zone2: {
            min: formData.powerZones.swimming.zone2.min ? Number(formData.powerZones.swimming.zone2.min) : undefined,
            max: formData.powerZones.swimming.zone2.max ? Number(formData.powerZones.swimming.zone2.max) : undefined,
            description: formData.powerZones.swimming.zone2.description || undefined
          },
          zone3: {
            min: formData.powerZones.swimming.zone3.min ? Number(formData.powerZones.swimming.zone3.min) : undefined,
            max: formData.powerZones.swimming.zone3.max ? Number(formData.powerZones.swimming.zone3.max) : undefined,
            description: formData.powerZones.swimming.zone3.description || undefined
          },
          zone4: {
            min: formData.powerZones.swimming.zone4.min ? Number(formData.powerZones.swimming.zone4.min) : undefined,
            max: formData.powerZones.swimming.zone4.max ? Number(formData.powerZones.swimming.zone4.max) : undefined,
            description: formData.powerZones.swimming.zone4.description || undefined
          },
          zone5: {
            min: formData.powerZones.swimming.zone5.min ? Number(formData.powerZones.swimming.zone5.min) : undefined,
            max: formData.powerZones.swimming.zone5.max ? Number(formData.powerZones.swimming.zone5.max) : undefined,
            description: formData.powerZones.swimming.zone5.description || undefined
          },
          lt1: formData.powerZones.swimming.lt1 ? Number(formData.powerZones.swimming.lt1) : undefined,
          lt2: formData.powerZones.swimming.lt2 ? Number(formData.powerZones.swimming.lt2) : undefined,
          lastUpdated: new Date()
        } : undefined
      } : undefined,
      heartRateZones: formData.heartRateZones ? {
        cycling: formData.heartRateZones.cycling ? {
          zone1: {
            min: formData.heartRateZones.cycling.zone1.min ? Number(formData.heartRateZones.cycling.zone1.min) : undefined,
            max: formData.heartRateZones.cycling.zone1.max ? Number(formData.heartRateZones.cycling.zone1.max) : undefined,
            description: formData.heartRateZones.cycling.zone1.description || undefined
          },
          zone2: {
            min: formData.heartRateZones.cycling.zone2.min ? Number(formData.heartRateZones.cycling.zone2.min) : undefined,
            max: formData.heartRateZones.cycling.zone2.max ? Number(formData.heartRateZones.cycling.zone2.max) : undefined,
            description: formData.heartRateZones.cycling.zone2.description || undefined
          },
          zone3: {
            min: formData.heartRateZones.cycling.zone3.min ? Number(formData.heartRateZones.cycling.zone3.min) : undefined,
            max: formData.heartRateZones.cycling.zone3.max ? Number(formData.heartRateZones.cycling.zone3.max) : undefined,
            description: formData.heartRateZones.cycling.zone3.description || undefined
          },
          zone4: {
            min: formData.heartRateZones.cycling.zone4.min ? Number(formData.heartRateZones.cycling.zone4.min) : undefined,
            max: formData.heartRateZones.cycling.zone4.max ? Number(formData.heartRateZones.cycling.zone4.max) : undefined,
            description: formData.heartRateZones.cycling.zone4.description || undefined
          },
          zone5: {
            min: formData.heartRateZones.cycling.zone5.min ? Number(formData.heartRateZones.cycling.zone5.min) : undefined,
            max: formData.heartRateZones.cycling.zone5.max ? Number(formData.heartRateZones.cycling.zone5.max) : undefined,
            description: formData.heartRateZones.cycling.zone5.description || undefined
          },
          maxHeartRate: formData.heartRateZones.cycling.maxHeartRate ? Number(formData.heartRateZones.cycling.maxHeartRate) : undefined,
          lastUpdated: formData.heartRateZones.cycling.lastUpdated || new Date()
        } : undefined,
        running: formData.heartRateZones.running ? {
          zone1: {
            min: formData.heartRateZones.running.zone1.min ? Number(formData.heartRateZones.running.zone1.min) : undefined,
            max: formData.heartRateZones.running.zone1.max ? Number(formData.heartRateZones.running.zone1.max) : undefined,
            description: formData.heartRateZones.running.zone1.description || undefined
          },
          zone2: {
            min: formData.heartRateZones.running.zone2.min ? Number(formData.heartRateZones.running.zone2.min) : undefined,
            max: formData.heartRateZones.running.zone2.max ? Number(formData.heartRateZones.running.zone2.max) : undefined,
            description: formData.heartRateZones.running.zone2.description || undefined
          },
          zone3: {
            min: formData.heartRateZones.running.zone3.min ? Number(formData.heartRateZones.running.zone3.min) : undefined,
            max: formData.heartRateZones.running.zone3.max ? Number(formData.heartRateZones.running.zone3.max) : undefined,
            description: formData.heartRateZones.running.zone3.description || undefined
          },
          zone4: {
            min: formData.heartRateZones.running.zone4.min ? Number(formData.heartRateZones.running.zone4.min) : undefined,
            max: formData.heartRateZones.running.zone4.max ? Number(formData.heartRateZones.running.zone4.max) : undefined,
            description: formData.heartRateZones.running.zone4.description || undefined
          },
          zone5: {
            min: formData.heartRateZones.running.zone5.min ? Number(formData.heartRateZones.running.zone5.min) : undefined,
            max: formData.heartRateZones.running.zone5.max ? Number(formData.heartRateZones.running.zone5.max) : undefined,
            description: formData.heartRateZones.running.zone5.description || undefined
          },
          maxHeartRate: formData.heartRateZones.running.maxHeartRate ? Number(formData.heartRateZones.running.maxHeartRate) : undefined,
          lastUpdated: formData.heartRateZones.running.lastUpdated || new Date()
        } : undefined,
        swimming: formData.heartRateZones.swimming ? {
          zone1: {
            min: formData.heartRateZones.swimming.zone1.min ? Number(formData.heartRateZones.swimming.zone1.min) : undefined,
            max: formData.heartRateZones.swimming.zone1.max ? Number(formData.heartRateZones.swimming.zone1.max) : undefined,
            description: formData.heartRateZones.swimming.zone1.description || undefined
          },
          zone2: {
            min: formData.heartRateZones.swimming.zone2.min ? Number(formData.heartRateZones.swimming.zone2.min) : undefined,
            max: formData.heartRateZones.swimming.zone2.max ? Number(formData.heartRateZones.swimming.zone2.max) : undefined,
            description: formData.heartRateZones.swimming.zone2.description || undefined
          },
          zone3: {
            min: formData.heartRateZones.swimming.zone3.min ? Number(formData.heartRateZones.swimming.zone3.min) : undefined,
            max: formData.heartRateZones.swimming.zone3.max ? Number(formData.heartRateZones.swimming.zone3.max) : undefined,
            description: formData.heartRateZones.swimming.zone3.description || undefined
          },
          zone4: {
            min: formData.heartRateZones.swimming.zone4.min ? Number(formData.heartRateZones.swimming.zone4.min) : undefined,
            max: formData.heartRateZones.swimming.zone4.max ? Number(formData.heartRateZones.swimming.zone4.max) : undefined,
            description: formData.heartRateZones.swimming.zone4.description || undefined
          },
          zone5: {
            min: formData.heartRateZones.swimming.zone5.min ? Number(formData.heartRateZones.swimming.zone5.min) : undefined,
            max: formData.heartRateZones.swimming.zone5.max ? Number(formData.heartRateZones.swimming.zone5.max) : undefined,
            description: formData.heartRateZones.swimming.zone5.description || undefined
          },
          maxHeartRate: formData.heartRateZones.swimming.maxHeartRate ? Number(formData.heartRateZones.swimming.maxHeartRate) : undefined,
          lastUpdated: formData.heartRateZones.swimming.lastUpdated || new Date()
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
      const sportName = sport === 'cycling' ? 'cycling' : sport === 'running' ? 'running' : 'swimming';
      setError(`Please enter both LTP1 and LTP2 for ${sportName}`);
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
    } else if (sport === 'running' || sport === 'swimming') {
      // For running and swimming: LTP2 < LTP1 (pace in seconds - faster pace = lower seconds)
      // Swimming pace is typically per 100m
      if (lt2 >= lt1) {
        const sportName = sport === 'running' ? 'running' : 'swimming';
        setError(`LTP2 must be less than LTP1 for ${sportName} (faster pace = lower seconds)`);
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
          [sport]: {
            ...prev.powerZones?.[sport],
            ...zones,
            lt1: lt1,
            lt2: lt2
          }
        }
      }));
    }

    setError('');
  };

  // Generate heart rate zones from max HR
  const generateHeartRateZones = (sport) => {
    const maxHR = parseFloat(formData.heartRateZones?.[sport]?.maxHeartRate);
    
    if (!maxHR || isNaN(maxHR) || maxHR <= 0) {
      const sportName = sport === 'cycling' ? 'cycling' : sport === 'running' ? 'running' : 'swimming';
      setError(`Please enter a valid max heart rate for ${sportName}`);
      return;
    }

    // Standard percentage-based HR zones - min should be lower, max should be higher
    const zones = {
      zone1: {
        min: Math.round(maxHR * 0.50),
        max: Math.round(maxHR * 0.60),
        description: '50–60% Max HR (Recovery)'
      },
      zone2: {
        min: Math.round(maxHR * 0.60),
        max: Math.round(maxHR * 0.70),
        description: '60–70% Max HR (Aerobic)'
      },
      zone3: {
        min: Math.round(maxHR * 0.70),
        max: Math.round(maxHR * 0.80),
        description: '70–80% Max HR (Tempo)'
      },
      zone4: {
        min: Math.round(maxHR * 0.80),
        max: Math.round(maxHR * 0.90),
        description: '80–90% Max HR (Threshold)'
      },
      zone5: {
        min: Math.round(maxHR * 0.90),
        max: Math.round(maxHR * 1.00),
        description: '90–100% Max HR (VO2max)'
      }
    };
    
    // Ensure min < max for all zones
    Object.keys(zones).forEach(zoneKey => {
      if (zones[zoneKey].min > zones[zoneKey].max) {
        const temp = zones[zoneKey].min;
        zones[zoneKey].min = zones[zoneKey].max;
        zones[zoneKey].max = temp;
      }
    });

    setFormData(prev => ({
      ...prev,
      heartRateZones: {
        ...prev.heartRateZones,
        [sport]: {
          ...prev.heartRateZones?.[sport],
          ...zones,
          maxHeartRate: maxHR,
          lastUpdated: new Date()
        }
      }
    }));

    setError('');
  };

  // Format pace for display (seconds to mm:ss)
  const formatPace = (seconds) => {
    if (!seconds || seconds === 0 || isNaN(seconds)) return '';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
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

        {/* Units Preferences Section */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Units Preferences</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Distance</label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="distance"
                    value="metric"
                    checked={formData.units?.distance === 'metric'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      units: { ...prev.units, distance: e.target.value }
                    }))}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-600">Metric (km, m)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="distance"
                    value="imperial"
                    checked={formData.units?.distance === 'imperial'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      units: { ...prev.units, distance: e.target.value }
                    }))}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-600">Imperial (miles, feet)</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Weight</label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="weight"
                    value="kg"
                    checked={formData.units?.weight === 'kg'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      units: { ...prev.units, weight: e.target.value }
                    }))}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-600">Kilograms (kg)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="weight"
                    value="lbs"
                    checked={formData.units?.weight === 'lbs'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      units: { ...prev.units, weight: e.target.value }
                    }))}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-600">Pounds (lbs)</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Temperature</label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="temperature"
                    value="celsius"
                    checked={formData.units?.temperature === 'celsius'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      units: { ...prev.units, temperature: e.target.value }
                    }))}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-600">Celsius (°C)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="temperature"
                    value="fahrenheit"
                    checked={formData.units?.temperature === 'fahrenheit'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      units: { ...prev.units, temperature: e.target.value }
                    }))}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-600">Fahrenheit (°F)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Power Zones Section */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h3 className="text-xl font-bold text-gray-900">Training Zones</h3>
            <div className="flex gap-2 flex-wrap">
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
              <button
                type="button"
                onClick={() => setSelectedSport('swimming')}
                className={`px-4 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                  selectedSport === 'swimming'
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Swimming
              </button>
            </div>
          </div>
          
          <p className="text-sm text-gray-600 mb-6 bg-blue-50 p-4 rounded-xl border border-blue-100">
            {selectedSport === 'cycling' 
              ? 'Set LTP1 and LTP2 (in watts) to automatically generate power zones, or set zones manually.'
              : selectedSport === 'running'
              ? 'Set LTP1 and LTP2 (LTP2 is threshold pace, in seconds, e.g., 240 for 4:00/km) to automatically generate pace zones, or set zones manually. You can also enter Max Heart Rate to generate heart rate zones.'
              : 'Set LTP1 and LTP2 (LTP2 is threshold pace, in seconds per 100m, e.g., 90 for 1:30/100m) to automatically generate pace zones, or set zones manually. You can also enter Max Heart Rate to generate heart rate zones.'}
          </p>
          
          <div className="space-y-6">
            {/* LTP1, LTP2 and Max Heart Rate */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  LTP1 {selectedSport === 'cycling' ? '(W)' : selectedSport === 'running' ? '(seconds, e.g., 240 for 4:00/km)' : '(seconds per 100m, e.g., 90 for 1:30/100m)'}
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
                  placeholder={selectedSport === 'cycling' ? 'e.g. 200' : selectedSport === 'running' ? 'e.g. 240' : 'e.g. 90'}
                />
                {selectedSport === 'running' && formData.powerZones?.running?.lt1 && (
                  <p className="text-xs text-gray-500 mt-1 font-medium">
                    {formatPace(Number(formData.powerZones.running.lt1))} /km
                  </p>
                )}
                {selectedSport === 'swimming' && formData.powerZones?.swimming?.lt1 && (
                  <p className="text-xs text-gray-500 mt-1 font-medium">
                    {formatPace(Number(formData.powerZones.swimming.lt1))} /100m
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  LTP2 (Threshold) {selectedSport === 'cycling' ? '(W)' : selectedSport === 'running' ? '(seconds, e.g., 200 for 3:20/km)' : '(seconds per 100m, e.g., 75 for 1:15/100m)'}
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
                  placeholder={selectedSport === 'cycling' ? 'e.g. 280' : selectedSport === 'running' ? 'e.g. 200' : 'e.g. 75'}
                />
                {selectedSport === 'running' && formData.powerZones?.running?.lt2 && (
                  <p className="text-xs text-gray-500 mt-1 font-medium">
                    {formatPace(Number(formData.powerZones.running.lt2))} /km
                  </p>
                )}
                {selectedSport === 'swimming' && formData.powerZones?.swimming?.lt2 && (
                  <p className="text-xs text-gray-500 mt-1 font-medium">
                    {formatPace(Number(formData.powerZones.swimming.lt2))} /100m
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700">
                  Max Heart Rate (BPM)
                </label>
                <input
                  type="number"
                  value={formData.heartRateZones?.[selectedSport]?.maxHeartRate || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    heartRateZones: {
                      ...prev.heartRateZones,
                      [selectedSport]: {
                        ...prev.heartRateZones?.[selectedSport],
                        maxHeartRate: e.target.value
                      }
                    }
                  }))}
                  className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="e.g. 190"
                />
              </div>
            </div>

            {/* Generate Zones Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => generateZones(selectedSport)}
                className="w-full px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary-dark font-semibold shadow-md hover:shadow-lg transition-all"
              >
                Generate Zones from LTP1 & LTP2
              </button>
              <button
                type="button"
                onClick={() => generateHeartRateZones(selectedSport)}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold shadow-md hover:shadow-lg transition-all"
              >
                Generate HR Zones from Max HR
              </button>
            </div>

            {/* Combined Zone inputs - Power/Pace and Heart Rate together */}
            <div className="space-y-1">
              {[1, 2, 3, 4, 5].map(zoneNum => (
                <div key={zoneNum} className="p-2 bg-gray-50 rounded-md border border-gray-200">
                  <div className="flex items-start gap-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs flex-shrink-0 mt-1 ${
                      zoneNum === 1 ? 'bg-blue-100 text-blue-700' :
                      zoneNum === 2 ? 'bg-green-100 text-green-700' :
                      zoneNum === 3 ? 'bg-yellow-100 text-yellow-700' :
                      zoneNum === 4 ? 'bg-orange-100 text-orange-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {zoneNum}
                    </span>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Power/Pace Zones */}
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700 mb-1">
                          {selectedSport === 'cycling' ? 'Power (W)' : selectedSport === 'running' ? 'Pace (s)' : 'Pace (s/100m)'}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="min-w-0">
                            <label className="block text-xs font-medium text-gray-600 mb-0.5">Min</label>
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
                              className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition-all"
                              placeholder="Min"
                            />
                            {selectedSport === 'running' && formData.powerZones?.running?.[`zone${zoneNum}`]?.min && (
                              <p className="text-xs text-gray-400 mt-0.5 leading-tight">
                                {formatPace(Number(formData.powerZones.running[`zone${zoneNum}`].min))}
                              </p>
                            )}
                            {selectedSport === 'swimming' && formData.powerZones?.swimming?.[`zone${zoneNum}`]?.min && (
                              <p className="text-xs text-gray-400 mt-0.5 leading-tight">
                                {formatPace(Number(formData.powerZones.swimming[`zone${zoneNum}`].min))} /100m
                              </p>
                            )}
                          </div>
                          <div className="min-w-0">
                            <label className="block text-xs font-medium text-gray-600 mb-0.5">Max</label>
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
                              className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition-all"
                              placeholder={zoneNum === 5 ? "∞" : "Max"}
                            />
                            {selectedSport === 'running' && formData.powerZones?.running?.[`zone${zoneNum}`]?.max && (
                              <p className="text-xs text-gray-400 mt-0.5 leading-tight">
                                {formatPace(Number(formData.powerZones.running[`zone${zoneNum}`].max))}
                              </p>
                            )}
                            {selectedSport === 'swimming' && formData.powerZones?.swimming?.[`zone${zoneNum}`]?.max && (
                              <p className="text-xs text-gray-400 mt-0.5 leading-tight">
                                {formatPace(Number(formData.powerZones.swimming[`zone${zoneNum}`].max))} /100m
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Heart Rate Zones */}
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-700 mb-1">Heart Rate (BPM)</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="min-w-0">
                            <label className="block text-xs font-medium text-gray-600 mb-0.5">Min</label>
                            <input
                              type="number"
                              value={formData.heartRateZones?.[selectedSport]?.[`zone${zoneNum}`]?.min || ''}
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                heartRateZones: {
                                  ...prev.heartRateZones,
                                  [selectedSport]: {
                                    ...prev.heartRateZones?.[selectedSport],
                                    [`zone${zoneNum}`]: {
                                      ...prev.heartRateZones?.[selectedSport]?.[`zone${zoneNum}`],
                                      min: e.target.value
                                    }
                                  }
                                }
                              }))}
                              className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition-all"
                              placeholder="Min"
                            />
                          </div>
                          <div className="min-w-0">
                            <label className="block text-xs font-medium text-gray-600 mb-0.5">Max</label>
                            <input
                              type="number"
                              value={formData.heartRateZones?.[selectedSport]?.[`zone${zoneNum}`]?.max || ''}
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                heartRateZones: {
                                  ...prev.heartRateZones,
                                  [selectedSport]: {
                                    ...prev.heartRateZones?.[selectedSport],
                                    [`zone${zoneNum}`]: {
                                      ...prev.heartRateZones?.[selectedSport]?.[`zone${zoneNum}`],
                                      max: e.target.value
                                    }
                                  }
                                }
                              }))}
                              className="w-full px-2 py-1 text-xs bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent transition-all"
                              placeholder={zoneNum === 5 ? "∞" : "Max"}
                            />
                          </div>
                        </div>
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