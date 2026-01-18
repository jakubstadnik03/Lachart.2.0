import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';

const ProtectedRoute = ({ allowedRoles, children }) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Uložíme si původní cestu pro případné přesměrování po přihlášení
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && allowedRoles.length) {
    // Check if user is admin (either via role or admin flag)
    const isAdmin = user?.role === 'admin' || user?.admin === true;
    
    // Podpora admin route přes user.admin === true nebo user.role === 'admin'
    if (allowedRoles.includes('admin') && !isAdmin) {
      return <div className="text-center mt-12 text-xl text-red-500 font-bold">You are not authorized.</div>;
    }
    // Tester má přístup ke stránkám, které jsou dostupné pro athlete nebo coach
    if (user?.role === 'tester') {
      // Tester má přístup ke všem stránkám kromě admin-only (pokud není admin)
      if (allowedRoles.includes('admin') && !isAdmin) {
        return <div className="text-center mt-12 text-xl text-red-500 font-bold">You are not authorized.</div>;
      }
      // Pro ostatní role (coach, athlete) nebo pokud není žádná role specifikována, má tester přístup
      return children;
    }
    // Kontrola pro ostatní role (pokud není admin route)
    if (!allowedRoles.includes('admin') && !allowedRoles.includes(user?.role)) {
      return <div className="text-center mt-12 text-xl text-red-500 font-bold">You are not authorized.</div>;
    }
  }

  return children;
};

export default ProtectedRoute; 