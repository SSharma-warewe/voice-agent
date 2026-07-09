import "./config/env.ts";
import { getConfig } from "./config/env.ts";
import { createApp } from "./app.ts";
import { initDb } from "./shared/db/init.ts";

const config = getConfig();
const app = createApp();

await initDb();

app.listen(config.serverPort, "0.0.0.0", () => {
  console.log(`API server running on http://0.0.0.0:${config.serverPort}`);
});
