import { supabase } from '../../lib/supabase'
import type { Indicator, IndicatorLink } from '../../lib/types'

/**
 * Trae todos los indicadores y vínculos padre-hijo de la organización.
 * En Fase 1 el volumen de indicadores por tenant es pequeño, así que se
 * arma el árbol completo en el cliente en vez de hacer consultas recursivas.
 */
export async function fetchCascadeData(
  organizationId: string,
): Promise<{ indicators: Indicator[]; links: IndicatorLink[] }> {
  const [{ data: indicators, error: indicatorsError }, { data: links, error: linksError }] = await Promise.all([
    supabase.from('indicators').select('*').eq('organization_id', organizationId).eq('active', true),
    // indicator_links no tiene organization_id propio; RLS ya restringe las filas
    // a los vínculos cuyo indicador hijo pertenece al tenant del usuario.
    supabase.from('indicator_links').select('*'),
  ])

  if (indicatorsError) throw indicatorsError
  if (linksError) throw linksError

  return { indicators: indicators ?? [], links: links ?? [] }
}
