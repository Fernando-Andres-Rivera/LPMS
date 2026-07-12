-- ============================================================
-- Quita "unidades" del catálogo de unidades de medida de cada
-- organización — no describe nada real (todo indicador se mide en algo
-- específico: %, accidentes, kg, días…) y se prestaba a seleccionarse
-- por error en vez de "%" al definir el objetivo de un indicador.
--
-- Seguro de borrar: indicators.unit es texto libre independiente de
-- esta tabla catálogo — ningún indicador que ya tenga unit='unidades'
-- pierde su valor; solo deja de aparecer como opción sugerida para
-- indicadores nuevos. Si alguien vuelve a escribirlo a mano, el propio
-- flujo de "Otra, especificar" lo re-agrega al catálogo.
-- ============================================================

delete from units where name = 'unidades';
