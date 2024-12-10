import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import TestingPage from "./pages/TestingPage";
import TrainingPage from "./pages/TrainingPage";
import AthletesPage from "./pages/AthletesPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import SupportPage from "./pages/SupportPage";

const App = () => {
  return (
    <Router>
      <Routes>
        {/* Dashboard (hlavní stránka) */}
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* Testing */}
        <Route path="/testing" element={<TestingPage />} />

        {/* Training */}
        <Route path="/training" element={<TrainingPage />} />

        {/* Athletes */}
        <Route path="/athletes" element={<AthletesPage />} />

        {/* Profile */}
        <Route path="/profile" element={<ProfilePage />} />

        {/* Settings */}
        <Route path="/settings" element={<SettingsPage />} />

        {/* Support */}
        <Route path="/support" element={<SupportPage />} />

        {/* Výchozí přesměrování na Dashboard */}
        <Route path="*" element={<DashboardPage />} />
      </Routes>
    </Router>
  );
};

export default App;
