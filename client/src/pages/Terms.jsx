import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';

const Terms = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>Terms of Use | LaChart</title>
        <link rel="canonical" href="https://lachart.net/terms" />
        <meta name="description" content="LaChart Terms of Use – read our terms and conditions for using the lactate testing and training analysis platform." />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content="Terms of Use | LaChart" />
        <meta property="og:description" content="LaChart Terms of Use – read our terms and conditions for using the platform." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://lachart.net/terms" />
        <meta property="og:image" content="https://lachart.net/og-lactate-curve-calculator.png" />
      </Helmet>

      {/* Navbar */}
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

      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Terms of Use</h1>
          <p className="text-gray-600 mt-1">Last updated: {new Date().toLocaleDateString()}</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <div className="space-y-8">
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
            <p className="text-gray-700">
              By accessing or using LaChart ("the Service"), you agree to be bound by these Terms of Use ("Terms"). If you do not agree to these Terms, please do not use the Service. LaChart reserves the right to modify these Terms at any time, and such modifications shall be effective immediately upon posting.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Description of Service</h2>
            <p className="text-gray-700 mb-3">
              LaChart is a web-based platform that provides:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Lactate threshold testing and analysis tools</li>
              <li>Training zone calculations based on lactate data</li>
              <li>Training progress tracking and analytics</li>
              <li>Integration with third-party services (Strava, Garmin)</li>
              <li>Coach and athlete management features</li>
            </ul>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. User Accounts</h2>
            <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-4">3.1 Registration</h3>
            <p className="text-gray-700 mb-3">
              To use certain features of the Service, you must register for an account. You agree to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Provide accurate, current, and complete information during registration</li>
              <li>Maintain and update your account information to keep it accurate</li>
              <li>Maintain the security of your password and account</li>
              <li>Accept responsibility for all activities that occur under your account</li>
            </ul>
            <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-4">3.2 Account Security</h3>
            <p className="text-gray-700">
              You are responsible for maintaining the confidentiality of your account credentials. LaChart is not liable for any loss or damage arising from your failure to protect your account information.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Acceptable Use</h2>
            <p className="text-gray-700 mb-3">
              You agree not to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Use the Service for any illegal purpose or in violation of any laws</li>
              <li>Attempt to gain unauthorized access to the Service or other users' accounts</li>
              <li>Interfere with or disrupt the Service or servers connected to the Service</li>
              <li>Transmit any viruses, malware, or other harmful code</li>
              <li>Use automated systems (bots, scrapers) to access the Service without permission</li>
              <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity</li>
              <li>Harass, abuse, or harm other users</li>
            </ul>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Data Storage and Privacy</h2>
            <p className="text-gray-700 mb-3">
              Your account and test entries are stored securely. Data is not shared with third parties except as required by law or as described in our Privacy Policy. By using the Service, you consent to the collection and use of your data as described in our Privacy Policy.
            </p>
            <p className="text-gray-700">
              You retain ownership of your data. You may export or delete your data at any time through your account settings.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Analytics and Cookies</h2>
            <p className="text-gray-700">
              The Service collects anonymous usage statistics to improve the product. We use essential cookies for security and functionality, and analytics cookies to understand usage patterns. By using the Service, you consent to our use of cookies as described in our Privacy Policy.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Third-Party Services</h2>
            <p className="text-gray-700 mb-3">
              LaChart integrates with third-party services such as Strava and Garmin. By connecting these services:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>You authorize LaChart to access your data from these services</li>
              <li>You agree to comply with the terms of service of these third-party providers</li>
              <li>You understand that LaChart is not responsible for the availability or accuracy of third-party services</li>
              <li>You may revoke access to third-party services at any time through your account settings</li>
            </ul>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.35 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Intellectual Property</h2>
            <p className="text-gray-700 mb-3">
              The Service, including its original content, features, and functionality, is owned by LaChart and is protected by international copyright, trademark, and other intellectual property laws.
            </p>
            <p className="text-gray-700">
              You may not copy, modify, distribute, sell, or lease any part of the Service without our prior written consent.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.4 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Disclaimer of Warranties</h2>
            <p className="text-gray-700 mb-3">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Warranties of merchantability, fitness for a particular purpose, or non-infringement</li>
              <li>That the Service will be uninterrupted, secure, or error-free</li>
              <li>That the results obtained from using the Service will be accurate or reliable</li>
            </ul>
            <p className="text-gray-700 mt-4">
              LaChart does not provide medical advice. The Service is for informational and training purposes only and should not be used as a substitute for professional medical advice, diagnosis, or treatment.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.45 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Limitation of Liability</h2>
            <p className="text-gray-700 mb-3">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, LACHART SHALL NOT BE LIABLE FOR:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2">
              <li>Any indirect, incidental, special, consequential, or punitive damages</li>
              <li>Loss of profits, data, use, goodwill, or other intangible losses</li>
              <li>Damages resulting from your use or inability to use the Service</li>
              <li>Damages resulting from unauthorized access to or alteration of your data</li>
            </ul>
            <p className="text-gray-700 mt-4">
              In no event shall LaChart's total liability exceed the amount you paid to LaChart in the twelve (12) months prior to the claim.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.5 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Indemnification</h2>
            <p className="text-gray-700">
              You agree to indemnify and hold harmless LaChart, its officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including legal fees) arising out of your use of the Service, violation of these Terms, or infringement of any rights of another.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.55 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Termination</h2>
            <p className="text-gray-700 mb-3">
              LaChart may terminate or suspend your account and access to the Service immediately, without prior notice, for any reason, including:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Violation of these Terms</li>
              <li>Fraudulent, abusive, or illegal activity</li>
              <li>Extended periods of inactivity</li>
            </ul>
            <p className="text-gray-700">
              You may terminate your account at any time by contacting us at{' '}
              <a href="mailto:lachart@lachart.net" className="text-primary underline">lachart@lachart.net</a>.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.6 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">13. Changes to Terms</h2>
            <p className="text-gray-700">
              LaChart reserves the right to modify these Terms at any time. We will notify users of material changes by posting the updated Terms on this page and updating the "Last updated" date. Your continued use of the Service after such modifications constitutes acceptance of the updated Terms.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.65 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">14. Governing Law</h2>
            <p className="text-gray-700">
              These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which LaChart operates, without regard to its conflict of law provisions. Any disputes arising from these Terms or the Service shall be resolved in the appropriate courts of that jurisdiction.
            </p>
          </motion.section>

          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.7 }} className="bg-white rounded-2xl shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">15. Contact Information</h2>
            <p className="text-gray-700">
              If you have any questions about these Terms, please contact us at{' '}
              <a href="mailto:lachart@lachart.net" className="text-primary underline">lachart@lachart.net</a>.
            </p>
          </motion.section>
        </div>
      </main>

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
                  <a href="mailto:lachart@lachart.net" className="ml-2 text-gray-600 hover:text-primary">
                    lachart@lachart.net
                  </a>
                </li>
                <li className="flex items-center">
                  <svg className="h-6 w-6 text-primary" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5A4.25 4.25 0 0 0 7.75 20.5h8.5A4.25 4.25 0 0 0 20.5 16.25v-8.5A4.25 4.25 0 0 0 16.25 3.5h-8.5Zm8.75 2a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.5A3.5 3.5 0 1 0 12 15a3.5 3.5 0 0 0 0-7Z" />
                  </svg>
                  <a
                    href="https://www.instagram.com/lachartapp/?igsh=MXUwZWF3MnU2OXE0dg%3D%3D"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-gray-600 hover:text-primary"
                  >
                    @lachartapp on Instagram
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-200 pt-8 text-center space-y-3">
            <p className="text-base text-gray-400">
              &copy; {new Date().getFullYear()} LaChart. All rights reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-gray-500">
              <a
                href="/privacy"
                className="hover:text-primary transition-colors"
              >
                Privacy Policy
              </a>
              <span className="text-gray-300">•</span>
              <a
                href="/terms"
                className="hover:text-primary transition-colors"
              >
                Terms of Use
              </a>
            </div>
            <p className="text-sm text-gray-500">
              Need help or have questions?{" "}
              <a
                href="mailto:lachart@lachart.net"
                className="text-primary hover:text-primary-dark font-medium"
              >
                Contact us
              </a>
              .
            </p>
          </div>
        </div>
      </motion.footer>
    </div>
  );
};

export default Terms;
