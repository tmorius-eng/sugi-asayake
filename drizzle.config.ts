import { defineConfig } from "drizzle-kit";
import { planMysqlConnection } from "./server/_core/dbConnection";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

// 2026-10-01 (security audit E3): `dbCredentials: { url }` made drizzle-kit hand the
// raw URL to mysql2, which ignores `?ssl-mode=` -- migrations ran over plaintext
// (or unverified) TLS. Use the same plan the app uses (TLS for every non-loopback
// host, server certificate verified against DATABASE_CA_CERT[_PATH]).
const { options } = planMysqlConnection(connectionString);

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: options.host,
    port: options.port,
    user: options.user,
    password: options.password,
    database: options.database,
    ...(options.ssl ? { ssl: options.ssl as Record<string, unknown> } : {}),
  },
});
