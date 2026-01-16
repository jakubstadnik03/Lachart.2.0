import React, { useState, useEffect } from 'react';
import Modal from '../Modal';

const TrainingZonesModal = ({ isOpen, onClose, onSubmit, userData }) => {
  const [formData, setFormData] = useState({});
  const [error, setError] = useState('');
  const [selectedSport, setSelectedSport] = useState('cycling');

  useEffect(() => {
    if (userData) {
      if (userData._selectedSport) {
        setSelectedSport(userData._selectedSport);
      }
      const cyclingZones = userData.powerZones?.cycling || {};
      const runningZones = userData.powerZones?.running || {};
      const swimmingZones = userData.powerZones?.swimming || {};
      const cyclingHrZones = userData.heartRateZones?.cycling || {};
      const runningHrZones = userData.heartRateZones?.running || {};
      const swimmingHrZones = userData.heartRateZones?.swimming || {};
      
      setFormData({
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
            zone1: { min: runningZones.zone1?.min !== undefined && runningZones.zone1?.min !== null ? String(runningZones.zone1.min) : '', max: runningZones.zone1?.max !== undefined && runningZones.zone1?.max !== null ? String(runningZones.zone1.max) : '', description: runningZones.zone1?.description || '' },
            zone2: { min: runningZones.zone2?.min !== undefined && runningZones.zone2?.min !== null ? String(runningZones.zone2.min) : '', max: runningZones.zone2?.max !== undefined && runningZones.zone2?.max !== null ? String(runningZones.zone2.max) : '', description: runningZones.zone2?.description || '' },
            zone3: { min: runningZones.zone3?.min !== undefined && runningZones.zone3?.min !== null ? String(runningZones.zone3.min) : '', max: runningZones.zone3?.max !== undefined && runningZones.zone3?.max !== null ? String(runningZones.zone3.max) : '', description: runningZones.zone3?.description || '' },
            zone4: { min: runningZones.zone4?.min !== undefined && runningZones.zone4?.min !== null ? String(runningZones.zone4.min) : '', max: runningZones.zone4?.max !== undefined && runningZones.zone4?.max !== null ? String(runningZones.zone4.max) : '', description: runningZones.zone4?.description || '' },
            zone5: { min: runningZones.zone5?.min !== undefined && runningZones.zone5?.min !== null ? String(runningZones.zone5.min) : '', max: runningZones.zone5?.max !== undefined && runningZones.zone5?.max !== null ? String(runningZones.zone5.max) : '', description: runningZones.zone5?.description || '' },
            lt1: runningZones.lt1 || '',
            lt2: runningZones.lt2 || ''
          },
          swimming: {
            zone1: { min: swimmingZones.zone1?.min !== undefined && swimmingZones.zone1?.min !== null ? String(swimmingZones.zone1.min) : '', max: swimmingZones.zone1?.max !== undefined && swimmingZones.zone1?.max !== null ? String(swimmingZones.zone1.max) : '', description: swimmingZones.zone1?.description || '' },
            zone2: { min: swimmingZones.zone2?.min !== undefined && swimmingZones.zone2?.min !== null ? String(swimmingZones.zone2.min) : '', max: swimmingZones.zone2?.max !== undefined && swimmingZones.zone2?.max !== null ? String(swimmingZones.zone2.max) : '', description: swimmingZones.zone2?.description || '' },
            zone3: { min: swimmingZones.zone3?.min !== undefined && swimmingZones.zone3?.min !== null ? String(swimmingZones.zone3.min) : '', max: swimmingZones.zone3?.max !== undefined && swimmingZones.zone3?.max !== null ? String(swimmingZones.zone3.max) : '', description: swimmingZones.zone3?.description || '' },
            zone4: { min: swimmingZones.zone4?.min !== undefined && swimmingZones.zone4?.min !== null ? String(swimmingZones.zone4.min) : '', max: swimmingZones.zone4?.max !== undefined && swimmingZones.zone4?.max !== null ? String(swimmingZones.zone4.max) : '', description: swimmingZones.zone4?.description || '' },
            zone5: { min: swimmingZones.zone5?.min !== undefined && swimmingZones.zone5?.min !== null ? String(swimmingZones.zone5.min) : '', max: swimmingZones.zone5?.max !== undefined && swimmingZones.zone5?.max !== null ? String(swimmingZones.zone5.max) : '', description: swimmingZones.zone5?.description || '' },
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
      });
    }
  }, [userData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const dataToSubmit = {
      powerZones: formData.powerZones ? {
        cycling: formData.powerZones.cycling ? {
          zone1: { min: formData.powerZones.cycling.zone1.min ? Number(formData.powerZones.cycling.zone1.min) : undefined, max: formData.powerZones.cycling.zone1.max ? Number(formData.powerZones.cycling.zone1.max) : undefined, description: formData.powerZones.cycling.zone1.description || undefined },
          zone2: { min: formData.powerZones.cycling.zone2.min ? Number(formData.powerZones.cycling.zone2.min) : undefined, max: formData.powerZones.cycling.zone2.max ? Number(formData.powerZones.cycling.zone2.max) : undefined, description: formData.powerZones.cycling.zone2.description || undefined },
          zone3: { min: formData.powerZones.cycling.zone3.min ? Number(formData.powerZones.cycling.zone3.min) : undefined, max: formData.powerZones.cycling.zone3.max ? Number(formData.powerZones.cycling.zone3.max) : undefined, description: formData.powerZones.cycling.zone3.description || undefined },
          zone4: { min: formData.powerZones.cycling.zone4.min ? Number(formData.powerZones.cycling.zone4.min) : undefined, max: formData.powerZones.cycling.zone4.max ? Number(formData.powerZones.cycling.zone4.max) : undefined, description: formData.powerZones.cycling.zone4.description || undefined },
          zone5: { min: formData.powerZones.cycling.zone5.min ? Number(formData.powerZones.cycling.zone5.min) : undefined, max: formData.powerZones.cycling.zone5.max ? Number(formData.powerZones.cycling.zone5.max) : undefined, description: formData.powerZones.cycling.zone5.description || undefined },
          lt1: formData.powerZones.cycling.lt1 ? Number(formData.powerZones.cycling.lt1) : undefined,
          lt2: formData.powerZones.cycling.lt2 ? Number(formData.powerZones.cycling.lt2) : undefined,
          lastUpdated: new Date()
        } : undefined,
        running: formData.powerZones.running ? {
          zone1: { min: formData.powerZones.running.zone1.min ? Number(formData.powerZones.running.zone1.min) : undefined, max: formData.powerZones.running.zone1.max ? Number(formData.powerZones.running.zone1.max) : undefined, description: formData.powerZones.running.zone1.description || undefined },
          zone2: { min: formData.powerZones.running.zone2.min ? Number(formData.powerZones.running.zone2.min) : undefined, max: formData.powerZones.running.zone2.max ? Number(formData.powerZones.running.zone2.max) : undefined, description: formData.powerZones.running.zone2.description || undefined },
          zone3: { min: formData.powerZones.running.zone3.min ? Number(formData.powerZones.running.zone3.min) : undefined, max: formData.powerZones.running.zone3.max ? Number(formData.powerZones.running.zone3.max) : undefined, description: formData.powerZones.running.zone3.description || undefined },
          zone4: { min: formData.powerZones.running.zone4.min ? Number(formData.powerZones.running.zone4.min) : undefined, max: formData.powerZones.running.zone4.max ? Number(formData.powerZones.running.zone4.max) : undefined, description: formData.powerZones.running.zone4.description || undefined },
          zone5: { min: formData.powerZones.running.zone5.min ? Number(formData.powerZones.running.zone5.min) : undefined, max: formData.powerZones.running.zone5.max ? Number(formData.powerZones.running.zone5.max) : undefined, description: formData.powerZones.running.zone5.description || undefined },
          lt1: formData.powerZones.running.lt1 ? Number(formData.powerZones.running.lt1) : undefined,
          lt2: formData.powerZones.running.lt2 ? Number(formData.powerZones.running.lt2) : undefined,
          lastUpdated: new Date()
        } : undefined,
        swimming: formData.powerZones.swimming ? {
          zone1: { min: formData.powerZones.swimming.zone1.min ? Number(formData.powerZones.swimming.zone1.min) : undefined, max: formData.powerZones.swimming.zone1.max ? Number(formData.powerZones.swimming.zone1.max) : undefined, description: formData.powerZones.swimming.zone1.description || undefined },
          zone2: { min: formData.powerZones.swimming.zone2.min ? Number(formData.powerZones.swimming.zone2.min) : undefined, max: formData.powerZones.swimming.zone2.max ? Number(formData.powerZones.swimming.zone2.max) : undefined, description: formData.powerZones.swimming.zone2.description || undefined },
          zone3: { min: formData.powerZones.swimming.zone3.min ? Number(formData.powerZones.swimming.zone3.min) : undefined, max: formData.powerZones.swimming.zone3.max ? Number(formData.powerZones.swimming.zone3.max) : undefined, description: formData.powerZones.swimming.zone3.description || undefined },
          zone4: { min: formData.powerZones.swimming.zone4.min ? Number(formData.powerZones.swimming.zone4.min) : undefined, max: formData.powerZones.swimming.zone4.max ? Number(formData.powerZones.swimming.zone4.max) : undefined, description: formData.powerZones.swimming.zone4.description || undefined },
          zone5: { min: formData.powerZones.swimming.zone5.min ? Number(formData.powerZones.swimming.zone5.min) : undefined, max: formData.powerZones.swimming.zone5.max ? Number(formData.powerZones.swimming.zone5.max) : undefined, description: formData.powerZones.swimming.zone5.description || undefined },
          lt1: formData.powerZones.swimming.lt1 ? Number(formData.powerZones.swimming.lt1) : undefined,
          lt2: formData.powerZones.swimming.lt2 ? Number(formData.powerZones.swimming.lt2) : undefined,
          lastUpdated: new Date()
        } : undefined
      } : undefined,
      heartRateZones: formData.heartRateZones ? {
        cycling: formData.heartRateZones.cycling ? {
          zone1: { min: formData.heartRateZones.cycling.zone1.min ? Number(formData.heartRateZones.cycling.zone1.min) : undefined, max: formData.heartRateZones.cycling.zone1.max ? Number(formData.heartRateZones.cycling.zone1.max) : undefined, description: formData.heartRateZones.cycling.zone1.description || undefined },
          zone2: { min: formData.heartRateZones.cycling.zone2.min ? Number(formData.heartRateZones.cycling.zone2.min) : undefined, max: formData.heartRateZones.cycling.zone2.max ? Number(formData.heartRateZones.cycling.zone2.max) : undefined, description: formData.heartRateZones.cycling.zone2.description || undefined },
          zone3: { min: formData.heartRateZones.cycling.zone3.min ? Number(formData.heartRateZones.cycling.zone3.min) : undefined, max: formData.heartRateZones.cycling.zone3.max ? Number(formData.heartRateZones.cycling.zone3.max) : undefined, description: formData.heartRateZones.cycling.zone3.description || undefined },
          zone4: { min: formData.heartRateZones.cycling.zone4.min ? Number(formData.heartRateZones.cycling.zone4.min) : undefined, max: formData.heartRateZones.cycling.zone4.max ? Number(formData.heartRateZones.cycling.zone4.max) : undefined, description: formData.heartRateZones.cycling.zone4.description || undefined },
          zone5: { min: formData.heartRateZones.cycling.zone5.min ? Number(formData.heartRateZones.cycling.zone5.min) : undefined, max: formData.heartRateZones.cycling.zone5.max ? Number(formData.heartRateZones.cycling.zone5.max) : undefined, description: formData.heartRateZones.cycling.zone5.description || undefined },
          maxHeartRate: formData.heartRateZones.cycling.maxHeartRate ? Number(formData.heartRateZones.cycling.maxHeartRate) : undefined,
          lastUpdated: formData.heartRateZones.cycling.lastUpdated || new Date()
        } : undefined,
        running: formData.heartRateZones.running ? {
          zone1: { min: formData.heartRateZones.running.zone1.min ? Number(formData.heartRateZones.running.zone1.min) : undefined, max: formData.heartRateZones.running.zone1.max ? Number(formData.heartRateZones.running.zone1.max) : undefined, description: formData.heartRateZones.running.zone1.description || undefined },
          zone2: { min: formData.heartRateZones.running.zone2.min ? Number(formData.heartRateZones.running.zone2.min) : undefined, max: formData.heartRateZones.running.zone2.max ? Number(formData.heartRateZones.running.zone2.max) : undefined, description: formData.heartRateZones.running.zone2.description || undefined },
          zone3: { min: formData.heartRateZones.running.zone3.min ? Number(formData.heartRateZones.running.zone3.min) : undefined, max: formData.heartRateZones.running.zone3.max ? Number(formData.heartRateZones.running.zone3.max) : undefined, description: formData.heartRateZones.running.zone3.description || undefined },
          zone4: { min: formData.heartRateZones.running.zone4.min ? Number(formData.heartRateZones.running.zone4.min) : undefined, max: formData.heartRateZones.running.zone4.max ? Number(formData.heartRateZones.running.zone4.max) : undefined, description: formData.heartRateZones.running.zone4.description || undefined },
          zone5: { min: formData.heartRateZones.running.zone5.min ? Number(formData.heartRateZones.running.zone5.min) : undefined, max: formData.heartRateZones.running.zone5.max ? Number(formData.heartRateZones.running.zone5.max) : undefined, description: formData.heartRateZones.running.zone5.description || undefined },
          maxHeartRate: formData.heartRateZones.running.maxHeartRate ? Number(formData.heartRateZones.running.maxHeartRate) : undefined,
          lastUpdated: formData.heartRateZones.running.lastUpdated || new Date()
        } : undefined,
        swimming: formData.heartRateZones.swimming ? {
          zone1: { min: formData.heartRateZones.swimming.zone1.min ? Number(formData.heartRateZones.swimming.zone1.min) : undefined, max: formData.heartRateZones.swimming.zone1.max ? Number(formData.heartRateZones.swimming.zone1.max) : undefined, description: formData.heartRateZones.swimming.zone1.description || undefined },
          zone2: { min: formData.heartRateZones.swimming.zone2.min ? Number(formData.heartRateZones.swimming.zone2.min) : undefined, max: formData.heartRateZones.swimming.zone2.max ? Number(formData.heartRateZones.swimming.zone2.max) : undefined, description: formData.heartRateZones.swimming.zone2.description || undefined },
          zone3: { min: formData.heartRateZones.swimming.zone3.min ? Number(formData.heartRateZones.swimming.zone3.min) : undefined, max: formData.heartRateZones.swimming.zone3.max ? Number(formData.heartRateZones.swimming.zone3.max) : undefined, description: formData.heartRateZones.swimming.zone3.description || undefined },
          zone4: { min: formData.heartRateZones.swimming.zone4.min ? Number(formData.heartRateZones.swimming.zone4.min) : undefined, max: formData.heartRateZones.swimming.zone4.max ? Number(formData.heartRateZones.swimming.zone4.max) : undefined, description: formData.heartRateZones.swimming.zone4.description || undefined },
          zone5: { min: formData.heartRateZones.swimming.zone5.min ? Number(formData.heartRateZones.swimming.zone5.min) : undefined, max: formData.heartRateZones.swimming.zone5.max ? Number(formData.heartRateZones.swimming.zone5.max) : undefined, description: formData.heartRateZones.swimming.zone5.description || undefined },
          maxHeartRate: formData.heartRateZones.swimming.maxHeartRate ? Number(formData.heartRateZones.swimming.maxHeartRate) : undefined,
          lastUpdated: formData.heartRateZones.swimming.lastUpdated || new Date()
        } : undefined
      } : undefined
    };

    onSubmit(dataToSubmit);
  };

  // Copy generateZones and generateHeartRateZones functions from EditProfileModal
  const generateZones = (sport) => {
    const lt1 = parseFloat(formData.powerZones?.[sport]?.lt1);
    const lt2 = parseFloat(formData.powerZones?.[sport]?.lt2);

    if (!lt1 || !lt2 || isNaN(lt1) || isNaN(lt2)) {
      const sportName = sport === 'cycling' ? 'cycling' : sport === 'running' ? 'running' : 'swimming';
      setError(`Please enter both LTP1 and LTP2 for ${sportName}`);
      return;
    }

    if (sport === 'cycling') {
      if (lt2 <= lt1) {
        setError('LTP2 must be greater than LTP1 for cycling');
        return;
      }
      const zones = {
        zone1: { min: Math.round(lt1 * 0.70), max: Math.round(lt1 * 0.90), description: '70–90% LT1 (recovery, reference wide zone)' },
        zone2: { min: Math.round(lt1 * 0.90), max: Math.round(lt1 * 1.00), description: '90%–100% LT1' },
        zone3: { min: Math.round(lt1 * 1.00), max: Math.round(lt2 * 0.95), description: '100% LT1 – 95% LT2' },
        zone4: { min: Math.round(lt2 * 0.96), max: Math.round(lt2 * 1.04), description: '96%–104% LT2 (threshold)' },
        zone5: { min: Math.round(lt2 * 1.05), max: Math.round(lt2 * 1.20), description: '105–120% LT2 (sprint/VO2max+ reference)' }
      };
      setFormData(prev => ({
        ...prev,
        powerZones: {
          ...prev.powerZones,
          cycling: { ...prev.powerZones?.cycling, ...zones, lt1: lt1, lt2: lt2 }
        }
      }));
    } else if (sport === 'running' || sport === 'swimming') {
      if (lt2 >= lt1) {
        const sportName = sport === 'running' ? 'running' : 'swimming';
        setError(`LTP2 must be less than LTP1 for ${sportName} (faster pace = lower seconds)`);
        return;
      }
      const zones = {
        zone1: { min: Math.round(lt1 / 0.70), max: Math.round(lt1 / 0.90), description: '70–90% LT1 (recovery, reference wide zone)' },
        zone2: { min: Math.round(lt1 / 0.90), max: Math.round(lt1 / 1.00), description: '90%–100% LT1' },
        zone3: { min: Math.round(lt1 / 1.00), max: Math.round(lt2 / 0.95), description: '100% LT1 – 95% LT2' },
        zone4: { min: Math.round(lt2 / 0.96), max: Math.round(lt2 / 1.04), description: '96%–104% LT2 (threshold)' },
        zone5: { min: Math.round(lt2 / 1.05), max: Math.round(lt2 / 1.20), description: '105–120% LT2 (sprint/VO2max+ reference)' }
      };
      setFormData(prev => ({
        ...prev,
        powerZones: {
          ...prev.powerZones,
          [sport]: { ...prev.powerZones?.[sport], ...zones, lt1: lt1, lt2: lt2 }
        }
      }));
    }
    setError('');
  };

  const generateHeartRateZones = (sport) => {
    const maxHR = parseFloat(formData.heartRateZones?.[sport]?.maxHeartRate);
    
    if (!maxHR || isNaN(maxHR) || maxHR <= 0) {
      const sportName = sport === 'cycling' ? 'cycling' : sport === 'running' ? 'running' : 'swimming';
      setError(`Please enter a valid max heart rate for ${sportName}`);
      return;
    }

    const zones = {
      zone1: { min: Math.round(maxHR * 0.50), max: Math.round(maxHR * 0.60), description: '50–60% Max HR (Recovery)' },
      zone2: { min: Math.round(maxHR * 0.60), max: Math.round(maxHR * 0.70), description: '60–70% Max HR (Aerobic)' },
      zone3: { min: Math.round(maxHR * 0.70), max: Math.round(maxHR * 0.80), description: '70–80% Max HR (Tempo)' },
      zone4: { min: Math.round(maxHR * 0.80), max: Math.round(maxHR * 0.90), description: '80–90% Max HR (Threshold)' },
      zone5: { min: Math.round(maxHR * 0.90), max: Math.round(maxHR * 1.00), description: '90–100% Max HR (VO2max)' }
    };
    
    setFormData(prev => ({
      ...prev,
      heartRateZones: {
        ...prev.heartRateZones,
        [sport]: { ...prev.heartRateZones?.[sport], ...zones, maxHeartRate: maxHR, lastUpdated: new Date() }
      }
    }));

    setError('');
  };

  const formatPace = (seconds) => {
    if (!seconds || seconds === 0 || isNaN(seconds)) return '';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set Up Training Zones">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 text-sm text-red-700 bg-red-50 rounded-xl border border-red-200">
            {error}
          </div>
        )}

        <p className="text-sm text-gray-600 mb-4">
          Configure your training zones for power/pace and heart rate. You can generate zones automatically from LTP1/LTP2 or Max HR, or set them manually.
        </p>

        {/* Training Zones Section - simplified version from EditProfileModal */}
        <div className="mt-6 pt-6 border-t border-gray-200">
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
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
          >
            Skip for now
          </button>
          <button
            type="submit"
            className="px-6 py-3 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-dark shadow-md hover:shadow-lg transition-all"
          >
            Continue
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default TrainingZonesModal;
