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
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Third-Party API Integration</h2>
            <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-4">Strava API</h3>
            <p className="text-gray-700 mb-3">
              LaChart integrates with Strava's API to provide enhanced training analysis features. By connecting your Strava account to LaChart, you authorize us to access your Strava activity data in accordance with the Strava API Agreement.
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>Data Access:</strong> We only access and display your own Strava activity data. We do not access, display, or share data from other Strava users, even if such data is publicly viewable on Strava's platform.</li>
              <li><strong>User Authorization:</strong> You must explicitly authorize LaChart to access your Strava data through Strava's OAuth authentication process. You can revoke this authorization at any time through your Strava account settings.</li>
              <li><strong>Data Usage:</strong> Your Strava data is used solely to provide training analysis, performance tracking, and related features within LaChart. We do not sell, rent, lease, or otherwise monetize your Strava data.</li>
              <li><strong>Data Sharing:</strong> We do not share your Strava data with third parties, advertisers, or data brokers. Your data is only accessible to you within the LaChart application.</li>
              <li><strong>Data Deletion:</strong> If you revoke Strava authorization or delete your LaChart account, we will delete all your Strava data from our systems within 48 hours.</li>
              <li><strong>Garmin Attribution:</strong> Some activity data obtained through the Strava API may include data sourced from Garmin. When displaying such data, we comply with Garmin's brand guidelines and attribution requirements.</li>
              <li><strong>API Limitations:</strong> Our use of the Strava API is subject to Strava's rate limits and usage restrictions. Strava may modify or discontinue API access at any time.</li>
              <li><strong>Strava Brand Guidelines:</strong> We comply with Strava's API Brand Guidelines and display appropriate Strava logos and links where we use Strava data in our application.</li>
            </ul>
            <p className="text-gray-700 mb-3">
              By using LaChart's Strava integration, you agree to comply with Strava's Terms of Service and Privacy Policy. For more information about how Strava handles your data, please review Strava's Privacy Policy.
            </p>
            <p className="text-gray-700">
              <strong>Strava API Agreement:</strong> Our use of the Strava API is governed by the Strava API Agreement (Effective Date: October 9, 2025). Key points include:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mt-2">
              <li>We use appropriate security measures to protect your Strava data</li>
              <li>We do not create applications that compete with or replicate Strava functionality</li>
              <li>We respect your privacy choices and do not share your data without explicit consent</li>
              <li>We comply with all applicable data protection laws, including GDPR and UK GDPR</li>
              <li>We delete cached Strava data within 7 days as required by the agreement</li>
              <li>We do not use Strava data for artificial intelligence or machine learning model training</li>
            </ul>
            <p className="text-gray-700 mt-4">
              If you have questions about our use of the Strava API, please contact us at{' '}
              <a href="mailto:lachart@lachart.net" className="text-primary underline">lachart@lachart.net</a>.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.35 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Garmin Integration</h2>
            <p className="text-gray-700 mb-3">
              LaChart also integrates with Garmin Connect to provide comprehensive training analysis. Similar to our Strava integration:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>You must explicitly authorize LaChart to access your Garmin data</li>
              <li>We only access and display your own Garmin activity data</li>
              <li>Your Garmin data is used solely for training analysis within LaChart</li>
              <li>We do not share your Garmin data with third parties</li>
              <li>You can revoke Garmin authorization at any time</li>
              <li>We comply with Garmin's terms of service and privacy policy</li>
            </ul>
            <p className="text-gray-700 mt-4">
              When we detect duplicate activities between Strava and Garmin (same activity synced to both platforms), we automatically identify and store only one instance to prevent data duplication.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.4 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Contact</h2>
            <p className="text-gray-700">
              For privacy questions or requests, contact us at
              {' '}<a href="mailto:lachart@lachart.net" className="text-primary underline">lachart@lachart.net</a>.
            </p>
          </motion.section>
        </div>
      </main>
    </div>
  );
};

export default Privacy;
