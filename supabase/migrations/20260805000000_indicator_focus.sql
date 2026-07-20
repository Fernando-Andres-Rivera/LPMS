-- Marca "foco": un indicador señalado como prioritario por el equipo, para
-- que resalte con un borde azul muy visible en todas las tarjetas (Dashboard
-- general, por eje, por nivel y Tablero), sin importar su semáforo.
alter table indicators add column is_focus boolean not null default false;
