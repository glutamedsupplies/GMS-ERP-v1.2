-- Manual attendance timeout corrections for GMS/GWD.
-- Local SQLite target:
--   .runtime-data/data/tenants/company_27e2b5d69251.db
-- PostgreSQL target:
--   run with search_path set to tenant_company_27e2b5d69251.

BEGIN;

UPDATE attendance
SET time_out = '18:13',
    worked_hours = '8.25'
WHERE id = 'Cjlarcab.1924@gmail.com'
  AND name = 'Jun Claude Cabral'
  AND date = '2026-05-27'
  AND time_in = '08:58';

UPDATE attendance
SET time_out = '18:13',
    worked_hours = '8.75'
WHERE id = '060425'
  AND name = 'Jhonrey'
  AND date = '2026-05-30'
  AND time_in = '08:28';

UPDATE attendance
SET time_out = '18:14',
    worked_hours = '8.57'
WHERE id = 'airine'
  AND name = 'AIRINE ROBLEDO SOSA'
  AND date = '2026-05-30'
  AND time_in = '08:40';

UPDATE attendance
SET time_out = '18:18',
    worked_hours = '8.85'
WHERE id = 'GMS aaron'
  AND name = 'Aaron'
  AND date = '2026-05-30'
  AND time_in = '08:27';

COMMIT;

SELECT id, name, date, time_in, time_out, worked_hours, remarks
FROM attendance
WHERE (id = 'Cjlarcab.1924@gmail.com' AND date = '2026-05-27')
   OR (id = '060425' AND date = '2026-05-30')
   OR (id = 'airine' AND date = '2026-05-30')
   OR (id = 'GMS aaron' AND date = '2026-05-30')
ORDER BY date, name;
