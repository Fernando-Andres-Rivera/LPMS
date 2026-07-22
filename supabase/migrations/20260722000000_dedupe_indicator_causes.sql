-- El árbol de causas propio de un indicador no tenía ninguna restricción de
-- unicidad: reintentar con el mismo nombre (ej. un tap que no seleccionó el
-- nodo existente, seguido de escribirlo a mano) creaba una fila nueva con
-- un id distinto, y el Pareto la contaba como una causa aparte aunque el
-- texto fuera idéntico. Sin distinguir mayúsculas, para que "Máquina" y
-- "máquina" tampoco puedan coexistir como nodos separados. Dos índices
-- parciales porque parent_id nulo (raíz) no se puede comparar por igualdad
-- en una restricción única normal — mismo patrón que
-- level_capture_cutoffs_org_level_default_key.
create unique index indicator_causes_root_name_key
  on indicator_causes (indicator_id, lower(name))
  where parent_id is null and active;

create unique index indicator_causes_child_name_key
  on indicator_causes (indicator_id, parent_id, lower(name))
  where parent_id is not null and active;
