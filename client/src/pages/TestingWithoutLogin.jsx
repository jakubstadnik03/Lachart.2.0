import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import TestingForm from '../components/Testing-page/TestingForm';
import LactateCurve from '../components/Testing-page/LactateCurve';
import LactateCurveCalculator from '../components/Testing-page/LactateCurveCalculator';
import TrainingZonesGenerator from '../components/Testing-page/TrainingZonesGenerator';
import { useNotification } from '../context/NotificationContext';
import Header from '../components/Header/Header';
import WelcomeModal from '../components/WelcomeModal';
import Menu from '../components/Menu';
import Footer from '../components/Footer';
import { trackEvent, trackDemoUsage, trackConversionFunnel, trackLactateTestCompletion, trackUserRegistration } from '../utils/analytics';
// SEO: Helmet meta tags at the top of the main component
import { Helmet } from 'react-helmet';
import { X as CloseIcon, Mail } from 'lucide-react';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { sendDemoTestEmail, register } from '../services/api';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import { saveUserToStorage } from '../utils/userStorage';
import { GoogleLogin } from '@react-oauth/google';
import { API_BASE_URL } from '../config/api.config';
import { logUserRegistration, logTestCreated } from '../utils/eventLogger';
import TrainingGlossary from '../components/DashboardPage/TrainingGlossary';

// Animation variants
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

