-- Datos de prueba de los mockups. Solo se cargan si la tabla empleados está vacía.

INSERT INTO empleados (no, name, role, dept, boss, shift, area, email, password) VALUES
  ('10001', 'Laura Méndez', 'gte', 'lc', NULL, 'A', 'Gerencia', 'laura.mendez@empresa.com', 'demo1234'),
  ('10112', 'Carlos Ruiz', 'sr', 'lc', '10001', 'A', 'Estaciones LC245', 'carlos.ruiz@empresa.com', 'demo1234'),
  ('10145', 'Ana Torres', 'sr', 'lc', '10001', 'B', 'CDU y Chillers', 'ana.torres@empresa.com', 'demo1234'),
  ('10230', 'Diego Herrera', 'full', 'lc', '10112', 'A', 'Estaciones LC245', 'diego.herrera@empresa.com', 'demo1234'),
  ('10251', 'Sofía Navarro', 'full', 'lc', '10145', 'B', 'CDU y Chillers', 'sofia.navarro@empresa.com', 'demo1234'),
  ('10482', 'Jorge Salinas', 'tec', 'lc', '10230', 'A', 'Estaciones LC245', 'jorge.salinas@empresa.com', 'demo1234'),
  ('10490', 'María López', 'jr', 'lc', '10230', 'A', 'Estaciones LC245', 'maria.lopez@empresa.com', 'demo1234'),
  ('10511', 'Luis Ortega', 'tec', 'lc', '10251', 'B', 'CDU y Chillers', 'luis.ortega@empresa.com', 'demo1234'),
  ('10533', 'Paola Ramírez', 'jr', 'lc', '10112', 'A', 'Estaciones LC245', 'paola.ramirez@empresa.com', 'demo1234'),
  ('10547', 'Héctor Díaz', 'tec', 'lc', '10251', 'C', 'CDU y Chillers', 'hector.diaz@empresa.com', 'demo1234'),
  ('10700', 'Andrés Molina', 'gte', 'pf', NULL, 'A', 'Gerencia', 'andres.molina@empresa.com', 'demo1234'),
  ('10620', 'Elena Castro', 'full', 'pf', '10700', 'A', 'Burn-in', 'elena.castro@empresa.com', 'demo1234'),
  ('10604', 'Ricardo Vega', 'tec', 'pf', '10620', 'C', 'Burn-in', 'ricardo.vega@empresa.com', 'demo1234'),
  ('10810', 'Fernanda Ríos', 'sr', 'smt', NULL, 'A', 'Líneas 1–3', 'fernanda.rios@empresa.com', 'demo1234'),
  ('10822', 'Iván Cruz', 'jr', 'smt', '10810', 'B', 'Líneas 1–3', 'ivan.cruz@empresa.com', 'demo1234');

INSERT INTO actividades (id, assignee, assigner, date, shift, time, text, status, pct) VALUES
  (1, '10482', '10230', '2026-10-29', 'A', '06:20', 'Cambio de coolant PG-25 en estación LC245-03', 'done', 100),
  (2, '10482', '10230', '2026-10-29', 'A', '06:20', 'Prueba de fuga a 3 unidades en espera', 'progress', 60),
  (3, '10482', '10230', '2026-10-29', 'A', '06:21', 'Actualizar hoja de WIP de la estación', 'pending', 0),
  (4, '10482', '10230', '2026-10-29', 'A', '06:21', 'Limpieza de filtros en LC245-01', 'progress', 40),
  (5, '10490', '10230', '2026-10-29', 'A', '06:30', 'Análisis de falla en unidad SN 7731', 'progress', 70),
  (6, '10490', '10230', '2026-10-29', 'A', '06:31', 'Pareto de fallas de la semana', 'done', 100),
  (7, '10533', '10112', '2026-10-29', 'A', '06:40', 'Validar POE de estación LC6', 'progress', 50),
  (8, '10533', '10112', '2026-10-29', 'A', '06:41', 'Capacitación a técnicos nuevos', 'pending', 10),
  (9, '10511', '10251', '2026-10-28', 'B', '14:45', 'Calibración de CDU línea 2', 'incomplete', 65),
  (10, '10547', '10251', '2026-10-28', 'C', '23:10', 'Revisión de alarmas en chillers', 'done', 100),
  (11, '10230', '10112', '2026-10-29', 'A', '06:10', 'Reporte de yield turno A', 'progress', 45),
  (12, '10251', '10145', '2026-10-28', 'B', '14:35', 'Plan de mantenimiento CDU', 'pending', 20),
  (13, '10112', '10001', '2026-10-29', 'A', '06:05', 'Revisión de indicadores del área', 'progress', 80),
  (14, '10145', '10001', '2026-10-28', 'B', '14:32', 'Auditoría 5S en CDU', 'done', 100);

INSERT INTO notificaciones (id, recipient, kind, actor, activity_id, count, time, read) VALUES
  (1, '10482', 'assigned', '10230', NULL, 4, '06:21', false),
  (2, '10482', 'comment', '10230', 4, NULL, '06:25', false),
  (3, '10001', 'done', '10547', 10, NULL, '02:40', false),
  (4, '10001', 'incomplete', '10511', 9, NULL, '22:58', false),
  (5, '10001', 'progress', '10490', 5, NULL, '09:12', true),
  (6, '10001', 'pending', '10533', 8, NULL, '08:30', true),
  (7, '10001', 'comment', '10482', 2, NULL, '10:05', false),
  (8, '10001', 'assigned', '10112', NULL, 2, '06:41', true);

-- Los ids se insertaron a mano: mover los contadores para que los nuevos registros no choquen
SELECT setval(pg_get_serial_sequence('actividades', 'id'), (SELECT max(id) FROM actividades));
SELECT setval(pg_get_serial_sequence('notificaciones', 'id'), (SELECT max(id) FROM notificaciones));
