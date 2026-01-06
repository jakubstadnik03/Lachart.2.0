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
import { sendDemoTestEmail, register, addTest } from '../services/api';
import api from '../services/api';
import { useAuth } from '../context/AuthProvider';
import { saveUserToStorage } from '../utils/userStorage';
import { GoogleLogin } from '@react-oauth/google';
import { API_BASE_URL } from '../config/api.config';
import { logUserRegistration } from '../utils/eventLogger';
import TrainingGlossary from '../components/DashboardPage/TrainingGlossary';

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

const LactateCurveCalculatorPage = () => {
    const navigate = useNavigate();
    const { addNotification } = useNotification();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    console.log(isMenuOpen);
    
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
                localStorage.setItem('token', data.token);
                saveUserToStorage(data.user);
                api.defaults.headers.common["Authorization"] = `Bearer ${data.token}`;
                
                // Update auth state
                await login(null, null, data.token, data.user);

                // Prepare test data for email
                const emailTestData = prepareCalculatorData();

                // Get userId from registered user
                const userId = data?.user?._id || data?.user?.id || null;

                // Save test to user's account
                if (userId) {
                    try {
                        const testToSave = {
                            ...emailTestData,
                            athleteId: userId,
                            date: emailTestData.date || new Date().toISOString().split('T')[0]
                        };
                        await addTest(testToSave);
                        console.log('Test saved to user account');
                    } catch (error) {
                        console.error('Error saving test to account:', error);
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
                localStorage.setItem('token', registerResponse.data.token);
                saveUserToStorage(registerResponse.data.user);
                api.defaults.headers.common["Authorization"] = `Bearer ${registerResponse.data.token}`;
                
                // Update auth state
                await login(emailFormData.email, emailFormData.password, registerResponse.data.token, registerResponse.data.user);
            }

            // Prepare test data for email
            const emailTestData = prepareCalculatorData();

            // Get userId from registered user
            const userId = registerResponse?.data?.user?._id || registerResponse?.data?.user?.id || null;

            // Save test to user's account
            if (userId) {
                try {
                    const testToSave = {
                        ...emailTestData,
                        athleteId: userId,
                        date: emailTestData.date || new Date().toISOString().split('T')[0]
                    };
                    await addTest(testToSave);
                    console.log('Test saved to user account');
                } catch (error) {
                    console.error('Error saving test to account:', error);
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

    // When valid data appears (e.g., after filling mock data), scroll to curve and ensure visible
    useEffect(() => {
        if (hasValidData && curveRef.current) {
            try {
                curveRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (e) {
                // no-op
            }
        }
    }, [hasValidData]);

    return (
        <div className="min-h-screen bg-gray-50 flex overflow-x-hidden w-full relative">
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
          <motion.main 
                    className="flex-1 px-4 py-8 overflow-x-hidden overflow-y-auto w-full max-w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                >
                    <div className="max-w-[1600px] mx-auto space-y-8 overflow-x-hidden w-full">
                        {/* Page Header */}
                        <div className="w-full bg-gradient-to-r from-blue-100/60 via-white to-purple-100/80 pb-14 pt-18 px-4 rounded-3xl shadow-2xl mb-14 border-t-4 border-b-4 border-primary/40 relative overflow-hidden">
  {/* EKG SVG background */}
  <svg className="absolute left-1/2 -translate-x-1/2 top-7 w-64 md:w-[420px] opacity-25 z-0" viewBox="0 0 300 40" fill="none">
    <path d="M5 35Q38 5 62 27Q90 44 135 16Q170 1 295 36" stroke="#4F46E5" strokeWidth="6" fill="none"/>
  </svg>
  <div className="max-w-5xl mx-auto text-center relative z-10">
    <h1 className="text-5xl md:text-6xl font-extrabold mb-7 leading-snug tracking-tight bg-gradient-to-br from-primary via-pink-500 to-purple-600 bg-clip-text text-transparent drop-shadow-lg">
      Lactate Curve Calculator
    </h1>
    <div className="h-3 inline-block mb-4">
      <span className="block w-32 mx-auto rounded-full h-1 bg-gradient-to-r from-indigo-400 via-pink-400 to-yellow-400"></span>
    </div>
    <h2 className="text-2xl md:text-3xl font-bold mb-7 leading-snug underline underline-offset-8 decoration-primary/60 text-gray-900">
      Analyze Your <span className="bg-primary/10 px-2 rounded font-semibold">Lactate Test</span> Instantly With Our <span className="text-primary font-bold">Advanced Calculator</span>
    </h2>
    <p className="text-xl md:text-2xl text-gray-800 mb-4 font-medium max-w-4xl mx-auto">
      Upload or enter your blood lactate testing stages below to generate your personalized curve and calculate endurance thresholds (
      <span className="text-indigo-800 font-bold">LT1</span>,
      <span className="text-pink-700 font-bold"> LT2</span>, <span className="text-orange-700 font-bold">OBLA</span>
      ).
      <br className="hidden md:block"/>
      <span className="block mt-2 bg-gradient-to-r from-pink-600 to-blue-500 bg-clip-text text-transparent font-bold text-2xl">
        Automated calculation of LT1, LT2 (OBLA), and training zones!
      </span>
    </p>
    <div className="flex flex-col md:flex-row md:gap-8 gap-5 justify-center items-center mt-6 px-2">
      <div className="flex-1 bg-white/80 border border-indigo-100 rounded-2xl py-4 px-6 shadow-md text-lg leading-relaxed font-medium max-w-md mx-auto">
        <span className="text-primary font-bold">No sign-up, no ads</span> – calculation runs entirely in your browser.<br />Private, secure, and 100% free.
      </div>
      <div className="flex-1 bg-white/80 border border-pink-100 rounded-2xl py-4 px-6 shadow-md text-lg leading-relaxed font-medium max-w-md mx-auto">
        Perfect for <span className="bg-yellow-100 rounded px-1 font-semibold">running, cycling, swimming</span>. Step test ready. Metric & Imperial units.
      </div>
    </div>
    <p className="text-md md:text-lg text-gray-600 mb-3 mt-8 px-2 md:px-12 max-w-3xl mx-auto">
      <span className="bg-indigo-50 px-2 py-1 rounded">Lactate testing is the gold standard for creating evidence-based training plans and maximizing endurance performance.</span> This tool visualizes your curve, finds all key thresholds, and generates scientifically accurate training zones for every athlete.
    </p>
    <p className="text-sm md:text-base text-gray-500 max-w-2xl mx-auto italic">
      Used by professional coaches and recreational athletes worldwide.
    </p>
  </div>
</div>

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
                                <h2 className="text-lg font-semibold text-blue-900 mb-2">
                                    🧪 Try Without Login
                                </h2>
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
                                <h2 className="text-lg font-semibold text-purple-900 mb-2">
                                    📝 How to Use
                                </h2>
                                <p className="text-purple-800">
                                    Fill in the test form below with your lactate test data. The curve and calculations will update automatically.
                                </p>
                            </motion.div>
                        </motion.div>


                        {/* Main Content Area */}
                        <div className="space-y-8 mt-8 px-0 overflow-x-hidden w-full overflow-y-hidden">
                            {/* Top Controls - Fill Demo Data and Help */}
                            <div className="flex flex-row sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                                <motion.div 
                                    className="relative z-[12000]"
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <button
                                        onClick={toggleDemoDropdown}
                                        className="sm:px-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors flex items-center justify-between"
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
                                </motion.div>
                                
                                <div className="flex items-center gap-3">
                                    <motion.button
                                        onClick={handleResetForm}
                                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        Reset Form
                                    </motion.button>
                                    
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
                            <div className="flex flex-col lg:flex-row gap-6 items-start overflow-x-hidden w-full">
                                {/* Lactate Curve Section - Left (Wider) */}
                                <motion.div 
                                    ref={curveRef}
                                    initial="hidden"
                                    animate={(isCurveInView || hasValidData) ? "visible" : "hidden"}
                                    variants={fadeInUpVariants}
                                    className="flex-1 lg:flex-none lg:w-2/3 max-w-full overflow-x-hidden"
                                    whileHover={{ boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)" }}
                                >
                                    <div className="w-full">
                                            <LactateCurve 
                                                mockData={prepareCalculatorData()} 
                                                demoMode={true} 
                                            />
                                    </div>
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
                </motion.main>

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
                                className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto"
                            >
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-2xl font-bold text-gray-900">Send Test Results to Email</h3>
                                    <button 
                                        className="text-gray-500 hover:text-gray-700 transition-colors" 
                                        onClick={() => !isSendingEmail && setShowEmailModal(false)}
                                        disabled={isSendingEmail}
                                    >
                                        <CloseIcon size={24} />
                                    </button>
                                </div>
                                
                                <p className="text-gray-600 mb-6">
                                    Create a free account and we'll send your test results to your email. You'll also be able to save and track your tests over time.
                                </p>

                                {/* Google Sign Up Button */}
                                <div className="mb-6">
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

                                <div className="relative mb-6">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-gray-300"></div>
                                    </div>
                                    <div className="relative flex justify-center text-sm">
                                        <span className="px-2 bg-white text-gray-500">Or continue with email</span>
                                    </div>
                                </div>

                                <form onSubmit={handleEmailFormSubmit} className="space-y-4">
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

                                    <div className="flex gap-3 pt-4">
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