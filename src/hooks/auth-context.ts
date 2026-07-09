import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Organization, Profile } from '../lib/types'

export interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  siteIds: string[]
  loading: boolean
  /** Organización efectiva para todas las consultas de datos. Para la mayoría de
   * los roles es siempre profile.organization_id; para admin_consultora puede
   * cambiar mediante setOrganizationId (selector de cliente). */
  organizationId: string | null
  /** Lista de organizaciones disponibles para cambiar — solo se llena para admin_consultora. */
  organizations: Organization[]
  setOrganizationId: (id: string) => void
  /** Vuelve a cargar la lista de organizaciones (ej. tras crear una nueva) y, si se pasa, selecciona esa. */
  refreshOrganizations: (selectId?: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
