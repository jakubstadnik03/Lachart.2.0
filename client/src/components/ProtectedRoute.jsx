import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';

const ProtectedRoute = ({ allowedRoles, children }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  // During initial auth hydration (refresh), don't redirect to /login yet.
  // Otherwise we get a visible "bounce" to login and back.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white/5">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          <div className="text-sm text-lighterText">Loading session…</div>
        </div>
      </div>
    );
  }

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
    // Testing roles have access similar to legacy tester role
    const isTestingRole = user?.role === 'tester' || user?.role === 'testing';
    if (isTestingRole) {
      // Testing role has access to non-admin pages by default, but must still match explicit allowedRoles.
      if (allowedRoles.includes('admin') && !isAdmin) {
        return <div className="text-center mt-12 text-xl text-red-500 font-bold">You are not authorized.</div>;
      }
      if (
        allowedRoles.length &&
        !allowedRoles.includes('testing') &&
        !allowedRoles.includes('tester')
      ) {
        return <div className="text-center mt-12 text-xl text-red-500 font-bold">You are not authorized.</div>;
      }
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