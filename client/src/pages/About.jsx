import React, { lazy, Suspense, useEffect, useState } from 'react';
import { trackEvent } from '../utils/analytics';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, EffectCoverflow } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'swiper/css/effect-coverflow';
import ContactUs from '../components/ContactUs';

// Lazy load the ContactForm component
const ContactForm = lazy(() => import('../components/ContactForm'));

// FAQ Accordion Item Component
const FAQItem = ({ icon, question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);

  const iconPaths = {
    question: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    check: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    flag: "M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9",
    chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
  };

  return (
    <motion.div 
      className="group bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
      initial={false}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 sm:p-5 md:p-6 flex items-center justify-between gap-3 sm:gap-4 text-left focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-2xl"
      >
        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
          <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center transition-colors ${isOpen ? 'from-primary/20 to-primary/10' : ''}`}>
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPaths[icon]} />
            </svg>
          </div>
          <h3 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 leading-tight flex-1 min-w-0">
            {question}
          </h3>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="flex-shrink-0 ml-2"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 sm:px-5 md:px-6 pb-4 sm:pb-5 md:pb-6 pt-0">
              <div className="pl-11 sm:pl-14 md:pl-16">
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                  {answer}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Image loading component
const LazyImage = ({ src, alt, className }) => {
  const [isLoading, setIsLoading] = React.useState(true);

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-gray-100 animate-pulse rounded-xl" />
      )}
      <img
        src={src}
        alt={alt}
        className={`${className} transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        loading="lazy"
      />
    </div>
  );
};

// Feature card component
const FeatureCard = ({ title, description, icon, index }) => (
  <motion.div
    key={title}
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay: index * 0.1 }}
    className="bg-gray-50 rounded-2xl shadow p-6 flex flex-col items-center text-center hover:shadow-lg transition group"
  >
    <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">{icon}</div>
    <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
    <p className="text-gray-500 text-sm">{description}</p>
  </motion.div>
);

// Audience card component
const AudienceCard = ({ title, description, icon, index }) => (
  <motion.div
    key={title}
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay: index * 0.1 }}
    className="bg-gray-50 p-6 rounded-2xl text-center shadow hover:shadow-lg transition group"
  >
    <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">{icon}</div>
    <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
    <p className="text-gray-500 text-sm">{description}</p>
  </motion.div>
);

const primary = 'bg-primary';
const primaryText = 'text-primary';

