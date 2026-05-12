import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import TestingForm from './TestingForm';
import LactateCurve from './LactateCurve';

const NewTestingComponent = ({ selectedSport, onSubmit }) => {
    const [testData, setTestData] = useState({
      title: '',
      description: '',
      weight: '',
      sport: selectedSport === 'all' ? '' : selectedSport,
      baseLactate: '',
      date: new Date().toISOString().split('T')[0],
      specifics: {
        specific: '',
        weather: ''
      },
      comments: '',
      results: []
    });

    // Whether the live curve has anything useful to draw. On mobile we keep
    // the preview collapsed until the user has entered at least one real
    // power+lactate row so the form isn't pushed off-screen by an empty
    // 400px-tall chart placeholder.
    const hasPlottableData = useMemo(() => {
      const rows = Array.isArray(testData.results) ? testData.results : [];
      return rows.some(r => {
        const p = Number(String(r?.power ?? '').replace(',', '.'));
        const l = Number(String(r?.lactate ?? '').replace(',', '.'));
        return Number.isFinite(p) && p > 0 && Number.isFinite(l) && l > 0;
      });
    }, [testData.results]);

    // Mobile preview is collapsed by default; user can expand on demand.
    const [previewOpen, setPreviewOpen] = useState(false);

    const handleTestDataChange = (updatedData) => {
      // Simply update the state without processing
      setTestData(updatedData);
    };

    const handleSaveFromForm = (formData) => {
      // Return the promise so TestingForm can await API success/failure
      console.log('Saving from form:', formData);
      return onSubmit(formData);
    };

    return (
      <div
        data-tour="tour-create-test-form"
        className="flex flex-col lg:flex-row gap-3 lg:gap-6 mt-3 lg:mt-5 w-full min-w-0"
      >
        {/* ── Live preview ── */}
        {/* Desktop: always visible side-by-side with the form.
            Mobile:  collapsible card — auto-expands once the user has typed
                     usable data so they get instant feedback, but starts
                     collapsed so the form gets full viewport on first open. */}
        <div data-tour="tour-live-curve-preview" className="w-full lg:w-1/2 min-w-0">
          {/* Desktop preview */}
          <div className="hidden lg:block">
            <LactateCurve mockData={testData} />
          </div>
          {/* Mobile preview — collapsible */}
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setPreviewOpen(o => !o)}
              className="w-full flex items-center justify-between rounded-xl bg-white border border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm active:bg-gray-50"
            >
              <span>
                Live curve preview {hasPlottableData ? `· ${testData.results.filter(r => Number(r?.lactate) > 0).length} pts` : '— empty'}
              </span>
              {previewOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {previewOpen && (
              <div className="mt-2">
                <LactateCurve mockData={testData} />
              </div>
            )}
          </div>
        </div>

        {/* ── Form ── */}
        <div className="w-full lg:w-1/2 min-w-0">
          <div className="bg-white rounded-2xl shadow-sm sm:shadow-lg p-3 sm:p-4 lg:p-6 w-full min-w-0">
            <TestingForm
              testData={testData}
              onTestDataChange={handleTestDataChange}
              onSave={handleSaveFromForm}
            />
          </div>
        </div>
      </div>
    );
  };

export default NewTestingComponent;
