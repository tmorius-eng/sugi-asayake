-- Least-privilege application DB user (2026-09-12 SQL-injection review).
--
-- The app connects as avnadmin (Aiven superuser). It never issues DDL
-- (CREATE/ALTER/DROP) or GRANT at runtime -- migrations are applied by hand
-- with scripts/db-apply-migration.ts, which can keep using avnadmin. So the
-- running server should hold only the four DML verbs on the app schema.
--
-- Run once in the Aiven console (or: mysql < this file) as avnadmin, then set
-- DATABASE_URL on every host to the new user. Behaviour is unchanged; the only
-- difference is that a hypothetical injection or a compromised dependency can
-- no longer drop a table, read mysql.user, or grant itself rights.
--
-- Pick a strong password; keep it only in the ignored .env, like the current one.

CREATE USER IF NOT EXISTS 'sugi_app'@'%' IDENTIFIED BY 'REPLACE_WITH_A_STRONG_PASSWORD';

-- Exactly the verbs the app uses at runtime, on the app database only.
GRANT SELECT, INSERT, UPDATE, DELETE ON `defaultdb`.* TO 'sugi_app'@'%';

-- Deliberately NOT granted: CREATE, ALTER, DROP, INDEX, REFERENCES, GRANT,
-- FILE, PROCESS, SUPER, or any privilege on the mysql/sys/performance_schema
-- databases. Migrations keep running as avnadmin.

FLUSH PRIVILEGES;

-- Then, in .env on each host (home laptop, work laptop, production):
--   DATABASE_URL=mysql://sugi_app:<password>@sugi-asayake-db-...:25861/defaultdb?ssl-mode=REQUIRED
-- Restart the app. scripts/db-apply-migration.ts still uses the avnadmin URL
-- (pass it with -DatabaseUrl, or keep an ADMIN_DATABASE_URL for migrations).
