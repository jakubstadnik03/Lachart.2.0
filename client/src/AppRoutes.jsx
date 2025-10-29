import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import TrainingPage from './pages/TrainingPage';
import TestingPage from './pages/TestingPage';
import LactateGuide from './pages/LactateGuide';
import AdminDashboard from './pages/AdminDashboard';
import FitAnalysisPage from './pages/FitAnalysisPage';
import LactateTestingPage from './pages/LactateTestingPage';
// ... další importy

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/testing" element={<TestingPage />} />
        <Route path="/lactate-guide" element={<LactateGuide />} />
        <Route path="/lactate-testing" element={<LactateTestingPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/fit-analysis" element={<FitAnalysisPage />} />
        {/* ... další routy */}
      </Route>
    </Routes>
  );
};

export default AppRoutes; 