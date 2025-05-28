import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import TestingForm from '../components/Testing-page/TestingForm';
import LactateCurve from '../components/Testing-page/LactateCurve';
import LactateCurveCalculator from '../components/Testing-page/LactateCurveCalculator';
import { useNotification } from '../context/NotificationContext';
import Header from '../components/Header/Header';
import Menu from '../components/Menu';
import Footer from '../components/Footer';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.5,
      ease: "easeOut"
    }
  }
};

const fadeInUpVariants = {
  hidden: { y: 60, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      duration: 0.6,
      ease: "easeOut"
    }
  }
};

const TestingWithoutLogin = () => {
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const [testData, setTestData] = useState(() => {
        // Try to load data from localStorage on initial render
        const savedData = localStorage.getItem('testData');
        if (savedData) {
            try {
                return JSON.parse(savedData);
            } catch (e) {
                console.error('Error parsing saved test data:', e);
            }
        }
        // Default state if no saved data
        return {
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
        };
    });
    const [isDemoDropdownOpen, setIsDemoDropdownOpen] = useState(false);
    const isInitialMount = useRef(true);

    // Create refs for scroll animations
    const formRef = useRef(null);
    const curveRef = useRef(null);
    const calculatorRef = useRef(null);
    const buttonsRef = useRef(null);

    // Use useInView hook for each section
    const isFormInView = useInView(formRef, { once: true, margin: "-100px" });
    const isCurveInView = useInView(curveRef, { once: true, margin: "-100px" });
    const isCalculatorInView = useInView(calculatorRef, { once: true, margin: "-100px" });
    const isButtonsInView = useInView(buttonsRef, { once: true, margin: "-100px" });

    // Save to localStorage whenever testData changes
    useEffect(() => {
        localStorage.setItem('testData', JSON.stringify(testData));
    }, [testData]);

    // Initialize menu state based on screen size
    useEffect(() => {
        if (isInitialMount.current) {
            const handleResize = () => {
                if (window.innerWidth >= 768) {
                    setIsMenuOpen(true);
                }
            };

            // Initial check
            handleResize();

            // Add event listener
            window.addEventListener('resize', handleResize);

            // Cleanup
            return () => {
                window.removeEventListener('resize', handleResize);
                isInitialMount.current = false;
            };
        }
    }, []); // Empty dependency array - only run once

    // Mock data for demo
    const mockData = {
        bike: {
            title: 'Lactate Test - Bike (Demo)',
            description: 'Demo test with mock data',
            weight: '75',
            sport: 'bike',
            baseLactate: '1.2',
            baseLa: '1.2',
            date: new Date().toISOString().split('T')[0],
            specifics: { specific: 'Indoor', weather: '20°C' },
            comments: 'Demo test data',
            results: [
                { interval: 1, power: '150', heartRate: '120', lactate: '1.5', glucose: '5.2', RPE: '3' },
                { interval: 2, power: '200', heartRate: '145', lactate: '2.1', glucose: '5.4', RPE: '5' },
                { interval: 3, power: '250', heartRate: '165', lactate: '3.2', glucose: '5.6', RPE: '7' },
                { interval: 4, power: '300', heartRate: '180', lactate: '4.5', glucose: '5.8', RPE: '8' },
                { interval: 5, power: '350', heartRate: '190', lactate: '6.8', glucose: '6.0', RPE: '9' }
            ]
        },
        run: {
            title: 'Lactate Test - Run (Demo)',
            description: 'Demo test with mock data',
            weight: '70',
            sport: 'run',
            baseLactate: '1.1',
            baseLa: '1.1',
            date: new Date().toISOString().split('T')[0],
            specifics: { specific: 'Outdoor', weather: '18°C' },
            comments: 'Demo test data',
            results: [
                { interval: 1, power: '5:30', heartRate: '125', lactate: '1.4', glucose: '5.1', RPE: '3' },
                { interval: 2, power: '5:00', heartRate: '150', lactate: '2.0', glucose: '5.3', RPE: '5' },
                { interval: 3, power: '4:30', heartRate: '170', lactate: '3.0', glucose: '5.5', RPE: '7' },
                { interval: 4, power: '4:00', heartRate: '185', lactate: '4.2', glucose: '5.7', RPE: '8' },
                { interval: 5, power: '3:30', heartRate: '195', lactate: '6.5', glucose: '5.9', RPE: '9' }
            ]
        },
        swim: {
            title: 'Lactate Test - Swim (Demo)',
            description: 'Demo test with mock data',
            weight: '72',
            sport: 'swim',
            baseLactate: '1.0',
            baseLa: '1.0',
            date: new Date().toISOString().split('T')[0],
            specifics: { specific: 'Pool', weather: '26°C' },
            comments: 'Demo test data',
            results: [
                { interval: 1, power: '1:45', heartRate: '115', lactate: '1.3', glucose: '5.0', RPE: '3' },
                { interval: 2, power: '1:35', heartRate: '140', lactate: '1.9', glucose: '5.2', RPE: '5' },
                { interval: 3, power: '1:25', heartRate: '160', lactate: '2.8', glucose: '5.4', RPE: '7' },
                { interval: 4, power: '1:15', heartRate: '175', lactate: '4.0', glucose: '5.6', RPE: '8' },
                { interval: 5, power: '1:05', heartRate: '185', lactate: '6.2', glucose: '5.8', RPE: '9' }
            ]
        }
    };

    // Function to handle demo data dropdown toggle
    const toggleDemoDropdown = (e) => {
        e.stopPropagation();
        setIsDemoDropdownOpen(!isDemoDropdownOpen);
    };

    // Function to handle demo data selection
    const handleDemoDataSelect = (sport) => {
        handleFillMockData(sport);
        setIsDemoDropdownOpen(false);
    };

    // Function to fill form with mock data
    const handleFillMockData = (sport) => {
        const mockDataForSport = {
            ...mockData[sport],
            results: mockData[sport].results.map(result => ({
                ...result,
                power: result.power,
                heartRate: result.heartRate,
                lactate: result.lactate,
                glucose: result.glucose,
                RPE: result.RPE
            }))
        };
        setTestData(mockDataForSport);
        addNotification(`Form filled with ${sport} demo data`, 'success');
    };

    // Function to reset form
    const handleResetForm = () => {
        const defaultData = {
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
        };
        setTestData(defaultData);
        localStorage.removeItem('testData');
        addNotification('Form has been reset', 'success');
    };

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
            setTestData(prevData => {
                const updatedData = {
                    ...prevData,
                    [newData.field]: newData.value
                };
                // If baseLa is updated, also update baseLactate
                if (newData.field === 'baseLa') {
                    updatedData.baseLactate = parseFloat(String(newData.value).replace(',', '.'));
                }
                return updatedData;
            });
            return;
        }

        // If newData is a complete data object
        const updatedData = {
            ...newData,
            weight: newData.weight || '',
            baseLa: newData.baseLa || '',
            baseLactate: newData.baseLa ? parseFloat(String(newData.baseLa).replace(',', '.')) : 
                         (newData.baseLactate ? parseFloat(String(newData.baseLactate).replace(',', '.')) : 0),
            results: (newData.results || []).map(result => ({
                ...result,
                power: result.power || '',
                heartRate: result.heartRate || '',
                lactate: result.lactate || '',
                glucose: result.glucose || '',
                RPE: result.RPE || ''
            }))
        };
        setTestData(updatedData);
    };

    const handleSave = (data) => {
        // Convert values to numbers only at save time
        const processedData = {
            ...data,
            weight: data.weight === '' ? 0 : parseFloat(data.weight.toString().replace(',', '.')),
            baseLa: data.baseLa === '' ? 0 : parseFloat(data.baseLa.toString().replace(',', '.')),
            results: data.results.map(result => ({
                ...result,
                power: result.power === '' ? 0 : parseFloat(result.power.toString().replace(',', '.')),
                heartRate: result.heartRate === '' ? 0 : parseFloat(result.heartRate.toString().replace(',', '.')),
                lactate: result.lactate === '' ? 0 : parseFloat(result.lactate.toString().replace(',', '.')),
                glucose: result.glucose === '' ? 0 : parseFloat(result.glucose.toString().replace(',', '.')),
                RPE: result.RPE === '' ? 0 : parseFloat(result.RPE.toString().replace(',', '.'))
            }))
        };
        addNotification('Test data was processed successfully', 'success');
        console.log('Processed test data:', processedData);
    };

    const handleGlucoseColumnChange = (hidden) => {
    };

    // Check if we have valid data to display
    const hasValidData = testData.results.some(result => {
        if (!result) return false;
        
        let power = result.power?.toString();
        const lactate = result.lactate?.toString().replace(',', '.');
        
        // Convert pace to seconds for validation
        if (testData.sport === 'run' || testData.sport === 'swim') {
            if (!power?.includes(':')) return false;
            const [minutes, seconds] = power.split(':').map(Number);
            if (isNaN(minutes) || isNaN(seconds)) return false;
            power = (minutes * 60 + seconds).toString();
        }
        
        return power && 
               lactate && 
               !isNaN(Number(power)) && 
               !isNaN(Number(lactate)) && 
               Number(power) > 0 && 
               Number(lactate) > 0;
    });

    // Prepare data for LactateCurveCalculator
    const prepareCalculatorData = () => {
        if (!testData || !testData.results) {
            return {
                sport: 'bike',
                baseLactate: 0,
                results: []
            };
        }

        // Ensure baseLactate is properly processed
        const baseLactate = testData.baseLa ? 
            parseFloat(String(testData.baseLa).replace(',', '.')) : 
            (testData.baseLactate ? parseFloat(String(testData.baseLactate).replace(',', '.')) : 0);

        const processedData = {
            ...testData,
            baseLactate: baseLactate,
            baseLa: baseLactate, // Ensure both fields are set
            results: testData.results.map(result => {
                if (!result) return null;

                let power = result.power;
                
                // Convert pace to seconds for calculation
                if (testData.sport === 'run' || testData.sport === 'swim') {
                    if (power && typeof power === 'string' && power.includes(':')) {
                        const [minutes, seconds] = power.split(':').map(Number);
                        if (!isNaN(minutes) && !isNaN(seconds)) {
                            power = (minutes * 60 + seconds).toString();
                        }
                    }
                }

                return {
                    ...result,
                    power: power ? parseFloat(String(power).replace(',', '.')) : 0,
                    heartRate: result.heartRate ? parseFloat(String(result.heartRate).replace(',', '.')) : 0,
                    lactate: result.lactate ? parseFloat(String(result.lactate).replace(',', '.')) : 0,
                    glucose: result.glucose ? parseFloat(String(result.glucose).replace(',', '.')) : 0,
                    RPE: result.RPE ? parseFloat(String(result.RPE).replace(',', '.')) : 0
                };
            }).filter(result => result !== null)
        };

        console.log('Processed data for calculator:', processedData);
        return processedData;
    };

    // Add useEffect to force graph updates when data changes
    useEffect(() => {
        if (hasValidData) {
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 100);
        }
    }, [testData, hasValidData]);

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Left Menu - hidden on mobile, visible on desktop */}
            <div className="menu-container hidden md:block" ref={menuRef}>
            <Menu 
                    isMenuOpen={true} 
                    setIsMenuOpen={() => {}}
                user={emptyUser}
                token=""
            />
            </div>

            {/* Main Content Container */}
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Header */}
                <Header 
                    isMenuOpen={false} 
                    setIsMenuOpen={() => {}}
                    user={emptyUser}
                />

                {/* Main Content */}
                <motion.main 
                    className="flex-1 px-4 py-8 overflow-x-hidden"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                >
                    <div className="max-w-[1600px] mx-auto space-y-8">
                        {/* Page Header */}
                        <motion.div 
                            className="text-center max-w-3xl mx-auto px-4"
                            variants={itemVariants}
                        >
                            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                                Lactate Test Demo
                            </h1>
                            <p className="text-base md:text-lg text-gray-600 mb-6">
                                Experience LaChart's powerful lactate testing capabilities. Enter your test data to see real-time analysis and curve generation.
                            </p>
                        </motion.div>

                        {/* Info Cards */}
                        <motion.div 
                            className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto px-4"
                            variants={itemVariants}
                        >
                            {/* Demo Info Card */}
                            <motion.div 
                                className="bg-blue-50 border border-blue-200 rounded-xl sm:p-3 lg:p-6 shadow-sm"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <h3 className="text-lg font-semibold text-blue-900 mb-2">
                                    🧪 Try Without Login
                                </h3>
                                <p className="text-blue-800">
                                    This is a demo version where you can test the lactate analysis features. No account required, but data won't be saved.
                                </p>
                            </motion.div>

                            {/* Instructions Card */}
                            <motion.div 
                                className="bg-purple-50 border border-purple-200 rounded-xl sm:p-3 lg:p-6 shadow-sm"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <h3 className="text-lg font-semibold text-purple-900 mb-2">
                                    📝 How to Use
                                </h3>
                                <p className="text-purple-800">
                                    Fill in the test form below with your lactate test data. The curve and calculations will update automatically.
                                </p>
                            </motion.div>
                        </motion.div>

                        {/* Main Content Area */}
                        <div className="space-y-8 mt-8 px-4">
                            {/* Testing Form Section */}
                            <motion.div 
                                ref={formRef}
                                initial="hidden"
                                animate={isFormInView ? "visible" : "hidden"}
                                variants={fadeInUpVariants}
                                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
                                whileHover={{ boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" }}
                            >
                                <div className="p-4 sm:p-6">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                                        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Test Data Entry</h2>
                                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                            <motion.div 
                                                className="relative w-full sm:w-auto"
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                            >
                                                <button
                                                    onClick={toggleDemoDropdown}
                                                    className="w-full px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors flex items-center justify-between"
                                                >
                                                    Fill with Demo Data
                                                    <svg 
                                                        className={`w-4 h-4 ml-2 transition-transform ${isDemoDropdownOpen ? 'rotate-180' : ''}`} 
                                                        fill="none" 
                                                        stroke="currentColor" 
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </button>
                                                <AnimatePresence>
                                                    {isDemoDropdownOpen && (
                                                        <motion.div 
                                                            className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 z-[9999]"
                                                            initial={{ opacity: 0, y: -10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -10 }}
                                                            transition={{ duration: 0.2 }}
                                                            style={{ transform: 'translateZ(0)' }}
                                                        >
                                                            <div className="py-1">
                                                                <motion.button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDemoDataSelect('bike');
                                                                    }}
                                                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                                                    whileHover={{ x: 5 }}
                                                                >
                                                                    Bike Demo Data
                                                                </motion.button>
                                                                <motion.button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDemoDataSelect('run');
                                                                    }}
                                                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                                                    whileHover={{ x: 5 }}
                                                                >
                                                                    Run Demo Data
                                                                </motion.button>
                                                                <motion.button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDemoDataSelect('swim');
                                                                    }}
                                                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                                                    whileHover={{ x: 5 }}
                                                                >
                                                                    Swim Demo Data
                                                                </motion.button>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>
                                            <motion.button
                                                onClick={handleResetForm}
                                                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                            >
                                                Reset Form
                                            </motion.button>
                                        </div>
                                    </div>
                                    <div className="w-full overflow-x-auto">
                                        <div className="lg:min-w-[800px] lg:min-w-full">
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
                            </motion.div>

                            {/* Results Section */}
                            {hasValidData && (
                                <div className="space-y-8">
                                    {/* Lactate Curve Section */}
                                    <motion.div 
                                        ref={curveRef}
                                        initial="hidden"
                                        animate={isCurveInView ? "visible" : "hidden"}
                                        variants={fadeInUpVariants}
                                        className="bg-white rounded-xl shadow-sm border border-gray-100 sm:p-3 lg:p-6"
                                        whileHover={{ boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" }}
                                    >
                                        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Lactate Curve Analysis</h2>
                                        <div className="w-full overflow-x-auto">
                                            <div className="lg:min-w-[800px] lg:min-w-full">
                                                <LactateCurve 
                                                    mockData={prepareCalculatorData()} 
                                                    demoMode={true} 
                                                />
                                            </div>
                                        </div>
                                    </motion.div>

                                    {/* Calculator Section */}
                                    <motion.div 
                                        ref={calculatorRef}
                                        initial="hidden"
                                        animate={isCalculatorInView ? "visible" : "hidden"}
                                        variants={fadeInUpVariants}
                                        className="bg-white rounded-xl shadow-sm border border-gray-100 sm:p-3 lg:p-6"
                                        whileHover={{ boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" }}
                                    >
                                        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Training Zones Calculator</h2>
                                        <div className="w-full overflow-x-auto">
                                            <div className="lg:min-w-[800px] lg:min-w-full">
                                                <LactateCurveCalculator 
                                                    mockData={prepareCalculatorData()} 
                                                    demoMode={true} 
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <motion.div 
                                ref={buttonsRef}
                                initial="hidden"
                                animate={isButtonsInView ? "visible" : "hidden"}
                                variants={fadeInUpVariants}
                                className="flex flex-col sm:flex-row justify-center gap-4 pt-8 px-4"
                            >
                                <motion.button
                                    onClick={() => navigate('/signup')}
                                    className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-primary hover:bg-primary-dark transition-colors shadow-sm hover:shadow-md"
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    Create Account
                                </motion.button>
                                <motion.button
                                    onClick={() => navigate('/login')}
                                    className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 border border-primary text-base font-medium rounded-lg text-primary hover:bg-primary hover:text-white transition-colors shadow-sm hover:shadow-md"
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    Sign In
                                </motion.button>
                            </motion.div>
                        </div>
                    </div>
                </motion.main>

                {/* Footer */}
                <Footer />
            </div>
        </div>
    );
};

export default TestingWithoutLogin; 