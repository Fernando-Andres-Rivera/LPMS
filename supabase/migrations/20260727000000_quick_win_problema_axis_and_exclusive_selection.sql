-- El "Problema del día" del tablero Quick Win queda etiquetado con su
-- propio pilar SMQDCEP (independiente del pilar de cada win candidato).
alter table public.quick_win_boards
  add column axis_id uuid references public.axes(id);
