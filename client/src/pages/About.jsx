import React from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';

const primary = 'bg-primary';
const primaryText = 'text-primary';

const About = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>LaChart – Lactate Curve Calculator & Testing App</title>
        <meta name="description" content="LaChart is a modern web app for athletes and coaches. Calculate your lactate curve, analyze lactate threshold, and discover your training zones (LT1, LT2, OBLA, IAT) with our advanced lactate testing calculator." />
        <meta name="keywords" content="Lactate Curve Calculator, lactate testing, lactate threshold, LT1, LT2, OBLA, IAT, endurance, training zones, sports analytics, performance analysis, LaChart" />
      </Helmet>
      {/* Navbar */}
      <nav className="w-full bg-white shadow-sm py-4 px-6 flex items-center justify-between z-20 relative">
        <div className="flex items-center gap-2">
          <a href="/" className="flex items-center gap-2">
            <img src="/images/LaChart.png" alt="LaChart Logo" className="h-9 w-11" />
            <span className="text-2xl font-bold text-primary tracking-tight">LaChart</span>
          </a>
        </div>
        <div className="flex items-center gap-4">
          <a href="/login" className="text-primary font-semibold hover:underline">Login</a>
          <a href="/signup" className="text-primary font-semibold hover:underline">Register</a>
        </div>
      </nav>
      {/* Demo Info Paragraph */}
      <div className="w-full bg-secondary text-white text-center py-3 px-4 flex flex-col sm:flex-row items-center justify-center gap-2">
        <span className="font-semibold">Test your demo app with calculating Lactate thresholds from a lactate testing.</span>
        <a href="/testing-without-login" className="inline-block mt-2 sm:mt-0 sm:ml-4 px-5 py-2 rounded bg-white text-secondary font-bold shadow hover:bg-secondary-dark hover:text-white transition">Try Demo</a>
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
              <a href="/login" className="inline-block border border-white text-white font-bold px-8 py-3 rounded-lg shadow hover:bg-white hover:text-primary transition">Sign In</a>
              <a href="/testing-without-login" className="inline-block bg-secondary text-white font-bold px-8 py-3 rounded-lg shadow hover:bg-secondary-dark transition border border-white">Lactate Form</a>
            </motion.div>
          </div>
          <div className="flex-1 mt-10 lg:mt-0 flex justify-center z-10">
            <img src="/images/lachart1.png" alt="LaChart App Screenshot - Lactate Curve Calculator" className="w-[32rem] max-w-full rounded-2xl object-contain" />
          </div>
        </div>
        {/* Decorative background wave */}
        <div className="absolute bottom-0 left-0 w-full h-24 bg-white rounded-t-[100px] z-0" style={{boxShadow: '0 -10px 40px 0 rgba(124,58,237,0.1)'}}></div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className={`text-base ${primaryText} font-semibold tracking-wide uppercase text-center`}>Key Features</h2>
          <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl text-center mb-12">
            Everything you need for performance analysis
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
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
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-gray-50 rounded-2xl shadow p-6 flex flex-col items-center text-center hover:shadow-lg transition"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-500 text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots Section */}
      <section className="py-16 bg-gray-50">
        <h2 className="text-3xl font-bold text-center mb-8">See LaChart in Action</h2>
        <div className="flex flex-wrap justify-center gap-8 px-4">
          <img src="/images/lachart5.png" alt="Dashboard" className="w-[42rem] rounded-xl shadow object-contain" />
          <img src="/images/lachart4.png" alt="Performance Analysis" className="w-72 rounded-xl shadow object-contain" />
          <img src="/images/lachart6.png" alt="Training Log" className="w-[42rem] rounded-xl shadow object-contain" />
        </div>
      </section>

      {/* Target Audience Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className={`text-base ${primaryText} font-semibold tracking-wide uppercase text-center`}>Who is LaChart for?</h2>
          <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl text-center mb-12">
            Perfect for every level
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
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
            ].map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-gray-50 p-6 rounded-2xl text-center shadow hover:shadow-lg transition"
              >
                <div className="text-4xl mb-4">{item.icon}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm">{item.description}</p>
              </motion.div>
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
              <img src="/images/lachart3.png" alt="Training Interface" className="w-72  object-contain" />
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
            <img src="/images/lachart-test.png" alt="Lactate Test Demo Screenshot" className="max-w-xl w-full rounded-xl shadow object-contain border border-gray-100" />
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="py-16 bg-gray-50 border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-primary mb-6 text-center">Contact Us</h2>
          <ContactForm />
        </div>
      </section>

      {/* CTA Section */}
      <section className={`${primary} py-12`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center justify-between">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl mb-8 lg:mb-0">
            <span className="block">Ready to get started?</span>
            <span className="block text-[#C4B5FD]">Create your account today.</span>
          </h2>
          <div className="flex gap-4">
            <a
              href="/signup"
              className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-bold rounded-md text-primary bg-white hover:bg-gray-100 shadow"
            >
              Get started
            </a>
            <a
              href="/login"
              className="inline-flex items-center justify-center px-8 py-3 border border-white text-base font-bold rounded-md text-white bg-transparent hover:bg-white hover:text-primary shadow"
            >
              Sign in
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;

function ContactForm() {
  const [form, setForm] = React.useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = React.useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Use mailto for now
    const mailto = `mailto:jakub.stadnik01@gmail.com?subject=LaChart%20Contact%20from%20${encodeURIComponent(form.name)}&body=${encodeURIComponent(form.message + '\n\nFrom: ' + form.name + ' (' + form.email + ')')}`;
    window.location.href = mailto;
    setSubmitted(true);
  };

  if (submitted) {
    return <div className="bg-greenos text-white p-4 rounded text-center font-semibold">Thank you for your message! We will get back to you soon.</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-xl shadow">
      <div>
        <label className="block text-sm font-medium text-gray-700">Name</label>
        <input
          type="text"
          name="name"
          value={form.name}
          onChange={handleChange}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Email</label>
        <input
          type="email"
          name="email"
          value={form.email}
          onChange={handleChange}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Message</label>
        <textarea
          name="message"
          value={form.message}
          onChange={handleChange}
          required
          rows={4}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary"
        />
      </div>
      <button
        type="submit"
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
      >
        Send Message
      </button>
    </form>
  );
} 