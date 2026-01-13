import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';

const ProtectedRoute = ({ allowedRoles, children }) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  // Debug log
  console.log('ProtectedRoute current user:', user);

  if (!isAuthenticated) {
    // Uložíme si původní cestu pro případné přesměrování po přihlášení
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && allowedRoles.length) {
    // Podpora admin route přes user.admin === true
    if (
      allowedRoles.includes('admin') && !user?.admin
    ) {
      return <div className="text-center mt-12 text-xl text-red-500 font-bold">You are not authorized.</div>;
    }
    // Tester má přístup ke stránkám, které jsou dostupné pro athlete nebo coach
    if (user?.role === 'tester') {
      // Tester má přístup ke všem stránkám kromě admin-only (pokud není admin)
      if (allowedRoles.includes('admin') && !user?.admin) {
        return <div className="text-center mt-12 text-xl text-red-500 font-bold">You are not authorized.</div>;
      }
      // Pro ostatní role (coach, athlete) nebo pokud není žádná role specifikována, má tester přístup
      return children;
    }
    // Kontrola pro ostatní role
    if (!allowedRoles.includes(user?.role)) {
      return <div className="text-center mt-12 text-xl text-red-500 font-bold">You are not authorized.</div>;
    }
  }

  return children;
};

export default ProtectedRoute; 