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
    // Testing roles have access similar to legacy tester role
    const isTestingRole = user?.role === 'tester' || user?.role === 'testing';
    if (isTestingRole) {
      // Testing role has access to non-admin pages by default, but must still match explicit allowedRoles.
      if (allowedRoles.includes('admin') && !isAdmin) {
        // #region agent log
        fetch('http://127.0.0.1:7486/ingest/9f05e821-ae3c-4b9e-a4b9-ee5e90c3fa82', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2e357f' },
          body: JSON.stringify({
            sessionId: '2e357f',
            runId: 'precheck',
            hypothesisId: 'H1',
            location: 'ProtectedRoute.jsx',
            message: 'testing-role denied (admin-only)',
            data: { role: user?.role, allowedRoles },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        return <div className="text-center mt-12 text-xl text-red-500 font-bold">You are not authorized.</div>;
      }
      if (
        allowedRoles.length &&
        !allowedRoles.includes('testing') &&
        !allowedRoles.includes('tester')
      ) {
        // #region agent log
        fetch('http://127.0.0.1:7486/ingest/9f05e821-ae3c-4b9e-a4b9-ee5e90c3fa82', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2e357f' },
          body: JSON.stringify({
            sessionId: '2e357f',
            runId: 'precheck',
            hypothesisId: 'H1',
            location: 'ProtectedRoute.jsx',
            message: 'testing-role denied (allowedRoles mismatch)',
            data: { role: user?.role, allowedRoles },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        return <div className="text-center mt-12 text-xl text-red-500 font-bold">You are not authorized.</div>;
      }
      // #region agent log
      fetch('http://127.0.0.1:7486/ingest/9f05e821-ae3c-4b9e-a4b9-ee5e90c3fa82', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2e357f' },
        body: JSON.stringify({
          sessionId: '2e357f',
          runId: 'precheck',
          hypothesisId: 'H1',
          location: 'ProtectedRoute.jsx',
          message: 'testing-role allowed',
          data: { role: user?.role, allowedRoles, isAdmin },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
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