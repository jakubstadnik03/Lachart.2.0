import React from 'react';
import { motion } from 'framer-motion';

const Documentation = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl">
            LaChart Frontend Documentation
          </h1>
          <p className="mt-4 text-xl text-gray-500">
            Comprehensive guide to LaChart's frontend components and features
          </p>
        </motion.div>

        {/* Component Diagram */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="bg-white shadow rounded-lg p-6 mb-12"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Component Diagram</h2>
          <div className="prose max-w-none">
            <p>Below is a high-level diagram illustrating the main frontend components and their relationships:</p>
            ```mermaid
classDiagram
  App &lt;|-- NotificationProvider
  NotificationProvider --|&gt; BrowserRouter
  NotificationProvider --|&gt; NotificationComponent
  BrowserRouter --|&gt; Routes
  Routes --|&gt; Route
  Route --|&gt; PrivateRoute
  Route --|&gt; AnonymousRoute
  Route --|&gt; About
  
  PrivateRoute --|&gt; Layout
  Layout --|&gt; Navbar
  Layout --|&gt; Menu
  Layout --|&gt; Dashboard
  Layout --|&gt; Testing
  Layout --|&gt; Training
  Layout --|&gt; Athletes
  Layout --|&gt; Profile
  Layout --|&gt; Settings
  Layout --|&gt; Support
  Layout --|&gt; TrainingDetailPage
  Layout --|&gt; AthleteProfile
  Layout --|&gt; TrainingHistory

  AnonymousRoute --|&gt; LoginPage
  AnonymousRoute --|&gt; SignUpPage
  AnonymousRoute --|&gt; ForgotPasswordPage
  AnonymousRoute --|&gt; ResetPasswordPage
  AnonymousRoute --|&gt; CompleteRegistrationPage
  AnonymousRoute --|&gt; AcceptInvitationPage
  AnonymousRoute --|&gt; AcceptCoachInvitation
  AnonymousRoute --|&gt; TestingWithoutLogin
  AnonymousRoute --|&gt; Documentation

  TestingWithoutLogin --|&gt; LactateCurve
  TestingWithoutLogin --|&gt; LactateCurveCalculator
  TestingWithoutLogin --|&gt; DataTable
  TestingWithoutLogin --|&gt; TestingForm

  TestingForm --|&gt; TutorialMessagePortal
  TestingForm --|&gt; Input
  TestingForm --|&gt; Button

  About --|&gt; ContactUs
  ContactUs --|&gt; Button
  ContactUs --|&gt; Input

  class App
  class NotificationProvider
  class BrowserRouter
  class NotificationComponent
  class Routes
  class Route
  class PrivateRoute
  class AnonymousRoute
  class Layout
  class Navbar
  class Menu
  class Dashboard
  class Testing
  class Training
  class Athletes
  class Profile
  class Settings
  class Support
  class TrainingDetailPage
  class AthleteProfile
  class TrainingHistory
  class LoginPage
  class SignUpPage
  class ForgotPasswordPage
  class ResetPasswordPage
  class CompleteRegistrationPage
  class AcceptInvitationPage
  class AcceptCoachInvitation
  class TestingWithoutLogin
  class Documentation
  class LactateCurve
  class LactateCurveCalculator
  class DataTable
  class TestingForm
  class TutorialMessagePortal
  class Input
  class Button
  class ContactUs
  class About


  App : root component
  NotificationProvider : manages notifications
  BrowserRouter : handles routing using HTML5 history API
  NotificationComponent : displays notifications
  Routes : container for Route elements
  Route : maps URL paths to components
  PrivateRoute : protects routes requiring authentication
  AnonymousRoute : routes accessible without authentication
  Layout : provides common layout structure
  Navbar : navigation bar
  Menu : mobile/sidebar menu
  Dashboard : dashboard page
  Testing : testing page (authenticated)
  Training : training page (authenticated)
  Athletes : athletes management page
  Profile : user/athlete profile page
  Settings : user settings page
  Support : support page
  TrainingDetailPage : displays details of a specific training session
  AthleteProfile : displays profile of a specific athlete
  TrainingHistory : displays training history
  LoginPage : user login page
  SignUpPage : user sign up page
  ForgotPasswordPage : forgot password page
  ResetPasswordPage : reset password page
  CompleteRegistrationPage : completes user registration
  AcceptInvitationPage : handles accepting user invitations
  AcceptCoachInvitation : handles accepting coach invitations
  TestingWithoutLogin : testing page (without login)
  Documentation : frontend documentation page
  LactateCurve : displays lactate curve graph
  LactateCurveCalculator : calculates data for lactate curve
  DataTable : displays data table
  TestingForm : form for testing data input
  TutorialMessagePortal : displays tutorial messages using a portal
  Input : reusable input component
  Button : reusable button component
  ContactUs : contact form component
  About : about page



```
          </div>
        </motion.section>

        {/* Component Documentation */}
        <div className="space-y-12">
          {/* Testing Component */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white shadow rounded-lg p-6"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Testing Component</h2>
            <div className="prose max-w-none">
              <h3>Features</h3>
              <ul>
                <li>Lactate curve plotting with multiple calculation methods</li>
                <li>Real-time data input and validation</li>
                <li>Automatic calculations and visualizations</li>
                <li>Data persistence using localStorage</li>
              </ul>
              <h3>Usage</h3>
              <pre className="bg-gray-100 p-4 rounded">
                {`<TestingWithoutLogin />`}
              </pre>
            </div>
          </motion.section>

          {/* Contact Form */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-white shadow rounded-lg p-6"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact Form</h2>
            <div className="prose max-w-none">
              <h3>Features</h3>
              <ul>
                <li>Form validation</li>
                <li>Email integration with EmailJS</li>
                <li>Responsive design</li>
                <li>Success/error notifications</li>
              </ul>
              <h3>Usage</h3>
              <pre className="bg-gray-100 p-4 rounded">
                {`<ContactUs />`}
              </pre>
            </div>
          </motion.section>

          {/* Navigation */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-white shadow rounded-lg p-6"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Navigation</h2>
            <div className="prose max-w-none">
              <h3>Features</h3>
              <ul>
                <li>Responsive navigation bar</li>
                <li>User authentication status</li>
                <li>Mobile-friendly menu</li>
                <li>Smooth transitions</li>
              </ul>
              <h3>Usage</h3>
              <pre className="bg-gray-100 p-4 rounded">
                {`<Navbar />`}
              </pre>
            </div>
          </motion.section>

          {/* Common Components */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-white shadow rounded-lg p-6"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Common Components</h2>
            <div className="prose max-w-none">
              <h3>Button Component</h3>
              <pre className="bg-gray-100 p-4 rounded">
                {`<Button 
  variant="primary" 
  onClick={handleClick}
  disabled={isLoading}
>
  Click Me
</Button>`}
              </pre>

              <h3>Input Component</h3>
              <pre className="bg-gray-100 p-4 rounded">
                {`<Input
  type="text"
  label="Username"
  value={username}
  onChange={handleChange}
  required
/>`}
              </pre>

              <h3>Notification Component</h3>
              <pre className="bg-gray-100 p-4 rounded">
                {`<Notification
  type="success"
  message="Operation completed successfully"
  onClose={handleClose}
/>`}
              </pre>
            </div>
          </motion.section>

          {/* State Management */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="bg-white shadow rounded-lg p-6"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">State Management</h2>
            <div className="prose max-w-none">
              <h3>Context Providers</h3>
              <ul>
                <li>AuthContext - User authentication state</li>
                <li>NotificationContext - Global notifications</li>
                <li>ThemeContext - Application theming</li>
              </ul>
              <h3>Usage Example</h3>
              <pre className="bg-gray-100 p-4 rounded">
                {`const { user, login, logout } = useAuth();
const { addNotification } = useNotification();`}
              </pre>
            </div>
          </motion.section>

          {/* Styling */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="bg-white shadow rounded-lg p-6"
          >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Styling</h2>
            <div className="prose max-w-none">
              <h3>Tailwind CSS</h3>
              <p>The application uses Tailwind CSS for styling. Common classes include:</p>
              <ul>
                <li>Layout: flex, grid, container</li>
                <li>Spacing: p-4, m-2, space-x-4</li>
                <li>Colors: text-primary, bg-white</li>
                <li>Responsive: sm:, md:, lg: prefixes</li>
              </ul>
              <h3>Custom Theme</h3>
              <pre className="bg-gray-100 p-4 rounded">
                {`// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#...',
        secondary: '#...',
      }
    }
  }
}`}
              </pre>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
};

export default Documentation; 