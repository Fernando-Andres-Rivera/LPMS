import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import type { UserRole } from '../../lib/types'

/** Restringe el acceso a una ruta a un subconjunto de roles. */
export function RequireRole({ allowed }: { allowed: UserRole[] }) {
  const { profile, loading } = useAuth()

  if (loading) return <div className="page-loading">Cargando…</div>
  if (!profile) return <Navigate to="/login" replace />
  if (!allowed.includes(profile.role)) return <Navigate to="/" replace />

  return <Outlet />
}
