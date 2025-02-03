import React, { useState } from 'react';

function TestingForm() {
  const [rows, setRows] = useState([
    { interval: 1, power: 60, heartRate: 110, lactate: 1, glucose: 1, rpe: 3 },
    { interval: 2, power: 120, heartRate: 110, lactate: 1, glucose: 1, rpe: 5 },
    { interval: 3, power: 180, heartRate: 110, lactate: 1, glucose: 1, rpe: 8 },
    { interval: 4, power: 200, heartRate: 110, lactate: 1, glucose: 1, rpe: 12 },
    { interval: 5, power: 220, heartRate: 110, lactate: 1, glucose: 1, rpe: 13 },
    { interval: 6, power: 240, heartRate: 110, lactate: 1, glucose: 1, rpe: 16 }
  ]);

  const [formData, setFormData] = useState({
    description: '',
    weight: '',
    sport: '',
    baseLa: ''
  });

  const handleValueChange = (rowIndex, field, value) => {
    const updatedRows = rows.map((row, index) => {
      if (index === rowIndex) {
        return { ...row, [field]: value };
      }
      return row;
    });
    setRows(updatedRows);
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = () => {
    const testingData = {
      rows,
      ...formData
    };
    console.log('Saving testing data:', testingData);
  };

  const sports = ['Run', 'Bike', 'Swim'];

  const renderHeader = () => (
    <div className="flex gap-4 items-center whitespace-nowrap bg-white rounded-lg">
      <div className="self-stretch my-auto text-center w-[19px]">Int.</div>
      <div className="self-stretch my-auto w-[55px]">Power</div>
      <div className="self-stretch my-auto w-[54px]">HeartRate</div>
      <div className="self-stretch my-auto w-[54px]">Lactate</div>
      <div className="self-stretch my-auto w-14">Glucoze</div>
      <div className="self-stretch my-auto w-[60px]">RPE</div>
    </div>
  );

  const renderRow = (row, rowIndex) => (
    <div key={row.interval} className="flex gap-2 items-center mt-3 bg-white rounded-lg">
      <div className="flex flex-col self-stretch my-auto font-semibold text-center whitespace-nowrap rounded-lg w-[26px]">
        <div className="px-1 bg-white rounded-lg h-[26px] w-[26px]">{row.interval}</div>
      </div>
      <div className="flex flex-col self-stretch my-auto w-16 rounded-lg">
        <input
          type="number"
          value={row.power}
          onChange={(e) => handleValueChange(rowIndex, 'power', e.target.value)}
          className="px-1.5 py-1 bg-white rounded-lg max-md:pr-5 w-full"
          aria-label={`Power for interval ${row.interval}`}
        />
      </div>
      <div className="flex flex-col self-stretch my-auto w-16 rounded-lg">
        <input
          type="number"
          value={row.heartRate}
          onChange={(e) => handleValueChange(rowIndex, 'heartRate', e.target.value)}
          className="px-1.5 py-1 bg-white rounded-lg w-full"
          aria-label={`Heart rate for interval ${row.interval}`}
        />
      </div>
      <div className="flex flex-col self-stretch my-auto w-16 rounded-lg">
        <input
          type="number"
          value={row.lactate}
          onChange={(e) => handleValueChange(rowIndex, 'lactate', e.target.value)}
          className="px-1.5 py-1 bg-white rounded-lg w-full"
          aria-label={`Lactate for interval ${row.interval}`}
        />
      </div>
      <div className="flex flex-col self-stretch my-auto w-16 rounded-lg">
        <input
          type="number"
          value={row.glucose}
          onChange={(e) => handleValueChange(rowIndex, 'glucose', e.target.value)}
          className="px-1.5 py-1 bg-white rounded-lg w-full"
          aria-label={`Glucose for interval ${row.interval}`}
        />
      </div>
      <div className="flex flex-col self-stretch my-auto whitespace-nowrap rounded-lg w-[26px]">
        <input
          type="number"
          value={row.rpe}
          onChange={(e) => handleValueChange(rowIndex, 'rpe', e.target.value)}
          className="px-1 bg-white rounded-lg h-[26px] w-[26px]"
          aria-label={`RPE for interval ${row.interval}`}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col w-full bg-white rounded-lg" role="table">
      {renderHeader()}
      {rows.map((row, index) => renderRow(row, index))}
      
      <div className="flex gap-2 items-start self-start mt-3 bg-white rounded-lg">
        <div className="flex flex-col rounded-lg min-w-[240px] w-[327px]">
          <textarea
            value={formData.description}
            onChange={(e) => handleFormChange('description', e.target.value)}
            className="px-2.5 pt-2 pb-12 bg-white rounded-lg max-md:pr-5"
            placeholder="Description of this testing....."
            aria-label="Testing description"
          />
        </div>
      </div>

      <div className="flex gap-2 items-start self-start mt-3 bg-white rounded-lg">
        <div className="flex flex-col whitespace-nowrap rounded-lg w-[74px]">
          <input
            type="text"
            value={formData.weight}
            onChange={(e) => handleFormChange('weight', e.target.value)}
            className="px-2 py-1 bg-white rounded-lg max-md:pr-5"
            placeholder="Weight"
            aria-label="Weight"
          />
        </div>
        <div className="flex flex-col whitespace-nowrap rounded-none w-[74px]">
          <select
            value={formData.sport}
            onChange={(e) => handleFormChange('sport', e.target.value)}
            className="px-2 py-1 bg-white rounded-lg"
            aria-label="Sport"
          >
            <option value="">Select</option>
            {sports.map(sport => (
              <option key={sport} value={sport}>{sport}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col rounded-lg w-[74px]">
          <input
            type="text"
            value={formData.baseLa}
            onChange={(e) => handleFormChange('baseLa', e.target.value)}
            className="px-2 py-1 bg-white rounded-lg max-md:pr-5"
            placeholder="Base La"
            aria-label="Base La"
          />
        </div>
        <button
          onClick={handleSave}
          className="flex flex-col font-semibold rounded-lg w-[116px]"
          aria-label="Save testing data"
        >
          <div className="z-10 px-3 py-2 bg-white rounded-lg border border-emerald-400 border-solid max-md:px-5">
            Save testing
          </div>
        </button>
      </div>
    </div>
  );
}

export default TestingForm;