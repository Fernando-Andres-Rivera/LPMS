-- ============================================================
-- Días de la semana en que se reúne cada nivel — hasta ahora el
-- bloqueo de captura (level_capture_cutoffs) se aplicaba TODOS los días;
-- pero no toda cascada se reúne diario (ej. gerencial solo lunes y
-- viernes). `weekdays` sigue la convención de Date.getDay(): 0=domingo,
-- 1=lunes … 6=sábado.
--
-- Default '{0,1,2,3,4,5,6}' (todos los días) para que los horarios ya
-- configurados sigan bloqueando exactamente igual que antes hasta que el
-- usuario los ajuste explícitamente en la pantalla — no es un cambio de
-- comportamiento retroactivo.
-- ============================================================

alter table level_capture_cutoffs
  add column if not exists weekdays smallint[] not null default '{0,1,2,3,4,5,6}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'level_capture_cutoffs_weekdays_check') then
    alter table level_capture_cutoffs
      add constraint level_capture_cutoffs_weekdays_check check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]);
  end if;
end $$;
