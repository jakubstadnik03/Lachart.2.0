import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout"; // Naše Layout komponenta
import DashboardPage from "./pages/DashboardPage";
import TestingPage from "./pages/TestingPage";
import TrainingPage from "./pages/TrainingPage";
import AthletesPage from "./pages/AthletesPage";
import ProfilePage from "./pages/ProfilePage";

const App = () => {
  return (
    <Router>
      <Routes>
        {/* Všechny trasy obalené Layoutem */}
        <Route path="/" element={<Layout />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="testing" element={<TestingPage />} />
          <Route path="training" element={<TrainingPage />} />
          <Route path="athletes" element={<AthletesPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        {/* Přesměrování pro neznámé trasy */}
        <Route path="*" element={<DashboardPage />} />
      </Routes>
    </Router>
  );
};

export default App;
