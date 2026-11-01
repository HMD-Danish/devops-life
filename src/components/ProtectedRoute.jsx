import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function ProtectedRoute({ fallback = null, unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) return fallback;

  if (!isAuthenticated) {
    const to = `/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`;
    return unauthenticatedElement ?? <Navigate to={to} replace />;
  }

  return <Outlet />;
}