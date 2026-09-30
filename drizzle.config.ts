import { defineConfig } from "drizzle-kit";
import { planMysqlConnection } from "./server/_core/dbConnection";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

const { options } = planMysqlConnection(connectionString);

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    ...options,
    // mysql2 ignores ssl-mode in URLs. Use the shared policy, and require
    // certificate verification for migrations (configured CA or system roots).
    ...(options.ssl ? { ssl: { ...options.ssl, rejectUnauthorized: true } } : {}),
  },
});
