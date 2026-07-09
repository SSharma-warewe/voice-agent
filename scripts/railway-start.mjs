/**
 * Railway entrypoint: start one process role per service container.
 * Set SERVICE_ROLE to one of: api | web | worker | agent | agent-lead | agent-booking | web-api | worker-agents | all
 */
import { spawn } from "node:child_process";

const role = (process.env.SERVICE_ROLE || "all").toLowerCase();

const commands = {
  api: ["pnpm", ["start:api"]],
  web: ["pnpm", ["start:web"]],
  worker: ["pnpm", ["start:worker"]],
  agent: ["pnpm", ["start:agent"]],
  "agent-lead": ["pnpm", ["start:agent:lead"]],
  "agent-booking": ["pnpm", ["start:agent:booking"]],
  // Free plan (3 services max) — two LiveKit agents in one container is unstable
  // (one dies with exit 1). Keep at most one agent process per service.
  //  voice-repo → web-api + booking agent (inbound, idle until called)
  //  api        → confirmation agent only
  //  worker     → pg-boss worker + lead agent
  "worker-agents": [
    "pnpm",
    [
      "exec",
      "concurrently",
      "-n",
      "worker,lead",
      "-c",
      "green,cyan",
      "pnpm start:worker",
      "sh -c 'LIVEKIT_AGENT_PORT=8082 pnpm start:agent:lead'",
    ],
  ],
  // Handled specially below so API is healthy before web accepts traffic.
  "web-api": null,
  all: [
    "pnpm",
    [
      "exec",
      "concurrently",
      "-n",
      "api,web,worker,agent,lead,booking",
      "-c",
      "blue,magenta,green,yellow,cyan,white",
      "pnpm start:api",
      "pnpm start:web",
      "pnpm start:worker",
      "sh -c 'LIVEKIT_AGENT_PORT=8081 pnpm start:agent'",
      "sh -c 'LIVEKIT_AGENT_PORT=8082 pnpm start:agent:lead'",
      "sh -c 'LIVEKIT_AGENT_PORT=8083 pnpm start:agent:booking'",
    ],
  ],
};

function spawnCommand(cmd, args, { name } = {}) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (name) child.__name = name;
  return child;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApiHealth({
  timeoutMs = Number(process.env.API_READY_TIMEOUT_MS || 90_000),
} = {}) {
  // When web-api runs in one container, API binds SERVER_PORT (default 6080)
  // and web binds the public PORT. Health is always the API process.
  const healthPort = Number(
    process.env.API_HEALTH_PORT || process.env.SERVER_PORT || 6080,
  );
  const url = `http://127.0.0.1:${healthPort}/health`;
  const started = Date.now();
  let lastError = "not started";

  console.log(`[railway-start] waiting for API health at ${url}`);

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        console.log(
          `[railway-start] API healthy after ${Date.now() - started}ms`,
        );
        return;
      }
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(400);
  }

  throw new Error(
    `API did not become healthy within ${timeoutMs}ms (${url}): ${lastError}`,
  );
}

/**
 * Start API first, wait until /health is OK, then start web + booking agent.
 * Fixes intermittent ECONNREFUSED 502s from the web proxy during boot.
 */
async function startWebApiRole() {
  console.log("[railway-start] SERVICE_ROLE=web-api (ordered boot)");

  const children = [];
  const api = spawnCommand("pnpm", ["start:api"], { name: "api" });
  children.push(api);

  try {
    await waitForApiHealth();
  } catch (error) {
    console.error("[railway-start]", error instanceof Error ? error.message : error);
    api.kill("SIGTERM");
    process.exit(1);
  }

  children.push(spawnCommand("pnpm", ["start:web"], { name: "web" }));
  children.push(
    spawnCommand(
      process.platform === "win32" ? "cmd" : "sh",
      process.platform === "win32"
        ? ["/c", "set LIVEKIT_AGENT_PORT=8083&& pnpm start:agent:booking"]
        : ["-c", "LIVEKIT_AGENT_PORT=8083 pnpm start:agent:booking"],
      { name: "booking" },
    ),
  );

  const shutdown = (signal) => {
    for (const child of children) {
      if (!child.killed) child.kill(signal);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  for (const child of children) {
    child.on("exit", (code, signal) => {
      console.error(
        `[railway-start] child ${child.__name || "proc"} exited code=${code} signal=${signal}`,
      );
      shutdown("SIGTERM");
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 1);
    });
  }
}

if (role === "web-api") {
  await startWebApiRole();
} else {
  const entry = commands[role];
  if (!entry) {
    console.error(
      `Unknown SERVICE_ROLE="${role}". Use: ${Object.keys(commands).join(", ")}`,
    );
    process.exit(1);
  }

  const [cmd, args] = entry;
  console.log(`[railway-start] SERVICE_ROLE=${role} → ${cmd} ${args.join(" ")}`);

  const child = spawn(cmd, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  const shutdown = (signal) => {
    if (!child.killed) child.kill(signal);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}
