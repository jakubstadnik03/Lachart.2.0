import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Uložíme si původní cestu pro případné přesměrování po přihlášení
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute; 