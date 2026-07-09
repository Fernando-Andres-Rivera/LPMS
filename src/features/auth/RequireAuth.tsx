import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

/** Redirige a /login si no hay sesión activa. */
export function RequireAuth() {
  const { session, loading } = useAuth()

  if (loading) return <div className="page-loading">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />

  return <Outlet />
}
