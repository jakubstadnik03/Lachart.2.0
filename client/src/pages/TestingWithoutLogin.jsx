import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TestingForm from '../components/Testing-page/TestingForm';
import LactateCurve from '../components/Testing-page/LactateCurve';
import LactateCurveCalculator from '../components/Testing-page/LactateCurveCalculator';
import { useNotification } from '../context/NotificationContext';
import Header from '../components/Header/Header';
import Menu from '../components/Menu';
import Footer from '../components/Footer';

const TestingWithoutLogin = () => {
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
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

    // Empty user data for demo mode
    const emptyUser = {
        name: '',
        surname: '',
        email: '',
        role: '',
        sport: '',
        avatar: ''
    };

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
        <div className="min-h-screen bg-gray-100 flex">
            {/* Menu na levé straně */}
            <Menu 
                isMenuOpen={isMenuOpen} 
                setIsMenuOpen={setIsMenuOpen}
                user={emptyUser}
                token=""
            />

            {/* Hlavní obsah včetně header, main content a footer */}
            <div className="flex-1 flex flex-col min-h-screen ml-0">
                {/* Header */}
                <Header 
                    isMenuOpen={isMenuOpen} 
                    setIsMenuOpen={setIsMenuOpen}
                    user={emptyUser}
                />

                {/* Hlavní obsah */}
                <main className="flex-1 px-3 sm:px-3 md:px-4 py-6">
                    <div className="max-w-[1600px] mx-auto">
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-bold text-gray-900">Test Form (Demo Mode)</h1>
                            <p className="mt-2 text-gray-600">
                                Fill out the test form to see the results. Data will not be saved.
                            </p>
                        </div>

                        {/* Info box about the component */}
                        <div className="mb-8 max-w-2xl mx-auto bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-4 text-center shadow">
                          <strong>Lactate Test Demo:</strong> This page allows you to try out the lactate test form and see how the analysis and curve calculation works. You can enter your own test data and view the generated lactate curve and calculations, all without logging in. No data will be saved.
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
                </main>

                {/* Footer */}
                <Footer />
            </div>

            {isMenuOpen && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 md:hidden z-30"
                    onClick={() => setIsMenuOpen(false)}
                />
            )}
        </div>
    );
};

export default TestingWithoutLogin; 