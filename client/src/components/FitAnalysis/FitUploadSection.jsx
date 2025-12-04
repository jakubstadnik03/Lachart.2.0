import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { CloudArrowUpIcon, DocumentArrowUpIcon } from '@heroicons/react/24/outline';

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow-md p-6 mb-6"
    >
      <h2 className="text-xl font-semibold mb-4">Upload FIT file</h2>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-2 rounded-md bg-primary text-white hover:bg-primary-dark text-sm flex items-center gap-2"
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
              className="px-3 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:bg-gray-400 disabled:cursor-not-allowed text-sm flex items-center gap-2"
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

