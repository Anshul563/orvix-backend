import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

export const db = drizzle(pool, { schema });
