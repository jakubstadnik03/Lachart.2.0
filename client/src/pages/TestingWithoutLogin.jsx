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
        setTestData(updatedData);
    };

    const handleSave = (data) => {
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
        <div className="min-h-screen bg-gray-50 flex">
            {/* Left Menu */}
            <Menu 
                isMenuOpen={isMenuOpen} 
                setIsMenuOpen={setIsMenuOpen}
                user={emptyUser}
                token=""
            />

            {/* Main Content Container */}
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Header */}
                <Header 
                    isMenuOpen={isMenuOpen} 
                    setIsMenuOpen={setIsMenuOpen}
                    user={emptyUser}
                />

                {/* Main Content */}
                <main className="flex-1 px-4 py-8 overflow-x-hidden">
                    <div className="max-w-[1600px] mx-auto space-y-8">
                        {/* Page Header */}
                        <div className="text-center max-w-3xl mx-auto">
                            <h1 className="text-4xl font-bold text-gray-900 mb-4">
                                Lactate Test Demo
                            </h1>
                            <p className="text-lg text-gray-600 mb-6">
                                Experience LaChart's powerful lactate testing capabilities. Enter your test data to see real-time analysis and curve generation.
                            </p>
                        </div>

                        {/* Info Cards */}
                        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
                            {/* Demo Info Card */}
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm">
                                <h3 className="text-lg font-semibold text-blue-900 mb-2">
                                    🧪 Try Without Login
                                </h3>
                                <p className="text-blue-800">
                                    This is a demo version where you can test the lactate analysis features. No account required, but data won't be saved.
                                </p>
                            </div>

                            {/* Instructions Card */}
                            <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 shadow-sm">
                                <h3 className="text-lg font-semibold text-purple-900 mb-2">
                                    📝 How to Use
                                </h3>
                                <p className="text-purple-800">
                                    Fill in the test form below with your lactate test data. The curve and calculations will update automatically.
                                </p>
                            </div>
                        </div>

                        {/* Main Content Area */}
                        <div className="space-y-8 mt-8">
                            {/* Testing Form Section */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="p-4 sm:p-6">
                                    <h2 className="text-2xl font-semibold text-gray-900 mb-6">Test Data Entry</h2>
                                    <div className="w-full overflow-x-auto">
                                        <div className="min-w-[800px] lg:min-w-full">
                                            <TestingForm
                                                testData={testData}
                                                onTestDataChange={handleTestDataChange}
                                                onSave={handleSave}
                                                onGlucoseColumnChange={handleGlucoseColumnChange}
                                                demoMode={true}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Results Section */}
                            {hasValidData && (
                                <div className="space-y-8">
                                    {/* Lactate Curve Section */}
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Lactate Curve Analysis</h2>
                                        <div className="w-full overflow-x-auto">
                                            <div className="min-w-[800px] lg:min-w-full">
                                                <LactateCurve mockData={testData} demoMode={true} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Calculator Section */}
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                                        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Training Zones Calculator</h2>
                                        <div className="w-full overflow-x-auto">
                                            <div className="min-w-[800px] lg:min-w-full">
                                                <LactateCurveCalculator mockData={testData} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-center gap-4 pt-8">
                            <button
                                onClick={() => navigate('/signup')}
                                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-primary hover:bg-primary-dark transition-colors shadow-sm hover:shadow-md"
                            >
                                Create Account
                            </button>
                            <button
                                onClick={() => navigate('/login')}
                                className="inline-flex items-center px-6 py-3 border border-primary text-base font-medium rounded-lg text-primary hover:bg-primary hover:text-white transition-colors shadow-sm hover:shadow-md"
                            >
                                Sign In
                            </button>
                        </div>
                    </div>
                </main>

                {/* Footer */}
                <Footer />
            </div>

            {/* Mobile Menu Overlay */}
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