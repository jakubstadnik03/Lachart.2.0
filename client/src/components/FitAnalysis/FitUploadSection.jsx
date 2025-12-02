import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CloudArrowUpIcon, DocumentArrowUpIcon } from '@heroicons/react/24/outline';
import { getStravaAuthUrl, startGarminAuth, syncStravaActivities, syncGarminActivities } from '../../services/api';

const FitUploadSection = ({
  files,
  uploading,
  stravaConnected,
  garminConnected,
  onFileSelect,
  onUpload,
  onSyncComplete
}) => {
  const fileInputRef = useRef(null);
  const [syncingStrava, setSyncingStrava] = useState(false);
  const [syncingGarmin, setSyncingGarmin] = useState(false);

  const handleConnectStrava = async () => {
    try {
      const url = await getStravaAuthUrl();
      window.location.href = url;
    } catch (e) {
      console.error(e);
    }
  };

  const handleConnectGarmin = async () => {
    try {
      const url = await startGarminAuth();
      // Store flag to trigger sync after redirect
      localStorage.setItem('garmin_just_connected', 'true');
      window.location.href = url;
    } catch (e) {
      console.error(e);
      alert('Failed to connect to Garmin: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleSyncStrava = async () => {
    try {
      setSyncingStrava(true);
      const res = await syncStravaActivities();
      await onSyncComplete();
      
      if (res.status === 'partial' || res.partial) {
        // Partial sync due to error or rate limit
        const message = res.retryAfter 
          ? `Strava sync partially completed due to rate limit.\n\n` +
            `Imported: ${res.imported || 0}\n` +
            `Updated: ${res.updated || 0}\n` +
            `Total fetched: ${res.totalFetched || 0}\n\n` +
            `Please wait ${Math.ceil(res.retryAfter / 60)} minutes before syncing again.`
          : `Strava sync completed with some errors.\n\n` +
            `Imported: ${res.imported || 0}\n` +
            `Updated: ${res.updated || 0}\n` +
            `Total fetched: ${res.totalFetched || 0}\n\n` +
            `${res.message || 'Some activities may not have been synced.'}`;
        alert(message);
      } else {
        alert(`Strava sync completed!\n\nImported: ${res.imported || 0}\nUpdated: ${res.updated || 0}\nTotal: ${res.totalFetched || (res.imported + res.updated)}`);
      }
    } catch (e) {
      console.error('Strava sync error:', e);
      
      // Handle timeout errors
      if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
        alert(
          `Strava sync timed out.\n\n` +
          `This can happen if you have many activities. The sync may have partially completed.\n\n` +
          `Please try again in a few minutes, or check your activities in the calendar.`
        );
        await onSyncComplete(); // Still refresh to show what was synced
        return;
      }
      
      // Handle rate limit error specifically
      if (e.response?.status === 429 || e.response?.data?.error === 'Strava rate limit exceeded') {
        const retryAfter = e.response?.data?.retryAfter || 900;
        const minutes = Math.ceil(retryAfter / 60);
        const partialData = e.response?.data;
        alert(
          `Strava API rate limit exceeded.\n\n` +
          `You have reached the Strava API rate limit (600 requests per 15 minutes).\n\n` +
          (partialData?.totalFetched ? `Partially synced: ${partialData.totalFetched} activities\n\n` : '') +
          `Please wait ${minutes} minutes before trying again.\n\n` +
          `If you have many activities, the sync will automatically pause between requests to avoid rate limits.`
        );
        if (partialData?.totalFetched > 0) {
          await onSyncComplete(); // Refresh to show partial results
        }
      } else {
        const errorMsg = e.response?.data?.message || e.message || 'Unknown error';
        alert(`Strava sync failed: ${errorMsg}\n\nPlease check the server logs for more details.`);
      }
    } finally {
      setSyncingStrava(false);
    }
  };

  const handleSyncGarmin = useCallback(async () => {
    try {
      setSyncingGarmin(true);
      const res = await syncGarminActivities();
      await onSyncComplete();
      
      if (res.status === 'partial' || res.partial) {
        const message = res.retryAfter 
          ? `Garmin sync partially completed due to rate limit.\n\n` +
            `Imported: ${res.imported || 0}\n` +
            `Updated: ${res.updated || 0}\n` +
            `Total fetched: ${res.totalFetched || 0}\n\n` +
            `Please wait ${Math.ceil(res.retryAfter / 60)} minutes before syncing again.`
          : `Garmin sync completed with some errors.\n\n` +
            `Imported: ${res.imported || 0}\n` +
            `Updated: ${res.updated || 0}\n` +
            `Total fetched: ${res.totalFetched || 0}\n\n` +
            `${res.message || 'Some activities may not have been synced.'}`;
        alert(message);
      } else {
        alert(`Garmin sync completed!\n\nImported: ${res.imported || 0}\nUpdated: ${res.updated || 0}\nTotal: ${res.totalFetched || (res.imported + res.updated)}`);
      }
    } catch (e) {
      console.error('Garmin sync error:', e);
      
      if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
        alert(
          `Garmin sync timed out.\n\n` +
          `This can happen if you have many activities. The sync may have partially completed.\n\n` +
          `Please try again in a few minutes, or check your activities in the calendar.`
        );
        await onSyncComplete();
        return;
      }
      
      const errorMsg = e.response?.data?.message || e.message || 'Unknown error';
      alert(`Garmin sync failed: ${errorMsg}\n\nPlease check the server logs for more details.`);
    } finally {
      setSyncingGarmin(false);
    }
  }, [onSyncComplete]);

  // Auto-sync Garmin after connection
  useEffect(() => {
    const shouldAutoSync = localStorage.getItem('garmin_just_connected');
    if (shouldAutoSync && garminConnected) {
      localStorage.removeItem('garmin_just_connected');
      // Small delay to ensure connection is fully established
      setTimeout(() => {
        handleSyncGarmin();
      }, 1000);
    }
  }, [garminConnected, handleSyncGarmin]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow-md p-6 mb-6"
    >
      <h2 className="text-xl font-semibold mb-4">Connect & Sync</h2>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleConnectStrava}
          disabled={stravaConnected}
          className={`px-3 py-2 rounded-md text-sm ${
            stravaConnected
              ? 'bg-green-100 text-green-800 cursor-default'
              : 'bg-orange-600 text-white hover:bg-orange-700'
          }`}
        >
          {stravaConnected ? 'Strava Connected' : 'Connect Strava'}
        </button>
        <button
          onClick={handleConnectGarmin}
          disabled={garminConnected}
          className={`px-3 py-2 rounded-md text-sm ${
            garminConnected
              ? 'bg-green-100 text-green-800 cursor-default'
              : 'bg-gray-700 text-white hover:bg-gray-800'
          }`}
        >
          {garminConnected ? 'Garmin Connected' : 'Connect Garmin'}
        </button>
        <button
          onClick={handleSyncStrava}
          disabled={syncingStrava || !stravaConnected}
          className="px-3 py-2 rounded-md bg-orange-100 text-orange-800 hover:bg-orange-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
        >
          {syncingStrava && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {syncingStrava ? 'Syncing...' : 'Sync Strava'}
        </button>
        <button
          onClick={handleSyncGarmin}
          disabled={syncingGarmin || !garminConnected}
          className="px-3 py-2 rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
        >
          {syncingGarmin && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {syncingGarmin ? 'Syncing...' : 'Sync Garmin'}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-sm flex items-center gap-2"
        >
          <CloudArrowUpIcon className="w-4 h-4" />
          Upload FIT File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".fit"
          multiple
          onChange={onFileSelect}
          className="hidden"
        />
        {files.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{files.length} file(s) selected</span>
            <button
              onClick={onUpload}
              disabled={uploading}
              className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <DocumentArrowUpIcon className="w-4 h-4" />
                  Upload
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default FitUploadSection;

