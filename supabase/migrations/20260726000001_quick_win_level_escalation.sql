-- Cascada de escalación: un win rojo en Nivel 1 pasa a la reunión de
-- Nivel 2; si ahí tampoco se resuelve, pasa a Nivel 3. `level` es el nivel
-- que actualmente lo tiene en su cola de decisión.
alter table public.quick_win_candidates
  add column level smallint not null default 1 check (level between 1 and 3);

create index idx_quick_win_candidates_level on public.quick_win_candidates (level);
