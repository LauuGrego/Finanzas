-- Solución de MANUAL para la secuencia desincronizada.
-- Correr en el SQL Editor de Supabase SOLO si querés desbloquearte ya, sin
-- esperar el deploy. El deploy (commit c2ff5ec) lo arregla solo en cada
-- arranque, así que esto es apaño, no la solución.
--
-- La tabla de recurrentes se llama 'recurrings' en plural, aunque el endpoint
-- sea /recurring. No hay tabla 'transfers': un traslado son dos filas en
-- 'transactions' con el mismo transfer_id.

SELECT setval(pg_get_serial_sequence('accounts', 'id'), COALESCE((SELECT MAX(id) FROM accounts), 1));
SELECT setval(pg_get_serial_sequence('categories', 'id'), COALESCE((SELECT MAX(id) FROM categories), 1));
SELECT setval(pg_get_serial_sequence('transactions', 'id'), COALESCE((SELECT MAX(id) FROM transactions), 1));
SELECT setval(pg_get_serial_sequence('budgets', 'id'), COALESCE((SELECT MAX(id) FROM budgets), 1));
SELECT setval(pg_get_serial_sequence('goals', 'id'), COALESCE((SELECT MAX(id) FROM goals), 1));
SELECT setval(pg_get_serial_sequence('installments', 'id'), COALESCE((SELECT MAX(id) FROM installments), 1));
SELECT setval(pg_get_serial_sequence('recurrings', 'id'), COALESCE((SELECT MAX(id) FROM recurrings), 1));

-- Chequeo: cada fila dice qué secuencia está y cuál debería estar. Si
-- 'debería' es <= que 'actual', está bien.
SELECT
  'accounts'   AS tabla, last_value AS actual, (SELECT MAX(id) FROM accounts)   AS maximo
  FROM accounts_id_seq
UNION ALL SELECT 'categories',   last_value, (SELECT MAX(id) FROM categories)   FROM categories_id_seq
UNION ALL SELECT 'transactions', last_value, (SELECT MAX(id) FROM transactions) FROM transactions_id_seq
UNION ALL SELECT 'budgets',      last_value, (SELECT MAX(id) FROM budgets)      FROM budgets_id_seq
UNION ALL SELECT 'goals',        last_value, (SELECT MAX(id) FROM goals)        FROM goals_id_seq
UNION ALL SELECT 'installments', last_value, (SELECT MAX(id) FROM installments) FROM installments_id_seq
UNION ALL SELECT 'recurrings',   last_value, (SELECT MAX(id) FROM recurrings)   FROM recurrings_id_seq;