const About = () => {
  // Cookie consent state
  const [showCookieBar, setShowCookieBar] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('cookiesAccepted')) {
      setTimeout(() => setShowCookieBar(true), 1500);
    }
  }, []);
  const handleAcceptCookies = () => {
    localStorage.setItem('cookiesAccepted', '1');
    setShowCookieBar(false);
  };

  const features = [
    {
      title: 'Lactate Curve Analysis',
      description: 'Automatic lactate curve plotting from test data. Support for multiple calculation methods: OBLA (2.0-3.5 mmol), LTP1, LTP2, IAT, Log-log, and more. Display power (W), heart rate (HR), lactate (La), and baseline lactate values.',
      icon: '📊'
    },
    {
      title: 'Coach Mode',
      description: 'Manage your athletes, view their training sessions and performance development. Direct access to individual athlete lactate tests. Training diary with overview of completed sessions, performance, heart rate, lactate, and weather.',
      icon: '👨‍🏫'
    },
    {
      title: 'Testing & Measurement',
      description: 'Store test results by date. Detailed table for each test with methods and values. Export results to various formats (e.g., PDF).',
      icon: '🧪'
    },
    {
      title: 'Training Planning',
      description: 'Easy training session addition (swimming, cycling, running). Record: power, heart rate, lactate, RPE, duration. Plan intervals and repetitions. List of recent training sessions with performance trends.',
      icon: '🏋️‍♂️'
    }
  ];

  const audiences = [
    {
      title: 'Coaches',
      description: 'Track your athletes\' development with precision',
      icon: '👨‍🏫'
    },
    {
      title: 'Athletes',
      description: 'Train smart based on measurable data',
      icon: '🏃‍♂️'
    },
    {
      title: 'Teams',
      description: 'Unified system for testing and planning',
      icon: '👥'
    },
    {
      title: 'Elite Athletes',
      description: 'Gain competitive advantage through data',
      icon: '🏆'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>Lactate Curve Analyzer & Lactate Threshold Calculator | LaChart - Free Online Tool</title>
        <link rel="canonical" href="https://lachart.net/about" />
        <meta name="description" content="Professional lactate curve analyzer and lactate threshold calculator for athletes and coaches. Calculate LT1, LT2, OBLA, IAT with advanced algorithms. Free online lactate testing tool with training zone analysis." />
        <meta name="keywords" content="lactate curve analyzer, lactate threshold calculator, lactate measurement, OBLA calculation, LT1 LT2 calculator, IAT threshold, endurance training zones, lactate testing app, sports analytics, performance analysis, cycling lactate test, running lactate test, lactate threshold training, anaerobic threshold, aerobic threshold, lactate zones, training zones calculator, sports science, endurance performance, lactate testing protocol, threshold training, cycling performance, running performance, triathlon training, lactate curve analysis, lactate testing software, free lactate calculator, online lactate analysis, lactate threshold determination, training zone calculator, endurance sports, performance testing, lactate testing methods, lactate threshold training zones, cycling power zones, running pace zones, lactate testing equipment, lactate threshold test, lactate curve interpretation, lactate testing results, lactate threshold improvement, lactate testing for athletes, lactate testing for coaches, lactate testing protocol cycling, lactate testing protocol running, lactate threshold training plan, lactate testing data analysis, lactate curve fitting, lactate threshold calculation methods, lactate testing accuracy, lactate testing reliability, lactate testing validity, lactate testing standardization, lactate testing best practices, lactate testing guidelines, lactate testing recommendations, lactate testing tips, lactate testing advice, lactate testing help, lactate testing support, lactate testing tutorial, lactate testing guide, lactate testing manual, lactate testing handbook, lactate testing book, lactate testing research, lactate testing studies, lactate testing science, lactate testing methodology, lactate testing techniques, lactate testing procedures, lactate testing protocols, lactate testing standards, lactate testing quality, lactate testing precision, lactate testing consistency, lactate testing reproducibility, lactate testing repeatability, lactate testing validity, lactate testing reliability, lactate testing accuracy, lactate testing sensitivity, lactate testing specificity, lactate testing predictive value, lactate testing diagnostic accuracy, lactate testing clinical utility, lactate testing practical application, lactate testing real world, lactate testing field testing, lactate testing laboratory testing, lactate testing portable testing, lactate testing mobile testing, lactate testing remote testing, lactate testing telemedicine, lactate testing digital health, lactate testing health technology, lactate testing fitness technology, lactate testing sports technology, lactate testing performance technology, lactate testing training technology, lactate testing coaching technology, lactate testing athlete technology, lactate testing coach technology, lactate testing team technology, lactate testing club technology, lactate testing organization technology, lactate testing institution technology, lactate testing university technology, lactate testing college technology, lactate testing school technology, lactate testing academy technology, lactate testing center technology, lactate testing facility technology, lactate testing laboratory technology, lactate testing clinic technology, lactate testing hospital technology, lactate testing medical technology, lactate testing healthcare technology, lactate testing wellness technology, lactate testing lifestyle technology, lactate testing fitness technology, lactate testing health technology, lactate testing sports technology, lactate testing performance technology, lactate testing training technology, lactate testing coaching technology, lactate testing athlete technology, lactate testing coach technology, lactate testing team technology, lactate testing club technology, lactate testing organization technology, lactate testing institution technology, lactate testing university technology, lactate testing college technology, lactate testing school technology, lactate testing academy technology, lactate testing center technology, lactate testing facility technology, lactate testing laboratory technology, lactate testing clinic technology, lactate testing hospital technology, lactate testing medical technology, lactate testing healthcare technology, lactate testing wellness technology, lactate testing lifestyle technology" />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
        <meta name="author" content="LaChart Team" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#7c3aed" />
        <meta property="og:title" content="Lactate Curve Analyzer & Lactate Threshold Calculator | LaChart - Free Online Tool" />
        <meta property="og:description" content="Professional lactate curve analyzer and lactate threshold calculator for athletes and coaches. Calculate LT1, LT2, OBLA, IAT with advanced algorithms. Free online lactate testing tool." />
        <meta property="og:image" content="https://lachart.net/images/lachart1.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://lachart.net/about" />
        <meta property="og:site_name" content="LaChart" />
        <meta property="og:locale" content="en_US" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Lactate Curve Analyzer & Lactate Threshold Calculator | LaChart" />
        <meta name="twitter:description" content="Professional lactate curve analyzer and lactate threshold calculator for athletes and coaches. Calculate LT1, LT2, OBLA, IAT with advanced algorithms." />
        <meta name="twitter:image" content="https://lachart.net/images/lachart1.png" />
        <meta name="twitter:site" content="@lachart" />
        <meta name="twitter:creator" content="@lachart" />
        <link rel="alternate" hrefLang="en" href="https://lachart.net/about" />
        <link rel="alternate" hrefLang="x-default" href="https://lachart.net/about" />
        <script type="application/ld+json">
          {`
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "LaChart - Lactate Curve Analyzer",
              "url": "https://lachart.net/about",
              "description": "Professional lactate curve analyzer and lactate threshold calculator for athletes and coaches. Calculate LT1, LT2, OBLA, IAT with advanced algorithms.",
              "applicationCategory": "SportsApplication",
              "operatingSystem": "Web Browser",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "publisher": {
                "@type": "Organization",
                "name": "LaChart",
                "url": "https://lachart.net",
                "logo": {
                  "@type": "ImageObject",
                  "url": "https://lachart.net/images/LaChart.png"
                }
              },
              "featureList": [
                "Lactate Curve Analysis",
                "LT1 and LT2 Calculation", 
                "OBLA Determination",
                "IAT Threshold Analysis",
                "Training Zone Calculation",
                "Coach Mode",
                "Athlete Management",
                "Performance Tracking",
                "Data Export",
                "Free Online Calculator"
              ],
              "screenshot": "https://lachart.net/images/lachart1.png",
              "softwareVersion": "2.0",
              "datePublished": "2024-01-01",
              "dateModified": "2025-01-23",
              "inLanguage": "en",
              "isAccessibleForFree": true,
              "browserRequirements": "Requires JavaScript. Requires HTML5.",
              "softwareHelp": "https://lachart.net/lactate-guide",
              "author": {
                "@type": "Organization",
                "name": "LaChart Team"
              }
            }
          `}
        </script>
      </Helmet>
      {/* Navbar with hover effects */}
      <nav className="w-full bg-white shadow-sm py-4 px-6 flex items-center justify-between z-20 relative">
        <div className="flex items-center gap-2">
          <a href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <img src="/images/LaChart.png" alt="LaChart Logo" className="h-9 w-11" />
            <span className="text-2xl font-bold text-primary tracking-tight">LaChart</span>
          </a>
        </div>
        <div className="flex items-center gap-6">
          <a href="/login" className="text-primary font-semibold hover:text-primary-dark transition-colors">Login</a>
          <a href="/signup" className="px-4 py-2 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors">Register</a>
        </div>
      </nav>
      {/* Demo Info with improved styling */}
      <div className="w-full bg-secondary text-white py-3 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-4">
          <span className="font-semibold text-center sm:text-left">Test your demo app with calculating Lactate thresholds from a lactate testing.</span>
          <a href="/lactate-curve-calculator" 
             className="inline-block px-6 py-2 rounded-lg bg-white text-secondary font-bold shadow-lg hover:shadow-xl hover:bg-gray-50 transform hover:-translate-y-0.5 transition-all">
            Try Demo
          </a>
        </div>
      </div>
      {/* Hero Section */}
      <section className={`${primary} text-white py-16 relative overflow-hidden`}>
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center px-4 sm:px-6 lg:px-8">
          <div className="flex-1 text-center lg:text-left z-10">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-5xl font-extrabold mb-4 drop-shadow-lg"
            >
              Free Lactate Curve Calculator & Lactate Threshold Testing Tool – LaChart
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-xl mb-8 max-w-xl mx-auto lg:mx-0"
            >
              Professional lactate curve analyzer and lactate threshold calculator for athletes and coaches. Calculate LT1, LT2, OBLA, IAT with advanced algorithms. Free online lactate testing tool with training zone analysis for cycling, running, and triathlon.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex flex-wrap gap-3 justify-center lg:justify-start"
            >
              <a href="/signup" onClick={() => trackEvent('cta_click', { label: 'about_get_started' })} className="inline-flex items-center bg-white text-primary font-bold px-6 py-2 rounded-lg shadow hover:bg-gray-100 transition whitespace-nowrap">Get Started</a>
              <a href="/login" onClick={() => trackEvent('cta_click', { label: 'about_sign_in' })} className="inline-flex items-center bg-white text-primary font-bold px-6 py-2 rounded-lg shadow hover:bg-gray-100 transition whitespace-nowrap">Sign In</a>
              <a href="/lactate-curve-calculator" onClick={() => trackEvent('cta_click', { label: 'about_lactate_form' })} className="inline-flex items-center bg-secondary text-white font-bold px-6 py-2 rounded-lg shadow hover:bg-secondary-dark transition border border-white whitespace-nowrap">Lactate Form</a>
              <a href="/lactate-guide" onClick={() => trackEvent('cta_click', { label: 'about_lactate_guide' })} className="inline-flex items-center bg-white text-primary font-bold px-6 py-2 rounded-lg shadow hover:bg-gray-100 transition border border-white whitespace-nowrap">Lactate Guide</a>
            </motion.div>
          </div>
          <div className="flex-1 mt-10 lg:mt-0 flex justify-center z-10">
            <LazyImage 
              src="/images/lachart1.png" 
              alt="LaChart App Screenshot - Lactate Curve Calculator" 
              className="w-[32rem] max-w-full rounded-2xl object-contain" 
            />
          </div>
        </div>
        {/* Decorative background wave */}
        <div className="absolute bottom-0 left-0 w-full h-24 bg-white rounded-t-[100px] z-0" style={{boxShadow: '0 -10px 40px 0 rgba(124,58,237,0.1)'}}></div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-base text-primary font-semibold tracking-wide uppercase text-center">Key Features</h2>
          <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl text-center mb-12">
            Professional Lactate Testing & Performance Analysis Tools
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <FeatureCard key={feature.title} {...feature} index={index} />
            ))}
          </div>
        </div>
      </section>

      {/* Lactate Guide Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-base text-primary font-semibold tracking-wide uppercase">Learn About Lactate</h2>
              <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                Master Lactate Threshold Training
              </p>
              <p className="mt-4 text-lg text-gray-600">
                Discover the science behind lactate, understand what lactate threshold means, and learn how to improve your performance through proper training methods. Our comprehensive guide covers everything from basic concepts to advanced training protocols.
              </p>
              <div className="mt-6 space-y-4">
                <div className="flex items-start">
                  <span className="text-primary mr-3">📚</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">Complete Theory</h3>
                    <p className="text-gray-600 text-sm">Learn what lactate is, how it affects your body, and why the threshold matters for endurance performance.</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <span className="text-primary mr-3">🧪</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">Testing Protocols</h3>
                    <p className="text-gray-600 text-sm">Understand different methods to measure lactate threshold, from lab tests to field estimations.</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <span className="text-primary mr-3">🏃‍♂️</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">Training Strategies</h3>
                    <p className="text-gray-600 text-sm">Discover proven methods to increase your lactate threshold and improve endurance performance.</p>
                  </div>
                </div>
              </div>
              <div className="mt-8">
                <a 
                  href="/lactate-guide" 
                  onClick={() => trackEvent('cta_click', { label: 'about_guide_section' })}
                  className="inline-block bg-primary text-white font-bold px-8 py-3 rounded-lg shadow hover:bg-primary-dark transition"
                >
                  Read the Complete Guide
                </a>
              </div>
            </div>
            <div className="flex justify-center">
              <LazyImage 
                src="/images/lactate-analysis.jpg" 
                alt="Lactate Analysis and Testing" 
                className="w-full max-w-lg rounded-2xl shadow-lg object-cover" 
              />
            </div>
          </div>
        </div>
      </section>

      {/* Screenshots Section */}
      <section className="py-16 bg-gray-50">
        <h2 className="text-3xl font-bold text-center mb-12">See LaChart in Action</h2>
        <div className="max-w-7xl mx-auto">
          <Swiper
            effect={'coverflow'}
            grabCursor={true}
            centeredSlides={true}
            initialSlide={2}
            slidesPerView={'auto'}
            coverflowEffect={{
              rotate: 0,
              stretch: 0,
              depth: 100,
              modifier: 2.5,
              slideShadows: false,
            }}
            pagination={{ 
              clickable: true,
              bulletActiveClass: 'swiper-pagination-bullet-active custom-bullet-active'
            }}
            navigation={true}
            modules={[EffectCoverflow, Pagination, Navigation]}
            className="mySwiper !pb-12"
          >
            {[
              { src: '/images/lachart5.png', alt: 'Dashboard', title: 'Interactive Dashboard' },
              { src: '/images/lachart4.png', alt: 'Performance Analysis', title: 'Performance Analysis' },
              { src: '/images/lachart6.png', alt: 'Training Log', title: 'Training Log' },
              { src: '/images/lachart1.png', alt: 'Lactate Curve', title: 'Lactate Curve Analysis' },
              { src: '/images/lachart3.png', alt: 'Training Interface', title: 'Training Interface' }
            ].map((image) => (
              <SwiperSlide key={image.alt} className="!w-[300px] sm:!w-[450px] md:!w-[600px]">
                {({ isActive }) => (
                  <div className={`
                    relative transition-all duration-300 
                    ${isActive ? 'scale-100' : 'scale-90 opacity-70'}
                  `}>
                    <div className="bg-white rounded-xl shadow-lg p-4 relative">
                      <div className="absolute top-3 left-3 bg-gray-100 text-xs px-2 py-1 rounded-full">
                        {image.title}
                      </div>
                      <LazyImage 
                        src={image.src}
                        alt={image.alt}
                        className="w-full h-[200px] sm:h-[300px] md:h-[400px] rounded-lg object-contain" 
                      />
                    </div>
                  </div>
                )}
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </section>

      {/* Target Audience Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-base text-primary font-semibold tracking-wide uppercase text-center">Who is LaChart for?</h2>
          <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl text-center mb-12">
            Perfect for every level
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {audiences.map((audience, index) => (
              <AudienceCard key={audience.title} {...audience} index={index} />
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className={`text-base ${primaryText} font-semibold tracking-wide uppercase text-center`}>Benefits</h2>
          <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl text-center mb-12">
            Why choose LaChart for your lactate testing and performance analysis?
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow flex flex-col justify-center">
              <ul className="space-y-4 text-lg">
                <li className="flex items-start"><span className="text-primary mr-2">✓</span>Based on real sports science principles and research</li>
                <li className="flex items-start"><span className="text-primary mr-2">✓</span>Focused on training efficiency through precise lactate zones</li>
                <li className="flex items-start"><span className="text-primary mr-2">✓</span>Quick and intuitive lactate testing and training logging</li>
                <li className="flex items-start"><span className="text-primary mr-2">✓</span>Advanced lactate curve analysis without Excel</li>
                <li className="flex items-start"><span className="text-primary mr-2">✓</span>Professional-grade lactate threshold calculation methods</li>
                <li className="flex items-start"><span className="text-primary mr-2">✓</span>Free online lactate calculator with no registration required</li>
                <li className="flex items-start"><span className="text-primary mr-2">✓</span>Compatible with cycling, running, and triathlon training</li>
                <li className="flex items-start"><span className="text-primary mr-2">✓</span>Export results to PDF for professional reporting</li>
              </ul>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow flex items-center justify-center">
              <LazyImage 
                src="/images/lachart3.png" 
                alt="Training Interface" 
                className="w-72 object-contain" 
              />
            </div>
          </div>
        </div>
      </section>

      {/* How to Use LaChart Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className={`text-base ${primaryText} font-semibold tracking-wide uppercase text-center`}>How to Use LaChart</h2>
          <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl text-center mb-12">
            Real-World Applications
          </p>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Lactate Testing Card */}
            <div className="bg-gray-50 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="text-3xl mb-4">🧪</div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Lactate Testing</h3>
              <p className="text-gray-600">
                During lactate tests, record each step's data including intervals and measurements. LaChart automatically generates your lactate curve and identifies key points like LT1, LT2, and other thresholds. Compare with historical tests to track your performance improvements over time.
              </p>
            </div>

            {/* Coach Management Card */}
            <div className="bg-gray-50 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="text-3xl mb-4">👥</div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Coach Management</h3>
              <p className="text-gray-600">
                Coaches and testers can organize athletes into groups, assign and conduct tests, and evaluate results. The platform provides a comprehensive overview of each athlete's progress and development over time.
              </p>
            </div>

            {/* Training Progress Card */}
            <div className="bg-gray-50 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="text-3xl mb-4">📈</div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Training Progress</h3>
              <p className="text-gray-600">
                For recurring training sessions, like "10x1km LT2 runs", track changes in lactate levels and pace across multiple sessions. Monitor your progress and see how your performance metrics improve over time.
              </p>
            </div>
          </div>

          {/* Example Workflow */}
          <div className="mt-12 bg-gray-50 p-8 rounded-2xl shadow-lg">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Example Workflow</h3>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold">1</div>
                <div>
                  <h4 className="font-semibold text-gray-900">Record Test Data</h4>
                  <p className="text-gray-600">Enter your step-by-step test data including power output, heart rate, and lactate measurements.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold">2</div>
                <div>
                  <h4 className="font-semibold text-gray-900">Analyze Results</h4>
                  <p className="text-gray-600">LaChart automatically generates your lactate curve and calculates key training zones (LT1, LT2, OBLA, IAT).</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold">3</div>
                <div>
                  <h4 className="font-semibold text-gray-900">Track Progress</h4>
                  <p className="text-gray-600">Compare current results with historical data to visualize your performance improvements.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Description Section at the end */}
      <section className="py-16 bg-white border-t border-gray-100 mt-12">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center gap-10">
          <div className="flex-1 order-2 md:order-1">
            <h2 className="text-2xl font-bold text-primary mb-4">Try the Lactate Test Demo</h2>
            <p className="text-lg text-gray-700 mb-4">
              You can try out our demo by filling in your own test data in the lactate test form. After submitting, the app will generate a lactate curve from your data and automatically calculate important training zones such as <strong>LT1</strong>, <strong>LT2</strong>, and others (OBLA, IAT, log-log, etc.).
            </p>
            <p className="text-gray-600 mb-4">
              This is a great way to see how LaChart analyzes your performance and helps you understand your endurance profile. No login is required and your data will not be saved. Just experiment and see your results instantly!
            </p>
            <a href="/lactate-curve-calculator" className="inline-block mt-2 px-6 py-3 rounded bg-primary text-white font-bold shadow hover:bg-primary-dark transition">Try the Demo Now</a>
          </div>
          <div className="flex-1 flex justify-center order-1 md:order-2 mb-8 md:mb-0">
            <LazyImage 
              src="/images/lachart-test.png" 
              alt="Lactate Test Demo Screenshot" 
              className="max-w-xl w-full rounded-xl shadow object-contain border border-gray-100" 
            />
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-12 sm:py-16 md:py-20 bg-gradient-to-br from-gray-50 via-white to-blue-50/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900 mb-3 sm:mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-sm sm:text-base text-gray-600 max-w-2xl mx-auto">
              Everything you need to know about lactate threshold testing and LaChart
            </p>
          </div>
          <div className="space-y-3 sm:space-y-4">
            <FAQItem 
              icon="question"
              question="What is lactate threshold and why is it important?"
              answer="Lactate threshold is the exercise intensity at which lactate begins to accumulate in the blood. It's crucial for endurance athletes because it determines your optimal training zones and racing strategy. Our free lactate calculator helps you find your LT1 and LT2 thresholds accurately."
            />
            <FAQItem 
              icon="check"
              question="How accurate is the free lactate threshold calculator?"
              answer="LaChart uses multiple professional methods (OBLA, Dmax, IAT, log-log) to calculate your lactate threshold with high accuracy. Our algorithms are based on sports science research and provide reliable results for cycling, running, and triathlon training."
            />
            <FAQItem 
              icon="user"
              question="Do I need to register to use the lactate calculator?"
              answer="No registration is required for basic lactate threshold calculations. You can use our free online calculator immediately. However, creating a free account allows you to save results, track progress over time, and access advanced features."
            />
            <FAQItem 
              icon="flag"
              question="What sports is LaChart suitable for?"
              answer="LaChart is designed for all endurance sports including cycling, running, triathlon, swimming, and rowing. Our lactate testing protocols and training zone calculations work for any sport that involves sustained aerobic effort."
            />
            <FAQItem 
              icon="chart"
              question="How does LaChart compare to expensive lab testing?"
              answer="While lab testing provides the most precise results, LaChart offers professional-grade analysis at a fraction of the cost. Our algorithms use the same calculation methods as expensive sports science software, making advanced lactate analysis accessible to all athletes."
            />
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="py-16 bg-gray-50 border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-2xl font-bold text-primary mb-6 text-center">Contact us</h2>
            <ContactUs />
          </motion.div>
        </div>
      </section>

      {/* CTA Section with improved styling */}
      <motion.section 
        className="bg-primary py-16"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="text-center lg:text-left">
              <motion.h2 
                className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                Ready to get started?
              </motion.h2>
              <motion.p 
                className="mt-4 text-xl text-purple-200"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                Join LaChart today and transform your training with data-driven insights.
              </motion.p>
            </div>
            <motion.div 
              className="flex flex-col sm:flex-row gap-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
            <a
              href="/signup"
              onClick={() => trackEvent('cta_click', { label: 'footer_get_started' })}
                className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-lg font-bold rounded-lg text-primary bg-white hover:bg-gray-100 transform hover:-translate-y-0.5 transition-all shadow-lg hover:shadow-xl"
            >
              Get started
            </a>
            <a
              href="/login"
              onClick={() => trackEvent('cta_click', { label: 'footer_sign_in' })}
                className="inline-flex items-center justify-center px-8 py-3 border-2 border-white text-lg font-bold rounded-lg text-white hover:bg-white hover:text-primary transform hover:-translate-y-0.5 transition-all shadow-lg hover:shadow-xl"
            >
              Sign in
            </a>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* Footer */}
      <motion.footer 
        className="bg-white py-12 border-t"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <a href="/" className="flex items-center gap-2">
                <img src="/images/LaChart.png" alt="LaChart Logo" className="h-9 w-11" />
                <span className="text-2xl font-bold text-primary tracking-tight">LaChart</span>
              </a>
              <p className="mt-4 text-gray-600">
                Advanced lactate testing and analysis for athletes and coaches.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 tracking-wider uppercase">Quick Links</h3>
              <ul className="mt-4 space-y-4">
                <li>
                  <a href="/lactate-curve-calculator" className="text-base text-gray-600 hover:text-primary">
                    Try Demo
                  </a>
                </li>
                <li>
                  <a href="/lactate-guide" className="text-base text-gray-600 hover:text-primary">
                    Lactate Guide
                  </a>
                </li>
                <li>
                  <a href="/login" className="text-base text-gray-600 hover:text-primary">
                    Login
                  </a>
                </li>
                <li>
                  <a href="/signup" className="text-base text-gray-600 hover:text-primary">
                    Register
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 tracking-wider uppercase">Contact</h3>
              <ul className="mt-4 space-y-4">
                <li className="flex items-center">
                  <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <a href="mailto:jakub.stadnik01@gmail.com" className="ml-2 text-gray-600 hover:text-primary">
                    jakub.stadnik01@gmail.com
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-200 pt-8 text-center">
            <p className="text-base text-gray-400">
              &copy; {new Date().getFullYear()} LaChart. All rights reserved.
            </p>
          </div>
        </div>
      </motion.footer>

      {/* Cookie Consent Banner */}
      {showCookieBar && (
        <div className="fixed bottom-0 left-0 w-full z-[99999] flex items-end justify-center pointer-events-none">
          <div className="pointer-events-auto bg-white/90 border rounded-t-xl shadow px-6 py-4 mb-0 text-sm flex flex-col md:flex-row gap-3 md:gap-8 items-center fade-in-up animate-fade-in-up">
            <span>
              This website uses cookies to ensure you get the best experience.{' '}
              <a href="/privacy" target="_blank" className="underline text-primary">Learn more</a>.
            </span>
            <button
              className="ml-2 px-5 py-1 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark transition"
              onClick={handleAcceptCookies}
            >
              I Agree
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default About;