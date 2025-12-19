"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Radar } from "react-chartjs-2";
import { DropdownMenu } from "../DropDownMenu";
import api from "../../services/api";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";

// Register Chart.js plugins once
ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export default function SpiderChart({ trainings = [], userTrainings = [], selectedSport, setSelectedSport, calendarData = [] }) {
  const [loading, setLoading] = useState(false);
  
  // Load comparePeriod from localStorage or default to '90days'
  const [comparePeriod, setComparePeriod] = useState(() => {
    try {
      const saved = localStorage.getItem('powerRadar_comparePeriod');
      return saved || '90days';
    } catch (e) {
      return '90days';
    }
  });
  
  // Save comparePeriod to localStorage when it changes
  useEffect(() => {
        try {
      localStorage.setItem('powerRadar_comparePeriod', comparePeriod);
        } catch (e) {
      console.warn('[SpiderChart] Error saving comparePeriod to localStorage:', e);
    }
  }, [comparePeriod]);
  
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  
  // Load selectedMonths from localStorage
  const [selectedMonths, setSelectedMonths] = useState(() => {
    try {
      const saved = localStorage.getItem('powerRadar_selectedMonths');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  
  // Save selectedMonths to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('powerRadar_selectedMonths', JSON.stringify(selectedMonths));
    } catch (e) {
      console.warn('[SpiderChart] Error saving selectedMonths to localStorage:', e);
    }
  }, [selectedMonths]);
  
  // Get current selected sport
  const currentSelectedSport = selectedSport || 'bike';

  // Power metrics state
  const [powerMetrics, setPowerMetrics] = useState({
    allTime: { sprint5s: 0, attack1min: 0, vo2max5min: 0, threshold20min: 0, endurance60min: 0 },
    compare: { sprint5s: 0, attack1min: 0, vo2max5min: 0, threshold20min: 0, endurance60min: 0 },
    personalRecords: {
      sprint5s: { value: 0, date: null },
      attack1min: { value: 0, date: null },
      vo2max5min: { value: 0, date: null },
      threshold20min: { value: 0, date: null },
      endurance60min: { value: 0, date: null }
    },
    improvements: {
      sprint5s: null,
      attack1min: null,
      vo2max5min: null,
      threshold20min: null,
      endurance60min: null
    },
    monthlyMetrics: {}
  });

  // Load power metrics from backend or cache
  useEffect(() => {
    const loadPowerMetrics = async () => {
      if (currentSelectedSport !== 'bike' && currentSelectedSport !== 'all') {
        return;
      }
      
      // Define cache keys outside try block so they're accessible in catch
      const cacheKey = `powerRadar_metrics_${comparePeriod}_${selectedMonths.join(',')}`;
      const cacheTimestampKey = `powerRadar_metrics_timestamp_${comparePeriod}_${selectedMonths.join(',')}`;
      const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours - long cache to reduce API calls
      
      try {
        // Check localStorage cache first
        const cachedData = localStorage.getItem(cacheKey);
        const cacheTimestamp = localStorage.getItem(cacheTimestampKey);
        const now = Date.now();
        
        // Use cache if it exists and is less than 24 hours old
        if (cachedData && cacheTimestamp) {
          const cacheAge = now - parseInt(cacheTimestamp);
          if (cacheAge < CACHE_DURATION) {
            try {
              const parsed = JSON.parse(cachedData);
              // Validate that parsed data has the expected structure
              if (parsed && parsed.allTime && typeof parsed.allTime === 'object') {
                setPowerMetrics(parsed);
                setLoading(false);
                console.log('[SpiderChart] Using cached power metrics (valid)');
                return;
              } else {
                console.warn('[SpiderChart] Cached data has invalid structure, loading from API');
              }
            } catch (e) {
              console.error('[SpiderChart] Error parsing cached power metrics:', e);
            }
    } else {
            // Cache exists but is expired - use it as fallback while loading
            try {
              const parsed = JSON.parse(cachedData);
              if (parsed && parsed.allTime && typeof parsed.allTime === 'object') {
                setPowerMetrics(parsed);
                console.log('[SpiderChart] Using expired cache as fallback');
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
        
        // Set loading state before API call
        setLoading(true);
        
        // Load from API
        const params = new URLSearchParams();
        if (comparePeriod) params.append('comparePeriod', comparePeriod);
        if (selectedMonths.length > 0) {
          selectedMonths.forEach(month => params.append('selectedMonths', month));
        }
        
        const response = await api.get(`/api/fit/power-metrics?${params.toString()}`);
        const metrics = response.data;
        
        // Validate API response
        if (!metrics || !metrics.allTime || typeof metrics.allTime !== 'object') {
          console.error('[SpiderChart] Invalid API response structure:', metrics);
          setLoading(false);
          return;
        }
        
        // Cache the result
        try {
          const metricsCacheData = JSON.stringify(metrics);
          if (metricsCacheData.length < 50000) { // Only cache if < 50KB
            localStorage.setItem(cacheKey, metricsCacheData);
            localStorage.setItem(cacheTimestampKey, now.toString());
            console.log('[SpiderChart] Cached power metrics');
          }
        } catch (e) {
          // Ignore cache errors
          console.warn('[SpiderChart] Error caching power metrics:', e);
        }
        
        setPowerMetrics(metrics);
      } catch (error) {
        // If network error or empty response, try to use cached data even if expired
        if (error.code === 'ERR_NETWORK' || error.code === 'ERR_EMPTY_RESPONSE' || error.message?.includes('Network Error')) {
          try {
            const cachedData = localStorage.getItem(cacheKey);
            if (cachedData) {
              const cachedMetrics = JSON.parse(cachedData);
              if (cachedMetrics && cachedMetrics.allTime && typeof cachedMetrics.allTime === 'object') {
                console.log('[SpiderChart] Using cached power metrics due to network error');
                setPowerMetrics(cachedMetrics);
                setLoading(false);
                return;
              }
            }
          } catch (e) {
            // Ignore cache parse errors
          }
          // If no cached data available, keep existing data
          setLoading(false);
          return;
        }
        
        // Only log non-network errors
        console.error('[SpiderChart] Error loading power metrics:', error);
        
        // If we get here, keep existing data (from previous load or default)
      } finally {
        setLoading(false);
      }
    };
    
    loadPowerMetrics();
  }, [comparePeriod, selectedMonths, currentSelectedSport]);

  // Get available months from powerMetrics.monthlyMetrics
  const availableMonths = useMemo(() => {
    const months = [];
    Object.keys(powerMetrics.monthlyMetrics || {}).forEach(monthKey => {
      const date = new Date(monthKey + '-01');
      if (!isNaN(date.getTime())) {
        months.push({
          key: monthKey,
          label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          date
        });
      }
    });
    return months.sort((a, b) => b.date - a.date);
  }, [powerMetrics.monthlyMetrics]);

  // Monthly metrics
  const monthlyMetrics = useMemo(() => {
    return powerMetrics.monthlyMetrics || {};
  }, [powerMetrics.monthlyMetrics]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!powerMetrics || !powerMetrics.allTime || typeof powerMetrics.allTime !== 'object') {
      return null;
    }
    
    const labels = ['5s', '1min', '5min', '20min', '60min'];
    
    // For monthly view
    if (comparePeriod === 'monthly' && selectedMonths.length > 0) {
      const intervalMaxes = {
        sprint5s: Math.max(...Object.values(monthlyMetrics).map(m => m.sprint5s), powerMetrics.allTime.sprint5s, 1),
        attack1min: Math.max(...Object.values(monthlyMetrics).map(m => m.attack1min), powerMetrics.allTime.attack1min, 1),
        vo2max5min: Math.max(...Object.values(monthlyMetrics).map(m => m.vo2max5min), powerMetrics.allTime.vo2max5min, 1),
        threshold20min: Math.max(...Object.values(monthlyMetrics).map(m => m.threshold20min), powerMetrics.allTime.threshold20min, 1),
        endurance60min: Math.max(...Object.values(monthlyMetrics).map(m => m.endurance60min), powerMetrics.allTime.endurance60min, 1)
      };
      
      const normalize = (value, intervalKey) => {
        const max = intervalMaxes[intervalKey];
        return max > 0 ? (value / max) * 100 : 0;
      };
      
  const monthColors = [
        '#2596be', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
        '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
        '#14b8a6', '#a855f7'
      ];
      
      const datasets = [
        {
          label: 'All Time',
          data: [
            normalize(powerMetrics.allTime.sprint5s, 'sprint5s'),
            normalize(powerMetrics.allTime.attack1min, 'attack1min'),
            normalize(powerMetrics.allTime.vo2max5min, 'vo2max5min'),
            normalize(powerMetrics.allTime.threshold20min, 'threshold20min'),
            normalize(powerMetrics.allTime.endurance60min, 'endurance60min')
          ],
          borderColor: '#2596be',
          backgroundColor: 'rgba(37, 150, 190, 0.2)',
          borderWidth: 2,
          pointBackgroundColor: '#2596be',
          pointRadius: 4,
          fill: true
        },
        ...selectedMonths.map((monthKey, index) => {
          const monthData = monthlyMetrics[monthKey];
          const monthLabel = availableMonths.find(m => m.key === monthKey)?.label || monthKey;
          if (!monthData) return null;
          
          return {
            label: monthLabel,
            data: [
              normalize(monthData.sprint5s, 'sprint5s'),
              normalize(monthData.attack1min, 'attack1min'),
              normalize(monthData.vo2max5min, 'vo2max5min'),
              normalize(monthData.threshold20min, 'threshold20min'),
              normalize(monthData.endurance60min, 'endurance60min')
            ],
            borderColor: monthColors[index % monthColors.length],
            backgroundColor: `${monthColors[index % monthColors.length]}33`,
            borderWidth: 2,
            pointBackgroundColor: monthColors[index % monthColors.length],
            pointRadius: 3,
            fill: true
          };
        }).filter(Boolean)
      ];
      
      return { labels, datasets };
    }
    
    // For other periods
    const intervalMaxes = {
      sprint5s: Math.max(powerMetrics.allTime.sprint5s, powerMetrics.compare.sprint5s, 1),
      attack1min: Math.max(powerMetrics.allTime.attack1min, powerMetrics.compare.attack1min, 1),
      vo2max5min: Math.max(powerMetrics.allTime.vo2max5min, powerMetrics.compare.vo2max5min, 1),
      threshold20min: Math.max(powerMetrics.allTime.threshold20min, powerMetrics.compare.threshold20min, 1),
      endurance60min: Math.max(powerMetrics.allTime.endurance60min, powerMetrics.compare.endurance60min, 1)
    };
    
    const normalize = (value, intervalKey) => {
      const max = intervalMaxes[intervalKey];
      return max > 0 ? (value / max) * 100 : 0;
    };
    
    return {
      labels,
    datasets: [
        {
          label: 'All Time',
          data: [
            normalize(powerMetrics.allTime.sprint5s, 'sprint5s'),
            normalize(powerMetrics.allTime.attack1min, 'attack1min'),
            normalize(powerMetrics.allTime.vo2max5min, 'vo2max5min'),
            normalize(powerMetrics.allTime.threshold20min, 'threshold20min'),
            normalize(powerMetrics.allTime.endurance60min, 'endurance60min')
          ],
          borderColor: '#2596be',
          backgroundColor: 'rgba(37, 150, 190, 0.2)',
      borderWidth: 2,
          pointBackgroundColor: '#2596be',
      pointRadius: 4,
          fill: true
        },
        ...(comparePeriod !== 'alltime' && comparePeriod !== 'monthly' ? [{
          label: comparePeriod === '90days' ? 'Past 90 days' : 'Past 30 days',
          data: [
            normalize(powerMetrics.compare.sprint5s, 'sprint5s'),
            normalize(powerMetrics.compare.attack1min, 'attack1min'),
            normalize(powerMetrics.compare.vo2max5min, 'vo2max5min'),
            normalize(powerMetrics.compare.threshold20min, 'threshold20min'),
            normalize(powerMetrics.compare.endurance60min, 'endurance60min')
          ],
          borderColor: 'rgba(239, 68, 68, 0.8)',
          backgroundColor: 'rgba(239, 68, 68, 0.2)',
          borderWidth: 2,
          pointBackgroundColor: 'rgba(239, 68, 68, 1)',
          pointRadius: 4,
          fill: true
        }] : [])
      ]
    };
  }, [powerMetrics, comparePeriod, monthlyMetrics, selectedMonths, availableMonths]);

  // Chart options
  const chartOptions = useMemo(() => {
    if (!powerMetrics || !powerMetrics.allTime || typeof powerMetrics.allTime !== 'object') {
      return null;
    }
    
    return {
    responsive: true,
    maintainAspectRatio: false,
      animation: {
        duration: 0
      },
      layout: {
        padding: {
          top: -20,
          bottom: -10,
          left: 0,
          right: 0
      }
    },
    scales: {
      r: {
          beginAtZero: true,
          max: 100,
        ticks: {
            stepSize: 20,
            font: { size: 10 },
            callback: function(value) {
              return value + '%';
            },
            backdropPadding: 0
        },
        pointLabels: {
            font: { size: 11, weight: 'bold' },
            padding: 0
          },
          grid: {
            lineWidth: 1
          }
        }
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
            font: { size: 10 },
          usePointStyle: true,
          padding: 2,
            boxWidth: 6
          }
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        titleColor: '#111827',
          titleFont: { weight: 'bold', size: 13 },
        bodyColor: '#111827',
          bodyFont: { size: 12 },
          borderColor: '#E5E7EB',
        borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
        displayColors: true,
        callbacks: {
            title: (context) => {
              if (!context || !context[0]) return '';
              const fullLabels = ['Sprint - 5s', 'Attack - 1min', 'VO2 Max - 5min', 'Threshold - 20min', 'Endurance - 60min'];
              return fullLabels[context[0].dataIndex] || '';
            },
          label: (context) => {
              if (!context || !context.dataset) return '';
              const label = context.dataset.label || '';
              const index = context.dataIndex;
              const metrics = label === 'All Time' ? powerMetrics.allTime : powerMetrics.compare;
              if (!metrics) return '';
              const values = [metrics.sprint5s, metrics.attack1min, metrics.vo2max5min, metrics.threshold20min, metrics.endurance60min];
              const allTimeValue = powerMetrics.allTime[['sprint5s', 'attack1min', 'vo2max5min', 'threshold20min', 'endurance60min'][index]];
              const compareValue = values[index];
              const percentageOfAllTime = allTimeValue > 0 ? Math.round((compareValue / allTimeValue) * 100) : 0;
              
              if (label === 'All Time') {
                return `${label}: ${values[index]}W (100%)`;
              } else {
                return `${label}: ${values[index]}W (${percentageOfAllTime}% of All Time)`;
              }
            }
          }
        }
      }
    };
  }, [powerMetrics]);

  // Table data
  const tableData = [
    {
      label: '5s',
      name: 'Sprint',
      compareValue: powerMetrics.compare.sprint5s,
      allTimeValue: powerMetrics.allTime.sprint5s,
      percentage: powerMetrics.allTime.sprint5s > 0 
        ? Math.round((powerMetrics.compare.sprint5s / powerMetrics.allTime.sprint5s) * 100)
        : 0
    },
    {
      label: '1min',
      name: 'Attack',
      compareValue: powerMetrics.compare.attack1min,
      allTimeValue: powerMetrics.allTime.attack1min,
      percentage: powerMetrics.allTime.attack1min > 0
        ? Math.round((powerMetrics.compare.attack1min / powerMetrics.allTime.attack1min) * 100)
        : 0
    },
    {
      label: '5min',
      name: 'VO2 Max',
      compareValue: powerMetrics.compare.vo2max5min,
      allTimeValue: powerMetrics.allTime.vo2max5min,
      percentage: powerMetrics.allTime.vo2max5min > 0
        ? Math.round((powerMetrics.compare.vo2max5min / powerMetrics.allTime.vo2max5min) * 100)
        : 0
    },
    {
      label: '20min',
      name: 'Threshold',
      compareValue: powerMetrics.compare.threshold20min,
      allTimeValue: powerMetrics.allTime.threshold20min,
      percentage: powerMetrics.allTime.threshold20min > 0
        ? Math.round((powerMetrics.compare.threshold20min / powerMetrics.allTime.threshold20min) * 100)
        : 0
    },
    {
      label: '60min',
      name: 'Endurance',
      compareValue: powerMetrics.compare.endurance60min,
      allTimeValue: powerMetrics.allTime.endurance60min,
      percentage: powerMetrics.allTime.endurance60min > 0
        ? Math.round((powerMetrics.compare.endurance60min / powerMetrics.allTime.endurance60min) * 100)
        : 0
    }
  ];

  // Auto-select all months when switching to monthly view
  useEffect(() => {
    if (comparePeriod === 'monthly' && availableMonths.length > 0 && selectedMonths.length === 0) {
      setSelectedMonths(availableMonths.map(m => m.key));
    }
  }, [comparePeriod, availableMonths, selectedMonths.length]);

  // Format date
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Early returns
  if (currentSelectedSport !== 'bike' && currentSelectedSport !== 'all') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-xl p-6">
        <p className="text-gray-500 text-center">Power Radar is only available for cycling</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-xl p-6">
        <p className="text-gray-500 text-center">Loading power data...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-white/10 backdrop-blur-xl rounded-3xl border border-white/20 shadow-xl p-2">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-1.5 mb-1.5">
        <h2 className="text-lg md:text-xl font-semibold text-gray-900">Power Radar</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">COMPARE TO</span>
          <DropdownMenu
            selectedValue={comparePeriod}
            options={[
              { value: '90days', label: 'Past 90 days' },
              { value: '30days', label: 'Past 30 days' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'alltime', label: 'All Time' }
            ]}
            onChange={(value) => {
              setComparePeriod(value);
              if (value !== 'monthly') {
              setSelectedMonths([]);
              }
            }}
            displayKey="label"
            valueKey="value"
          />
                      </div>
                    </div>

      <div className="flex flex-col gap-1 flex-1 min-h-0">
        {/* Month Selection for Monthly View */}
        {comparePeriod === 'monthly' && (
          <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 shadow-lg p-2 mb-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-gray-900">Select Months</span>
                        <button
                          onClick={() => {
                  if (selectedMonths.length === availableMonths.length) {
                              setSelectedMonths([]);
                            } else {
                    setSelectedMonths(availableMonths.map(m => m.key));
                  }
                }}
                className="text-xs text-gray-600 hover:text-gray-900"
              >
                {selectedMonths.length === availableMonths.length ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
            <div className="flex flex-wrap gap-2">
              {availableMonths.map(month => (
                <label key={month.key} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                    checked={selectedMonths.includes(month.key)}
                            onChange={(e) => {
                              if (e.target.checked) {
                        setSelectedMonths([...selectedMonths, month.key]);
                              } else {
                        setSelectedMonths(selectedMonths.filter(m => m !== month.key));
                      }
                    }}
                    className="w-3 h-3 text-primary focus:ring-primary border-gray-300 rounded"
                  />
                  <span className="text-xs text-gray-700">{month.label}</span>
                          </label>
                      ))}
                    </div>
                  </div>
        )}

        {/* Radar Chart */}
        <div className="w-full relative" style={{ height: '350px' }}>
          {chartData && chartOptions ? (
            <Radar 
              data={chartData} 
              options={chartOptions}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              {comparePeriod === 'monthly' && selectedMonths.length === 0 
                ? 'Select months to display' 
                : 'No data available'}
            </div>
          )}
        </div>


        {/* Power Table - Collapsible */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-lg overflow-hidden">
                      <button
            onClick={() => setIsTableExpanded(!isTableExpanded)}
            className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
          >
            <h3 className="text-sm font-semibold text-gray-900">Power</h3>
            <svg
              className={`w-5 h-5 text-gray-600 transition-transform ${isTableExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
                      </button>
          <div className={`overflow-hidden transition-all duration-300 ${isTableExpanded ? 'max-h-[800px]' : 'max-h-0'}`}>
            <div className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="text-left py-2 px-2 text-gray-600 font-medium"></th>
                      {comparePeriod !== 'alltime' && (
                        <>
                          <th className="text-right py-2 px-2 text-gray-600 font-medium">
                            {comparePeriod === '90days' ? '90 days' : '30 days'}
                          </th>
                          <th className="text-right py-2 px-2 text-gray-600 font-medium">All Time</th>
                          <th className="text-right py-2 px-2 text-gray-600 font-medium">%</th>
                        </>
                      )}
                      {comparePeriod === 'alltime' && (
                        <th className="text-right py-2 px-2 text-gray-600 font-medium">All Time</th>
                      )}
                      <th className="text-left py-2 px-2 text-gray-600 font-medium">Info</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, index) => {
                      const periodText = comparePeriod === '90days' ? 'past 90 days' : comparePeriod === '30days' ? 'past 30 days' : '';
                      const improvement = row.improvement;
                      const pr = row.pr;
                      
                      return (
                        <tr key={index} className="border-b border-white/10">
                          <td className="py-2 px-2 text-gray-700 font-medium">{row.label} ({row.name})</td>
                          {comparePeriod !== 'alltime' && (
                            <>
                              <td className="text-right py-2 px-2 text-gray-900 font-semibold">{row.compareValue} W</td>
                              <td className="text-right py-2 px-2 text-gray-900 font-semibold">{row.allTimeValue} W</td>
                              <td className="text-right py-2 px-2 text-gray-600">{row.percentage}%</td>
                            </>
                          )}
                          {comparePeriod === 'alltime' && (
                            <td className="text-right py-2 px-2 text-gray-900 font-semibold">{row.allTimeValue} W</td>
                          )}
                          <td className="py-2 px-2 text-gray-600">
                            <div className="space-y-1">
                              {pr && pr.date && pr.value > 0 && (
                                <div className="text-xs">
                                  <span className="font-semibold">PR:</span> {pr.value}W ({formatDate(pr.date)})
                                </div>
                              )}
                              {comparePeriod !== 'alltime' && improvement && improvement.improvement !== 0 && (
                                <div className={`text-xs ${improvement.improvement > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  In the {periodText}, your {row.label} power {improvement.improvement > 0 ? 'increased' : 'decreased'} by{' '}
                                  <span className="font-semibold">{Math.abs(improvement.improvement)}W</span>
                                  {improvement.percentage !== 0 && (
                                    <span> ({improvement.percentage > 0 ? '+' : ''}{improvement.percentage}%)</span>
                                  )}
                    </div>
                              )}
                              {comparePeriod !== 'alltime' && improvement && improvement.improvement === 0 && (
                                <div className="text-xs text-gray-500">No change in the {periodText}</div>
                              )}
                        </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                    </div>
                  </div>
                </div>
        </div>
      </div>
    </div>
  );
}
