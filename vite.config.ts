import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import vinext from "vinext";
import { defineConfig, type PluginOption } from "vite";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";
const workerEntry = "./worker/index.ts";

type HostingConfig = {
  d1?: string | null;
  r2?: string | null;
};

function readHostingConfig(): HostingConfig {
  const path = resolve(process.cwd(), ".openai/hosting.json");
  if (!existsSync(path)) return {};

  const content = readFileSync(path, "utf8").trim();
  if (!content) return {};

  return JSON.parse(content) as HostingConfig;
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(async () => {
  const plugins: PluginOption[] = [vinext(), sites()];
  const hostingConfig = readHostingConfig();
  const { d1, r2 } = hostingConfig;

  if (existsSync(resolve(process.cwd(), workerEntry))) {
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    plugins.push(
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: {
          main: workerEntry,
          compatibility_flags: ["nodejs_compat"],
          d1_databases: d1
            ? [
                {
                  binding: d1,
                  database_name: "site-creator-d1",
                  database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
                },
              ]
            : [],
          r2_buckets: r2
            ? [
                {
                  binding: r2,
                  bucket_name: "site-creator-r2",
                },
              ]
            : [],
        },
      }),
    );
  }

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins,
  };
});
