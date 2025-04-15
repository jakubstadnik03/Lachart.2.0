import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTrainings } from '../context/TrainingContext';
import TrainingItem from '../components/Training-log/TrainingItem';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const TrainingDetailPage = () => {
  const { title } = useParams();
  const navigate = useNavigate();
  const { trainings } = useTrainings();
  const [filteredTrainings, setFilteredTrainings] = useState([]);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState('power');
  const [isLoading, setIsLoading] = useState(true);

  // Find trainings with the same title
  useEffect(() => {
    console.log('Trainings from context:', trainings);
    console.log('Title from URL:', title);
    
    if (!trainings || trainings.length === 0) {
      console.log('No trainings available');
      setIsLoading(false);
      return;
    }

    // Decode the title from URL and find matching trainings
    const decodedTitle = decodeURIComponent(title.replace(/-/g, ' '));
    console.log('Decoded title:', decodedTitle);
    
    const matchingTrainings = trainings
      .filter(t => {
        console.log('Comparing:', t.title, 'with', decodedTitle);
        return t.title === decodedTitle;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date, newest first
    
    console.log('Matching trainings:', matchingTrainings);
    
    setFilteredTrainings(matchingTrainings);
    
    if (matchingTrainings.length > 0) {
      setSelectedTraining(matchingTrainings[0]); // Select the newest training by default

      // Prepare data for the history chart
      const chartData = matchingTrainings.map(t => {
        const avgPower = t.results.reduce((sum, r) => sum + (Number(r.power) || 0), 0) / t.results.length;
        const avgHeartRate = t.results.reduce((sum, r) => sum + (Number(r.heartRate) || 0), 0) / t.results.length;
        const avgLactate = t.results.reduce((sum, r) => sum + (Number(r.lactate) || 0), 0) / t.results.length;
        
        return {
          date: new Date(t.date).toLocaleDateString(),
          power: avgPower,
          heartRate: avgHeartRate,
          lactate: avgLactate,
          id: t._id
        };
      });

      setHistoryData(chartData);
    }
    
    setIsLoading(false);
  }, [title, trainings]);

  const handleTrainingSelect = (id) => {
    const training = filteredTrainings.find(t => t._id === id);
    setSelectedTraining(training);
  };

  const handleMetricChange = (e) => {
    setSelectedMetric(e.target.value);
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (filteredTrainings.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">No Trainings Found</h1>
          <p className="text-gray-600 mb-4">
            No trainings found with the title "{decodeURIComponent(title.replace(/-/g, ' '))}"
          </p>
          <button
            onClick={() => navigate('/training')}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md"
          >
            Back to Training List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{selectedTraining.title}</h1>
        <p className="text-gray-600">
          {new Date(selectedTraining.date).toLocaleDateString()} - {selectedTraining.sport}
        </p>
      </div>

      {/* Metric selector for the chart */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Metric:
        </label>
        <select 
          className="w-full p-2 border border-gray-300 rounded-md"
          value={selectedMetric}
          onChange={handleMetricChange}
        >
          <option value="power">Power</option>
          <option value="heartRate">Heart Rate</option>
          <option value="lactate">Lactate</option>
        </select>
      </div>

      {/* History chart */}
      <div className="mb-8 bg-white p-4 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Training History</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={historyData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey={selectedMetric} 
                stroke="#8884d8" 
                activeDot={{ r: 8 }} 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Training selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Training:
        </label>
        <select 
          className="w-full p-2 border border-gray-300 rounded-md"
          value={selectedTraining._id}
          onChange={(e) => handleTrainingSelect(e.target.value)}
        >
          {filteredTrainings.map(training => (
            <option key={training._id} value={training._id}>
              {new Date(training.date).toLocaleDateString()}
            </option>
          ))}
        </select>
      </div>

      {/* Selected training details */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Training Details</h2>
        <TrainingItem 
          training={selectedTraining} 
          isExpanded={true} 
          onToggleExpand={() => {}} 
        />
      </div>

      {/* Other trainings with same title */}
      {filteredTrainings.length > 1 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Other Trainings</h2>
          <div className="space-y-4">
            {filteredTrainings
              .filter(t => t._id !== selectedTraining._id)
              .map(training => (
                <TrainingItem 
                  key={training._id} 
                  training={training} 
                  isExpanded={false} 
                  onToggleExpand={() => {}} 
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrainingDetailPage; 