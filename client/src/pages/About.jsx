import React, { lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
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
        <title>LaChart – Lactate Curve Calculator & Testing App</title>
        <meta name="description" content="LaChart is a modern web app for athletes and coaches. Calculate your lactate curve, analyze lactate threshold, and discover your training zones (LT1, LT2, OBLA, IAT) with our advanced lactate testing calculator." />
        <meta name="keywords" content="Lactate Curve Calculator, lactate testing, lactate threshold, LT1, LT2, OBLA, IAT, endurance, training zones, sports analytics, performance analysis, LaChart" />
        <meta property="og:title" content="LaChart – Lactate Curve Calculator & Testing App" />
        <meta property="og:description" content="Calculate your lactate curve, analyze lactate threshold, and discover your training zones with our advanced lactate testing calculator." />
        <meta property="og:image" content="/images/lachart1.png" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
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
          <a href="/testing-without-login" 
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
              Lactate Curve Calculator & Testing – LaChart
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-xl mb-8 max-w-xl mx-auto lg:mx-0"
            >
              LaChart is a modern web application for athletes and coaches. Calculate your lactate curve, analyze your lactate threshold (LT1, LT2, OBLA, IAT), and discover your optimal training zones with advanced lactate testing tools.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <a href="/signup" className="inline-block bg-white text-primary font-bold px-8 py-3 rounded-lg shadow hover:bg-gray-100 transition">Get Started</a>
              <a href="/login" className="inline-block bg-white text-primary font-bold px-8 py-3 rounded-lg shadow hover:bg-gray-100 transition">Sign In</a>
              <a href="/testing-without-login" className="inline-block bg-secondary text-white font-bold px-8 py-3 rounded-lg shadow hover:bg-secondary-dark transition border border-white">Lactate Form</a>
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
            Everything you need for performance analysis
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <FeatureCard key={feature.title} {...feature} index={index} />
            ))}
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
            Why choose LaChart?
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow flex flex-col justify-center">
              <ul className="space-y-4 text-lg">
                <li className="flex items-start"><span className="text-primary mr-2">✓</span>Based on real sports principles</li>
                <li className="flex items-start"><span className="text-primary mr-2">✓</span>Focused on training efficiency through lactate zones</li>
                <li className="flex items-start"><span className="text-primary mr-2">✓</span>Quick and intuitive training logging</li>
                <li className="flex items-start"><span className="text-primary mr-2">✓</span>Advanced analysis without Excel</li>
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
            <a href="/testing-without-login" className="inline-block mt-2 px-6 py-3 rounded bg-primary text-white font-bold shadow hover:bg-primary-dark transition">Try the Demo Now</a>
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
                className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-lg font-bold rounded-lg text-primary bg-white hover:bg-gray-100 transform hover:-translate-y-0.5 transition-all shadow-lg hover:shadow-xl"
              >
                Get started
              </a>
              <a
                href="/login"
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
                  <a href="/testing-without-login" className="text-base text-gray-600 hover:text-primary">
                    Try Demo
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

      {/* Add these styles to your CSS */}
      <style jsx global>{`
        .swiper-slide {
          transition: all 0.3s ease;
        }
        .swiper-slide-active {
          z-index: 1;
        }
        .swiper-button-next,
        .swiper-button-prev {
          color: #767EB5 !important;
        }
        .swiper-pagination-bullet-active {
          background: #767EB5 !important;
        }
        .custom-bullet-active {
          background: #767EB5 !important;
        }
      `}</style>
    </div>
  );
};

export default About; 