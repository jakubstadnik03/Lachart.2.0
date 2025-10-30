import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';

const Privacy = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>Privacy Policy | LaChart</title>
        <link rel="canonical" href="https://lachart.net/privacy" />
        <meta name="description" content="LaChart Privacy Policy – learn how we collect, use, and protect your data. Read about cookies, analytics, and your rights." />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content="Privacy Policy | LaChart" />
        <meta property="og:description" content="LaChart Privacy Policy – learn how we collect, use, and protect your data." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://lachart.net/privacy" />
        <meta property="og:image" content="https://lachart.net/og-lactate-curve-calculator.png" />
      </Helmet>

      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="text-gray-600 mt-1">Last updated: {new Date().toLocaleDateString()}</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="space-y-8">
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Overview</h2>
            <p className="text-gray-700">
              LaChart respects your privacy. This Privacy Policy explains what data we collect, how we use it, and your rights. By using LaChart, you agree to this Policy.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Data We Collect</h2>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Account data: name, surname, email, role (athlete/coach).</li>
              <li>Usage data: app interactions, anonymized analytics measurements.</li>
              <li>Content data: tests, training entries, lactate measurements you save.</li>
              <li>Technical data: device/browser info and cookies necessary for functionality.</li>
            </ul>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">How We Use Data</h2>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Provide and improve LaChart’s features (testing, analysis, training zones).</li>
              <li>Authentication, account management, and user support.</li>
              <li>Security monitoring and service reliability.</li>
              <li>Anonymous analytics to improve product quality and usability.</li>
            </ul>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Cookies</h2>
            <p className="text-gray-700 mb-2">
              We use essential cookies for security and functionality, and analytics cookies to understand usage. You can accept cookies via our cookie banner and manage preferences in your browser settings.
            </p>
            <p className="text-gray-700">
              By clicking “I Agree” in the cookie notice, you consent to our use of cookies as described in this Policy.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Data Sharing</h2>
            <p className="text-gray-700">
              We do not sell your personal data. We may share data with service providers who process it on our behalf (e.g., hosting, analytics) under strict confidentiality and security obligations, or when required by law.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Your Rights</h2>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Access, correction, and deletion of your personal data.</li>
              <li>Withdraw consent where applicable.</li>
              <li>Data portability (where technically feasible).</li>
            </ul>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Contact</h2>
            <p className="text-gray-700">
              For privacy questions or requests, contact us at
              {' '}<a href="mailto:jakub.stadnik01@gmail.com" className="text-primary underline">jakub.stadnik01@gmail.com</a>.
            </p>
          </motion.section>
        </div>
      </main>
    </div>
  );
};

export default Privacy;
