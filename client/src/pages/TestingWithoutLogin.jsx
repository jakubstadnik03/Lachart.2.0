import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TestingForm from '../components/Testing-page/TestingForm';
import LactateCurve from '../components/Testing-page/LactateCurve';
import LactateCurveCalculator from '../components/Testing-page/LactateCurveCalculator';
import { useNotification } from '../context/NotificationContext';

const TestingWithoutLogin = () => {
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [testData, setTestData] = useState({
        title: '',
        description: '',
        weight: '',
        sport: 'bike',
        baseLa: '',
        date: new Date().toISOString().split('T')[0],
        specifics: { specific: '', weather: '' },
        comments: '',
        results: [{
            interval: 1,
            power: 0,
            heartRate: 0,
            lactate: 0,
            glucose: 0,
            RPE: 0
        }]
    });

    const handleTestDataChange = (newData) => {
        console.log('Received new data:', newData); // Debug log

        // If newData is a value change object
        if (newData.field && newData.value !== undefined) {
            setTestData(prevData => ({
                ...prevData,
                [newData.field]: newData.value
            }));
            return;
        }

        // If newData is a complete data object
        const updatedData = {
            ...newData,
            weight: newData.weight || '',
            baseLa: newData.baseLa || '',
            results: (newData.results || []).map(result => ({
                ...result,
                power: Number(result.power) || 0,
                heartRate: Number(result.heartRate) || 0,
                lactate: Number(result.lactate) || 0,
                glucose: Number(result.glucose) || 0,
                RPE: Number(result.RPE) || 0
            }))
        };
        console.log('Updated test data:', updatedData); // Debug log
        setTestData(updatedData);
    };

    const handleSave = (data) => {
        // Convert string values to numbers for saving
        const processedData = {
            ...data,
            weight: Number(data.weight) || 0,
            baseLa: Number(data.baseLa) || 0
        };
        addNotification('Test data was processed successfully', 'success');
        console.log('Processed test data:', processedData);
    };

    const handleGlucoseColumnChange = (hidden) => {
        console.log('Glucose column visibility changed:', hidden);
    };

    // Check if we have valid data to display
    const hasValidData = testData.results.some(result => 
        result.power > 0 && result.lactate > 0
    );

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Test Form (Demo Mode)</h1>
                    <p className="mt-2 text-gray-600">
                        Fill out the test form to see the results. Data will not be saved.
                    </p>
                </div>

                <div className="space-y-8">
                    <TestingForm
                        testData={testData}
                        onTestDataChange={handleTestDataChange}
                        onSave={handleSave}
                        onGlucoseColumnChange={handleGlucoseColumnChange}
                        demoMode={true}
                    />

                    {hasValidData && (
                        <div className="space-y-8">
                            <div className="bg-white rounded-lg shadow p-6">
                                <LactateCurve mockData={testData} />
                            </div>
                            <div className="bg-white rounded-lg shadow p-6">
                                <LactateCurveCalculator mockData={testData} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-8 text-center">
                    <button
                        onClick={() => navigate('/login')}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                    >
                        Back to Login
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TestingWithoutLogin; 