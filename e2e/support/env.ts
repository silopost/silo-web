import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Ports of the dev stack: SILO_DEV_* from the environment or from `silo/.env`. */
function devPorts(siloDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const file = resolve(siloDir, ".env");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*(SILO_DEV_\w+)\s*=\s*(\S+)/.exec(line);
      if (m) out[m[1]!] = m[2]!;
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith("SILO_DEV_") && v) out[k] = v;
  return out;
}

export function e2eEnv() {
  const siloDir = resolve(process.env.SILO_DIR ?? resolve(import.meta.dirname, "../../../silo"));
  const ports = devPorts(siloDir);
  const webPort = Number(process.env.SILO_E2E_WEB_PORT ?? 5180);
  return {
    siloDir,
    composeFile: resolve(siloDir, "docker-compose.dev.yml"),
    webPort,
    webUrl: process.env.SILO_E2E_WEB_URL ?? `http://localhost:${webPort}`,
    apiUrl: process.env.SILO_E2E_API ?? `http://localhost:${ports.SILO_DEV_SERVER_PORT ?? 8080}`,
    imapHost: process.env.SILO_E2E_IMAP_HOST ?? "localhost",
    imapPort: Number(ports.SILO_DEV_IMAP_PORT ?? 1143),
    /** SILO_UNDO_WINDOW of the stack (compose default 10s). */
    undoWindowMs: Number((process.env.SILO_UNDO_WINDOW ?? "10s").replace(/s$/, "")) * 1000,
  };
}

/** Dev mailboxes (silo/scripts/dev-up.sh). */
export const accounts = {
  dev1: { email: "dev1@silo.test", password: "devpass1" },
  dev2: { email: "dev2@silo.test", password: "devpass2" },
  dev3: { email: "dev3@silo.test", password: "devpass3" },
} as const;

export type DevAccount = (typeof accounts)[keyof typeof accounts];
