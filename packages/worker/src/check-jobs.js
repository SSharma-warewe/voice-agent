import "./load-env.js";
import { getPool } from "./db.js";

const result = await getPool().query(`
  SELECT name, state, data, created_on, started_on, completed_on, retry_count, output
  FROM pgboss.job
  WHERE name = 'start-confirmation-call'
  ORDER BY created_on DESC
  LIMIT 5
`);

console.log("Recent start-confirmation-call jobs:");
console.log(JSON.stringify(result.rows, null, 2));
process.exit(0);