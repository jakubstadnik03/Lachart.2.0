import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import TrainingPage from './pages/TrainingPage';
import TestingPage from './pages/TestingPage';
// ... další importy

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/testing" element={<TestingPage />} />
        {/* ... další routy */}
      </Route>
    </Routes>
  );
};

export default AppRoutes; 