const LactateCurveCalculatorPage = () => {
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
    const [showWelcome, setShowWelcome] = useState(false);
    const welcomeTimerRef = useRef(null);
    const [showFeatureModal, setShowFeatureModal] = useState(false);
    const featureTimerRef = useRef(null);
    const [showGlossary, setShowGlossary] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailFormData, setEmailFormData] = useState({
        email: '',
        name: '',
        surname: '',
        password: '',
        confirmPassword: '',
        role: 'athlete',
        termsAccepted: false
    });
    const [emailError, setEmailError] = useState(null);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const { login } = useAuth();

    // Legacy training tools state removed - unused

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

    // Track page view on mount
    useEffect(() => {
        if (!isInitialMount.current) {
            trackDemoUsage('page_view', { 
                has_saved_data: !!localStorage.getItem('testData'),
                sport: testData.sport 
            });
            trackConversionFunnel('demo_view', { 
                has_saved_data: !!localStorage.getItem('testData'),
                sport: testData.sport 
            });
        }
        isInitialMount.current = false;
    }, [testData.sport]);

    // Show welcome modal after 5 minutes on demo page (once per session)
    useEffect(() => {
        if (!sessionStorage.getItem('demoWelcomed')) {
            welcomeTimerRef.current = setTimeout(() => {
                setShowWelcome(true);
                sessionStorage.setItem('demoWelcomed', '1');
                trackDemoUsage('welcome_modal_shown', { time_on_page: '5_minutes' });
            }, 5 * 60 * 1000); // 5 minutes
        }
        return () => {
            if (welcomeTimerRef.current) clearTimeout(welcomeTimerRef.current);
        };
    }, []);

    // Feature modal after 60s of use (once per session)
    useEffect(() => {
        if (!sessionStorage.getItem('featureModalShown')) {
            featureTimerRef.current = setTimeout(() => {
                setShowFeatureModal(true);
                sessionStorage.setItem('featureModalShown', '1');
                trackDemoUsage('feature_modal_shown', { timing: '60s' });
            }, 60 * 1000);
        }
        return () => {
            if (featureTimerRef.current) clearTimeout(featureTimerRef.current);
        };
    }, []);

    // Initialize menu state based on screen size
    useEffect(() => {
        if (isInitialMount.current) {
            const handleResize = () => {
                if (window.innerWidth >= 768) {
                    setIsMenuOpen(true);
                } else {
                    setIsMenuOpen(false);
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
        trackEvent('demo_data_selected', { sport: sport });
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
        trackEvent('demo_form_reset');
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
                // Don't parse baseLa immediately - keep it as string for user input
                // It will be parsed only when saving
                // Preserve exact string value including partial inputs like "1." or "1,"
                // Don't convert to String() if it's already a string to preserve partial inputs
                return updatedData;
            });
            return;
        }

        // If newData is a complete data object
        // IMPORTANT: Preserve baseLa as exact string, don't convert to number
        // Don't use String() conversion if it's already a string to preserve partial inputs like "1."
        const updatedData = {
            ...newData,
            weight: newData.weight !== undefined ? (typeof newData.weight === 'string' ? newData.weight : String(newData.weight)) : '',
            baseLa: newData.baseLa !== undefined && newData.baseLa !== null 
                ? (typeof newData.baseLa === 'string' ? newData.baseLa : String(newData.baseLa)) 
                : '',
            // Keep baseLactate as string if baseLa is provided, otherwise use existing baseLactate
            // Don't parse immediately - let user type with comma or dot, including partial values like "1."
            baseLactate: newData.baseLa !== undefined && newData.baseLa !== null 
                ? (typeof newData.baseLa === 'string' ? newData.baseLa : String(newData.baseLa))
                : (newData.baseLactate !== undefined && newData.baseLactate !== null 
                    ? (typeof newData.baseLactate === 'string' ? newData.baseLactate : String(newData.baseLactate))
                    : ''),
            results: (newData.results || []).map(result => ({
                ...result,
                power: result.power !== undefined && result.power !== null ? String(result.power) : '',
                heartRate: result.heartRate !== undefined && result.heartRate !== null ? String(result.heartRate) : '',
                lactate: result.lactate !== undefined && result.lactate !== null ? String(result.lactate) : '',
                glucose: result.glucose !== undefined && result.glucose !== null ? String(result.glucose) : '',
                RPE: result.RPE !== undefined && result.RPE !== null ? String(result.RPE) : ''
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
        trackDemoUsage('test_processed', { 
            sport: data.sport,
            intervals: data.results.length 
        });
        trackLactateTestCompletion({
            sport: data.sport,
            stages: data.results.length,
            hasResults: true
        });
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


    // Handle send test to email
    const handleSendTestToEmail = () => {
        if (!hasValidData) {
            addNotification('Please fill in test data first', 'warning');
            return;
        }
        setShowEmailModal(true);
        trackDemoUsage('send_email_clicked', { 
            sport: testData.sport,
            intervals: testData.results.length 
        });
    };

    // Handle Google registration and send email
    const handleGoogleSuccess = async (response) => {
        setIsSendingEmail(true);
        setEmailError(null);

        try {
            const res = await fetch(`${API_BASE_URL}/auth/google`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    googleId: response.credential,
                    email: response.email,
                    name: response.given_name,
                    surname: response.family_name,
                }),
            });

            const data = await res.json();
            
            if (data.token) {
                trackUserRegistration('google', 'athlete');
                trackConversionFunnel('signup_complete', { method: 'google', role: 'athlete', source: 'demo_email' });
                
                // Log registration event
                await logUserRegistration('google', data.user?._id);
                
                // Save token and user
                const token = data.token;
                const user = data.user;
                
                localStorage.setItem('token', token);
                saveUserToStorage(user);
                api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
                
                // Update auth state - wait for it to complete
                await login(null, null, token, user);
                
                // Wait a bit more to ensure auth state is fully updated
                await new Promise(resolve => setTimeout(resolve, 300));

                // Prepare test data for email
                const emailTestData = prepareCalculatorData();

                // Get userId from registered user
                const userId = user?._id || user?.id || null;

                // Save test to user's account
                if (userId && token) {
                    try {
                        // Use token directly from data
                        if (!token) {
                            throw new Error('No authentication token available');
                        }
                        
                        // Ensure token is in localStorage and headers
                        localStorage.setItem('token', token);
                        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
                        
                        // Ensure date is in proper format (Date object or ISO string)
                        let testDate = emailTestData.date;
                        if (!testDate) {
                            testDate = new Date().toISOString();
                        } else if (typeof testDate === 'string' && !testDate.includes('T')) {
                            // If it's just a date string (YYYY-MM-DD), convert to ISO
                            testDate = new Date(testDate).toISOString();
                        }
                        // If already ISO string, keep it as is

                        // Ensure title exists
                        const testTitle = emailTestData.title || `Lactate Test - ${emailTestData.sport || 'bike'} - ${new Date().toLocaleDateString()}`;

                        // Ensure results have interval field
                        const resultsWithInterval = emailTestData.results.map((result, index) => ({
                            ...result,
                            interval: result.interval || (index + 1)
                        }));

                        // Parse weight to number if it's a string
                        let weightValue = emailTestData.weight;
                        if (typeof weightValue === 'string') {
                            weightValue = parseFloat(weightValue.replace(',', '.')) || 0;
                        } else if (!weightValue) {
                            weightValue = 0;
                        }

                        const testToSave = {
                            athleteId: String(userId),
                            sport: emailTestData.sport || 'bike',
                            title: testTitle,
                            date: testDate,
                            description: emailTestData.description || '',
                            baseLactate: Number(emailTestData.baseLactate) || 0,
                            weight: Number(weightValue) || 0,
                            specifics: emailTestData.specifics || { specific: '', weather: '' },
                            comments: emailTestData.comments || '',
                            unitSystem: emailTestData.unitSystem || 'metric',
                            inputMode: emailTestData.inputMode || 'pace',
                            results: resultsWithInterval
                        };
                        
                        // Double-check token before making request
                        const currentToken = localStorage.getItem('token');
                        if (!currentToken) {
                            throw new Error('No authentication token available');
                        }
                        
                        console.log('Saving test to database:', {
                            athleteId: testToSave.athleteId,
                            sport: testToSave.sport,
                            title: testToSave.title,
                            date: testToSave.date,
                            resultsCount: testToSave.results.length,
                            hasToken: !!currentToken,
                            tokenPreview: currentToken.substring(0, 20) + '...'
                        });
                        
                        // Make request with explicit token header
                        const savedTest = await api.post('/test', testToSave, {
                            headers: {
                                'Authorization': `Bearer ${currentToken}`
                            }
                        });
                        
                        if (savedTest?.data?._id) {
                            console.log('Test saved successfully to database:', {
                                testId: savedTest.data._id,
                                title: savedTest.data.title,
                                athleteId: savedTest.data.athleteId
                            });
                            addNotification('Test saved to your account!', 'success');
                            try {
                              await logTestCreated(testToSave.sport || 'bike', (testToSave.results || []).length, userId);
                            } catch (e) { /* non-blocking */ }
                        } else {
                            console.warn('Test save response missing ID:', savedTest);
                            addNotification('Test may not have been saved correctly', 'warning');
                        }
                    } catch (error) {
                        console.error('Error saving test to account:', error);
                        console.error('Error details:', {
                            message: error.message,
                            response: error.response?.data,
                            status: error.response?.status
                        });
                        addNotification(`Test sent to email, but failed to save to account: ${error.response?.data?.error || error.message}`, 'warning');
                        // Don't fail the whole flow if test save fails
                    }
                }

                // Send email with test results
                await sendDemoTestEmail(emailTestData, response.email, `${response.given_name} ${response.family_name}`, userId);

                addNotification('Test results sent to your email!', 'success');
                trackDemoUsage('test_email_sent', { 
                    sport: testData.sport,
                    intervals: testData.results.length,
                    method: 'google'
                });

                // Close modal
                setShowEmailModal(false);

                // Optionally navigate to dashboard
                setTimeout(() => {
                    navigate('/dashboard');
                }, 2000);
            } else {
                setEmailError('Google authentication failed. Please try again.');
                trackEvent('register_error', { method: 'google', error: 'Authentication failed' });
            }
        } catch (error) {
            console.error('Google auth error:', error);
            setEmailError('Failed to authenticate with Google. Please try again.');
            trackEvent('register_error', { method: 'google', error: error.message });
        } finally {
            setIsSendingEmail(false);
        }
    };

    const handleGoogleError = () => {
        setEmailError('Google authentication failed. Please try again.');
        trackEvent('register_error', { method: 'google', error: 'User cancelled or error occurred' });
    };

    // Handle email form submission
    const handleEmailFormSubmit = async (e) => {
        e.preventDefault();
        setEmailError(null);

        // Validate form
        if (!emailFormData.email || !emailFormData.name || !emailFormData.surname || !emailFormData.password) {
            setEmailError('Please fill in all required fields');
            return;
        }

        if (emailFormData.password !== emailFormData.confirmPassword) {
            setEmailError("Passwords don't match");
            return;
        }

        if (emailFormData.password.length < 8) {
            setEmailError('Password must be at least 8 characters');
            return;
        }

        if (!emailFormData.termsAccepted) {
            setEmailError('You must agree to the Terms & Conditions and Privacy Policy');
            return;
        }

        setIsSendingEmail(true);

        try {
            // First, register the user
            const registrationData = {
                email: emailFormData.email,
                password: emailFormData.password,
                confirmPassword: emailFormData.confirmPassword,
                name: emailFormData.name,
                surname: emailFormData.surname,
                role: emailFormData.role
            };

            const registerResponse = await register(registrationData);
            trackUserRegistration('email', emailFormData.role);
            trackConversionFunnel('signup_complete', { method: 'email', role: emailFormData.role, source: 'demo_email' });

            // Save token and user
            if (registerResponse?.data?.token && registerResponse?.data?.user) {
                const token = registerResponse.data.token;
                const user = registerResponse.data.user;
                
                // Save to localStorage first
                localStorage.setItem('token', token);
                saveUserToStorage(user);
                api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
                
                // Update auth state - wait for it to complete
                await login(emailFormData.email, emailFormData.password, token, user);
                
                // Wait a bit more to ensure auth state is fully updated
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Prepare test data for email
            const emailTestData = prepareCalculatorData();

            // Get userId from registered user
            const userId = registerResponse?.data?.user?._id || registerResponse?.data?.user?.id || null;

            // Save test to user's account
            if (userId && registerResponse?.data?.token) {
                try {
                    // Use token directly from registerResponse
                    const token = registerResponse.data.token;
                    
                    // Verify token is available
                    if (!token) {
                        throw new Error('No authentication token available');
                    }
                    
                    // Ensure token is in localStorage and headers
                    localStorage.setItem('token', token);
                    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
                    // Ensure date is in proper format (Date object or ISO string)
                    let testDate = emailTestData.date;
                    if (!testDate) {
                        testDate = new Date().toISOString();
                    } else if (typeof testDate === 'string' && !testDate.includes('T')) {
                        // If it's just a date string (YYYY-MM-DD), convert to ISO
                        testDate = new Date(testDate).toISOString();
                    }
                    // If already ISO string, keep it as is

                    // Ensure title exists
                    const testTitle = emailTestData.title || `Lactate Test - ${emailTestData.sport || 'bike'} - ${new Date().toLocaleDateString()}`;

                    // Ensure results have interval field
                    const resultsWithInterval = emailTestData.results.map((result, index) => ({
                        ...result,
                        interval: result.interval || (index + 1)
                    }));

                    // Parse weight to number if it's a string
                    let weightValue = emailTestData.weight;
                    if (typeof weightValue === 'string') {
                        weightValue = parseFloat(weightValue.replace(',', '.')) || 0;
                    } else if (!weightValue) {
                        weightValue = 0;
                    }

                    const testToSave = {
                        athleteId: String(userId),
                        sport: emailTestData.sport || 'bike',
                        title: testTitle,
                        date: testDate,
                        description: emailTestData.description || '',
                        baseLactate: Number(emailTestData.baseLactate) || 0,
                        weight: Number(weightValue) || 0,
                        specifics: emailTestData.specifics || { specific: '', weather: '' },
                        comments: emailTestData.comments || '',
                        unitSystem: emailTestData.unitSystem || 'metric',
                        inputMode: emailTestData.inputMode || 'pace',
                        results: resultsWithInterval
                    };
                    
                    // Double-check token before making request
                    const currentToken = localStorage.getItem('token');
                    if (!currentToken) {
                        throw new Error('No authentication token available');
                    }
                    
                    console.log('Saving test to database:', {
                        athleteId: testToSave.athleteId,
                        sport: testToSave.sport,
                        title: testToSave.title,
                        date: testToSave.date,
                        resultsCount: testToSave.results.length,
                        hasToken: !!currentToken,
                        tokenPreview: currentToken.substring(0, 20) + '...'
                    });
                    
                        // Make request with explicit token header
                        const savedTest = await api.post('/test', testToSave, {
                            headers: {
                                'Authorization': `Bearer ${currentToken}`
                            }
                        });
                        
                        if (savedTest?.data?._id) {
                            console.log('Test saved successfully to database:', {
                                testId: savedTest.data._id,
                                title: savedTest.data.title,
                                athleteId: savedTest.data.athleteId
                            });
                            addNotification('Test saved to your account!', 'success');
                            try {
                              await logTestCreated(testToSave.sport || 'bike', (testToSave.results || []).length, userId);
                            } catch (e) { /* non-blocking */ }
                        } else {
                            console.warn('Test save response missing ID:', savedTest);
                            addNotification('Test may not have been saved correctly', 'warning');
                        }
                } catch (error) {
                    console.error('Error saving test to account:', error);
                    console.error('Error details:', {
                        message: error.message,
                        response: error.response?.data,
                        status: error.response?.status
                    });
                    addNotification(`Test sent to email, but failed to save to account: ${error.response?.data?.error || error.message}`, 'warning');
                    // Don't fail the whole flow if test save fails
                }
            }

            // Send email with test results
            await sendDemoTestEmail(emailTestData, emailFormData.email, `${emailFormData.name} ${emailFormData.surname}`, userId);

            addNotification('Test results sent to your email!', 'success');
            trackDemoUsage('test_email_sent', { 
                sport: testData.sport,
                intervals: testData.results.length 
            });

            // Close modal and reset form
            setShowEmailModal(false);
            setEmailFormData({
                email: '',
                name: '',
                surname: '',
                password: '',
                confirmPassword: '',
                role: 'athlete',
                termsAccepted: false
            });

            // Optionally navigate to dashboard
            setTimeout(() => {
                navigate('/dashboard');
            }, 2000);
        } catch (error) {
            console.error('Error sending test to email:', error);
            if (error.response?.data?.error?.includes('already exist')) {
                setEmailError('An account with this email already exists. Please sign in instead.');
            } else {
                setEmailError(error.response?.data?.error || error.message || 'Failed to send email. Please try again.');
            }
            trackEvent('send_email_error', { 
                error: error.response?.data?.error || error.message 
            });
        } finally {
            setIsSendingEmail(false);
        }
    };

    // Prepare data for LactateCurveCalculator
    const prepareCalculatorData = () => {
        if (!testData || !testData.results) {
            return {
                sport: 'bike',
                baseLactate: 0,
                results: []
            };
        }
        
        // Ensure baseLactate is properly processed for calculations
        // Parse only for calculations, don't modify the original testData.baseLa (which is used for display)
        const baseLaStr = testData.baseLa !== undefined && testData.baseLa !== null 
            ? String(testData.baseLa) 
            : (testData.baseLactate !== undefined && testData.baseLactate !== null 
                ? String(testData.baseLactate) 
                : '0');
        const baseLactate = baseLaStr === '' ? 0 : parseFloat(baseLaStr.replace(',', '.'));

        const processedData = {
            ...testData,
            baseLactate: baseLactate,
            // Keep baseLa as original string for display purposes
            baseLa: testData.baseLa !== undefined ? testData.baseLa : baseLaStr,
            results: testData.results.map((result, idx) => {
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
                    interval: result.interval || (idx + 1),
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

    // Ensure page starts at top on initial load
    useEffect(() => {
        try {
            window.scrollTo(0, 0);
        } catch {
            // ignore
        }
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 flex overflow-x-hidden overflow-y-hidden w-full relative">
            <Helmet>
                <title>Lactate Curve Calculator | Free Lactate Testing, LT1, LT2, OBLA &amp; Training Zones Online</title>
                <link rel="canonical" href="https://lachart.net/lactate-curve-calculator" />
                <meta name="description" content="Calculate zones from lactate effortlessly. Free online lactate curve calculator: analyze test data, determine LT1/LT2/OBLA, and generate training zones for running, cycling, and swimming. No login required." />
                <meta name="keywords" content="lactate curve calculator, lactate test, LT1, LT2, lactate threshold, OBLA, training zones, running, cycling, endurance, free tool, online, calculator, lactic acid, calculate zones from lactate, calculate training zones from lactate, lactate zones calculator, lactate based training zones" />
                <meta property="og:title" content="Lactate Curve Calculator – Free Online Test &amp; LT1, LT2 Zones Generator" />
                <meta property="og:description" content="Instantly analyze your lactate test: calculate zones from lactate, see LT1/LT2 thresholds and generate training zones. Free for runners, cyclists and coaches!" />
                <meta property="og:type" content="website" />
                <meta property="og:url" content="https://lachart.net/lactate-curve-calculator" />
                <meta property="og:image" content="https://lachart.net/og-lactate-curve-calculator.png" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="Lactate Curve Calculator – Calculate Zones from Lactate (LT1, LT2, OBLA)" />
                <meta name="twitter:description" content="Free lactate curve calculator: calculate zones from lactate, determine LT1/LT2 and get training zones instantly." />
                <meta name="twitter:image" content="https://lachart.net/og-lactate-curve-calculator.png" />
                {/* FAQ Structured Data */}
                <script type="application/ld+json">{`
                    {
                        "@context": "https://schema.org",
                        "@type": "FAQPage",
                        "mainEntity": [
                            {"@type": "Question", "name": "What is a lactate curve?", "acceptedAnswer": {"@type": "Answer", "text": "A lactate curve visualizes the concentration of blood lactate at increasing exercise intensities. It helps identify aerobic (LT1) and anaerobic (LT2, OBLA) thresholds for optimizing training."}},
                            {"@type": "Question", "name": "How do I calculate lactate threshold?", "acceptedAnswer": {"@type": "Answer", "text": "You can estimate your lactate threshold using a step test, measuring blood lactate at each stage, and analyzing the curve with an online calculator to find LT1, LT2, or OBLA points."}},
                            {"@type": "Question", "name": "How do I calculate training zones from lactate?", "acceptedAnswer": {"@type": "Answer", "text": "Enter your test stages and this tool calculates training zones by deriving LT1 and LT2 from your lactate curve, then mapping intensities to practical pace/power/HR zones for your sport."}},
                            {"@type": "Question", "name": "Can I use this calculator for running, cycling, swimming?", "acceptedAnswer": {"@type": "Answer", "text": "Yes! The calculator works for all endurance sports: running, cycling, swimming and more. Just enter your test stages and see your personalized curve and zones."}}
                        ]
                    }
                `}</script>
            </Helmet>
            {/* Left Menu - Desktop: always visible, Mobile: animated */}
            <div className="menu-container hidden md:block fixed top-0 left-0 h-screen overflow-y-auto z-40" ref={menuRef}>
            <Menu 
                    isMenuOpen={true} 
                    setIsMenuOpen={() => {}}
                user={emptyUser}
                token=""
            />
            </div>
            
            {/* Mobile Menu */}
            <div className="menu-container md:hidden fixed top-0 left-0 h-screen overflow-y-auto z-40">
                <Menu 
                    isMenuOpen={isMenuOpen} 
                    setIsMenuOpen={setIsMenuOpen}
                user={emptyUser}
                token=""
            />
            </div>

            {/* Main Content Container */}
            <div className="flex-1 flex flex-col min-h-screen w-full overflow-x-hidden overflow-y-auto md:ml-64 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {/* Header */}
                <Header 
                    isMenuOpen={isMenuOpen} 
                    setIsMenuOpen={setIsMenuOpen}
                    user={emptyUser}
                />

                {/* Main Content */}
          {/* Main Content */}
          <main className="flex-1 px-4 py-8 pt-16 md:pt-8 overflow-x-hidden overflow-y-visible w-full max-w-full">
                    <div className="max-w-[1600px] mx-auto space-y-8 overflow-x-hidden overflow-y-hidden w-full">
                        {/* Page Header – modern hero */}
                        <section className="w-full bg-white rounded-3xl shadow-sm border border-gray-100 mb-10 overflow-hidden relative">
                          <div className="absolute inset-x-0 -top-20 h-40 bg-gradient-to-r from-primary/20 via-pink-300/20 to-purple-400/10 blur-3xl pointer-events-none" />
                          <div className="relative px-4 sm:px-8 py-8 sm:py-10 lg:py-12 flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-10">
                            <div className="flex-1 min-w-0">
                              <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] sm:text-xs font-semibold text-primary mb-3">
                                Free online tool • No login required
                              </div>
                              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight mb-3">
      Lactate Curve Calculator
    </h1>
                              <p className="text-sm sm:text-base text-gray-600 max-w-2xl mb-4">
                                Turn your blood lactate test into a clear curve with LT1, LT2/OBLA and ready‑to‑use training
                                zones for running, cycling and swimming.
                              </p>
                              <div className="flex flex-wrap gap-3 mb-4">
                                <div className="inline-flex items-center px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2" />
                                  Works entirely in your browser – data stays on your device
      </div>
                                <div className="inline-flex items-center px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 mr-2" />
                                  Supports bike, run and swim step tests
      </div>
    </div>
                              <div className="flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  onClick={() => navigate('/signup')}
                                  className="inline-flex items-center justify-center px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-primary to-pink-500 shadow-sm hover:shadow-md hover:from-primary/90 hover:to-pink-500/90 transition-all"
                                >
                                  Save tests – sign up for free
                                </button>
                                <button
                                  type="button"
                                  onClick={() => navigate('/about')}
                                  className="inline-flex items-center justify-center px-4 sm:px-5 py-2.5 rounded-xl text-sm font-medium text-gray-800 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                                >
                                  Learn how LaChart uses lactate data →
                                </button>
  </div>
</div>
                            <div className="w-full lg:w-80 xl:w-96">
                              <div className="bg-gradient-to-br from-primary/10 via-white to-purple-50 border border-primary/20 rounded-2xl p-4 sm:p-5 shadow-sm">
                                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                                  What you get from this calculator
                                </h3>
                                <ul className="text-xs sm:text-sm text-gray-700 space-y-1.5">
                                  <li>• Clean lactate curve from your test stages</li>
                                  <li>• Estimated LT1 (aerobic) and LT2 / OBLA (anaerobic) thresholds</li>
                                  <li>• Sport‑specific training zones for power / pace / heart rate</li>
                                  <li>• Option to send a full PDF‑style report after you create an account</li>
                                </ul>
                                <p className="mt-3 text-[11px] text-gray-500">
                                  LaChart is used by endurance coaches and self‑coached athletes to turn lab and field lactate
                                  tests into practical training plans.
                                </p>
                            </div>
                            </div>
                          </div>
                        </section>

                        {/* Short info row */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto px-4">
                          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-900">
                            🧪 <span className="font-semibold">Try without login:</span> enter demo data or your own test – we
                            won&apos;t save anything unless you create an account.
                          </div>
                          <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-900">
                            📝 <span className="font-semibold">Tip:</span> use 3–6 minute stages with small intensity steps and
                            sample lactate at the end of each stage for the cleanest curve.
                            </div>
                        </div>


                        {/* Main Content Area */}
                        <div className="space-y-8 mt-8 px-0  w-full">
                            {/* Top Controls - Fill Demo Data and Help */}
                            <div className="flex flex-row sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 px-4">
                                <div className="relative">
                                                <button
                                                    onClick={toggleDemoDropdown}
                                        className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors flex items-center justify-between"
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
                                                className="absolute left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 z-[9999]"
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
                                </div>
                                
                                <div className="flex items-center gap-3">
                                    <button
                                                onClick={handleResetForm}
                                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                            >
                                                Reset Form
                                    </button>
                                    
                                    <button
                                        onClick={() => setShowGlossary(true)}
                                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                                        aria-label="Show glossary"
                                        title="Training Glossary"
                                    >
                                        <InformationCircleIcon className="w-6 h-6" />
                                    </button>
                        </div>
                        </div>

                            {/* Form and Curve Side by Side */}
                            <div className="flex flex-col lg:flex-row gap-6 items-start  w-full">
                                {/* Lactate Curve Section - Left (Wider) */}
                                <motion.div 
                                    ref={curveRef}
                                    initial="hidden"
                                    animate={(isCurveInView || hasValidData) ? "visible" : "hidden"}
                                    variants={fadeInUpVariants}
                                    className="flex-1 lg:flex-none lg:w-2/3 max-w-full "
                                    whileHover={{ boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" }}
                                >
                                            <LactateCurve 
                                                mockData={prepareCalculatorData()} 
                                                demoMode={true} 
                                            />
                                </motion.div>

                                {/* Testing Form Section - Right (Narrower) */}
                            <motion.div 
                                ref={formRef}
                                initial="hidden"
                                animate={isFormInView ? "visible" : "hidden"}
                                variants={fadeInUpVariants}
                                    className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-hidden flex-1 lg:flex-none lg:w-1/3 max-w-full"
                                whileHover={{ boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" }}
                            >
                                <div className="p-4 sm:p-6">
                                    <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">Test Data Entry</h2>
                                    <div className="w-full overflow-x-hidden">
                                        <div className="w-full min-w-0">
                            <TestingForm
                                testData={testData}
                                onTestDataChange={handleTestDataChange}
                                onSave={handleSave}
                                onGlucoseColumnChange={handleGlucoseColumnChange}
                                demoMode={true}
                                                disableInnerScroll={true}
                            />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                            </div>

                            {/* Training Zones Generator - Full Width */}
                            {hasValidData && (
                            <motion.div 
                                initial="hidden"
                                    animate={hasValidData ? "visible" : "hidden"}
                                        variants={fadeInUpVariants}
                                    className="bg-white rounded-xl shadow-sm border border-gray-100 sm:p-3 lg:p-6 overflow-x-hidden w-full"
                                        whileHover={{ boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" }}
                                    >
                                    <h2 className="text-2xl font-semibold text-gray-900 mb-6">Training Zones</h2>
                                        <div className="w-full">
                                                    <TrainingZonesGenerator mockData={prepareCalculatorData()} demoMode={true} />
                                        </div>
                                    </motion.div>
                            )}

                        

                            {/* Results Section */}
                            {hasValidData && (
                                <div className="space-y-8">

                                    {/* Calculator Section */}
                                    <motion.div 
                                        ref={calculatorRef}
                                        initial="hidden"
                                        animate={(isCalculatorInView || hasValidData) ? "visible" : "hidden"}
                                        variants={fadeInUpVariants}
                                        className="bg-white rounded-xl shadow-sm border border-gray-100 sm:p-3 lg:p-6"
                                        whileHover={{ boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" }}
                                    >
                                                <LactateCurveCalculator 
                                                    mockData={prepareCalculatorData()} 
                                                    demoMode={true} 
                                                />
                                    
                                    </motion.div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <motion.div 
                                ref={buttonsRef}
                                initial="hidden"
                                animate={isButtonsInView ? "visible" : "hidden"}
                                variants={fadeInUpVariants}
                                className="flex flex-col sm:flex-row justify-center items-stretch sm:items-center gap-3 sm:gap-4 pt-8 px-4 w-full"
                            >
                                {hasValidData && (
                                    <motion.button
                                        onClick={handleSendTestToEmail}
                                        className="w-full sm:w-auto inline-flex items-center justify-center px-4 sm:px-6 py-3 border border-transparent text-sm sm:text-base font-medium rounded-lg text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl"
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <Mail className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                                        <span className="whitespace-nowrap">Send Test Results to Email</span>
                                    </motion.button>
                                )}
                                <motion.button
                                    onClick={() => { 
                                        trackDemoUsage('cta_click', { label: 'demo_create_account' }); 
                                        trackConversionFunnel('signup_start', { source: 'demo_page' });
                                        navigate('/signup'); 
                                    }}
                                    className="w-full sm:w-auto inline-flex items-center justify-center px-4 sm:px-6 py-3 border border-transparent text-sm sm:text-base font-medium rounded-lg text-white bg-primary hover:bg-primary-dark transition-colors shadow-sm hover:shadow-md"
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <span className="whitespace-nowrap">Create Account</span>
                                </motion.button>
                                <motion.button
                                    onClick={() => { 
                                        trackDemoUsage('cta_click', { label: 'demo_sign_in' }); 
                                        trackConversionFunnel('login_start', { source: 'demo_page' });
                                        navigate('/login'); 
                                    }}
                                    className="w-full sm:w-auto inline-flex items-center justify-center px-4 sm:px-6 py-3 border border-primary text-sm sm:text-base font-medium rounded-lg text-primary hover:bg-primary hover:text-white transition-colors shadow-sm hover:shadow-md"
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <span className="whitespace-nowrap">Sign In</span>
                                </motion.button>
                            </motion.div>
                        </div>
                    </div>
                </main>

                {/* Footer */}
                <Footer />
                <WelcomeModal open={showWelcome} onClose={() => setShowWelcome(false)} />
                
                {/* Glossary Modal */}
                <TrainingGlossary 
                    isOpen={showGlossary} 
                    onClose={() => setShowGlossary(false)} 
                    initialTerm="Lactate Testing"
                    initialCategory="Lactate"
                />
                
                {/* Send Test to Email Modal */}
                <AnimatePresence>
                    {showEmailModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center px-4"
                            onClick={() => !isSendingEmail && setShowEmailModal(false)}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8 max-h-[95vh] overflow-y-auto"
                            >
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-2xl font-bold text-gray-900">Send Test Results to Email</h3>
                                    <button 
                                        className="text-gray-500 hover:text-gray-700 transition-colors" 
                                        onClick={() => !isSendingEmail && setShowEmailModal(false)}
                                        disabled={isSendingEmail}
                                    >
                                        <CloseIcon size={24} />
                                    </button>
                                </div>
                                
                                <p className="text-gray-600 mb-5 text-sm">
                                    Create a free account and we'll send your test results to your email. You'll also be able to save and track your tests over time.
                                </p>

                                {/* Google Sign Up Button */}
                                <div className="mb-4">
                                    <GoogleLogin
                                        onSuccess={handleGoogleSuccess}
                                        onError={handleGoogleError}
                                        useOneTap={false}
                                        theme="outline"
                                        size="large"
                                        text="signup_with"
                                        shape="rectangular"
                                        disabled={isSendingEmail}
                                    />
                                </div>

                                <div className="relative mb-4">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-gray-300"></div>
                                    </div>
                                    <div className="relative flex justify-center text-sm">
                                        <span className="px-2 bg-white text-gray-500">Or continue with email</span>
                                    </div>
                                </div>

                                <form onSubmit={handleEmailFormSubmit} className="space-y-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Email <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            type="email"
                                            required
                                            value={emailFormData.email}
                                            onChange={(e) => setEmailFormData({ ...emailFormData, email: e.target.value })}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                                            placeholder="your@email.com"
                                            disabled={isSendingEmail}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                First Name <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={emailFormData.name}
                                                onChange={(e) => setEmailFormData({ ...emailFormData, name: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                                                placeholder="John"
                                                disabled={isSendingEmail}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Last Name <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={emailFormData.surname}
                                                onChange={(e) => setEmailFormData({ ...emailFormData, surname: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                                                placeholder="Doe"
                                                disabled={isSendingEmail}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Password <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="password"
                                                required
                                                value={emailFormData.password}
                                                onChange={(e) => setEmailFormData({ ...emailFormData, password: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                                                placeholder="At least 8 characters"
                                                minLength={8}
                                                disabled={isSendingEmail}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Confirm Password <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="password"
                                                required
                                                value={emailFormData.confirmPassword}
                                                onChange={(e) => setEmailFormData({ ...emailFormData, confirmPassword: e.target.value })}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                                                placeholder="Confirm your password"
                                                disabled={isSendingEmail}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Role <span className="text-red-500">*</span>
                                        </label>
                                        <div className="flex gap-4">
                                            <label className="flex items-center cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="role"
                                                    value="athlete"
                                                    checked={emailFormData.role === 'athlete'}
                                                    onChange={(e) => setEmailFormData({ ...emailFormData, role: e.target.value })}
                                                    className="mr-2 text-primary focus:ring-primary"
                                                    disabled={isSendingEmail}
                                                />
                                                <span className="text-sm text-gray-700">Athlete</span>
                                            </label>
                                            <label className="flex items-center cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="role"
                                                    value="coach"
                                                    checked={emailFormData.role === 'coach'}
                                                    onChange={(e) => setEmailFormData({ ...emailFormData, role: e.target.value })}
                                                    className="mr-2 text-primary focus:ring-primary"
                                                    disabled={isSendingEmail}
                                                />
                                                <span className="text-sm text-gray-700">Coach</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="flex items-start">
                                        <input
                                            type="checkbox"
                                            id="terms"
                                            checked={emailFormData.termsAccepted}
                                            onChange={(e) => setEmailFormData({ ...emailFormData, termsAccepted: e.target.checked })}
                                            className="mt-1 mr-2 text-primary focus:ring-primary rounded"
                                            disabled={isSendingEmail}
                                        />
                                        <label htmlFor="terms" className="text-sm text-gray-700 cursor-pointer">
                                            I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Terms & Conditions</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a>. <span className="text-red-500">*</span>
                                        </label>
                                    </div>

                                    {emailError && (
                                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                                            {emailError}
                                        </div>
                                    )}

                                    <div className="flex gap-3 pt-2">
                                        <button
                                            type="submit"
                                            disabled={isSendingEmail}
                                            className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                                        >
                                            {isSendingEmail ? 'Sending...' : 'Create Account & Send Email'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowEmailModal(false)}
                                            disabled={isSendingEmail}
                                            className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Feature/Signup Modal after 60s */}
                <AnimatePresence>
                  {showFeatureModal && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center px-4"
                      onClick={() => setShowFeatureModal(false)}
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white/80 backdrop-blur-lg border border-white/40 rounded-2xl shadow-xl max-w-lg w-full p-6"
                      >
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-xl font-bold text-gray-900">Unlock More with LaChart</h3>
                          <button className="text-gray-500 hover:text-gray-700" onClick={() => setShowFeatureModal(false)}>
                            <CloseIcon size={20} />
                          </button>
                        </div>
                        <p className="text-gray-700 mb-4">Save your tests, calculate zones from lactate automatically, and track progress over time.</p>
                        <ul className="text-sm text-gray-700 space-y-2 mb-5 list-disc pl-5">
                          <li>Compare test results across dates (progress tracking)</li>
                          <li>Coach workspace: store athletes’ tests and training lactate</li>
                          <li>Auto-generated training zones for run/bike/swim</li>
                        </ul>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => {
                              setShowFeatureModal(false);
                              navigate('/signup');
                              trackConversionFunnel('signup_start', { source: '60s_feature_modal' });
                            }}
                            className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 shadow"
                          >
                            Sign up for free
                          </button>
                          <button
                            onClick={() => setShowFeatureModal(false)}
                            className="px-4 py-2 bg-white/70 text-gray-800 rounded-xl hover:bg-white border border-white/40 shadow"
                          >
                            Maybe later
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default LactateCurveCalculatorPage; 