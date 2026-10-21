import { defineConfig } from "@tarojs/cli";
import path from "node:path";

const apiBase = process.env.TRIP_LEDGER_API_URL ?? "https://jcxxy.cn";
if (process.env.NODE_ENV === "production" && !/^https:\/\//.test(apiBase)) {
  throw new Error(
    "生产构建必须使用 HTTPS API 地址：TRIP_LEDGER_API_URL=https://你的域名",
  );
}
export default defineConfig({
  projectName: "trip-ledger-weapp",
  date: "2026-10-20",
  designWidth: 750,
  deviceRatio: { 750: 1 },
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: "vite",
  plugins: ["@tarojs/plugin-platform-weapp"],
  alias: { "@ledger": path.resolve(__dirname, "../../frontend") },
  defineConstants: { __API_BASE__: JSON.stringify(apiBase.replace(/\/$/, "")) },
  copy: {
    options: {},
    patterns: [
      { from: "../public/share-card.png", to: "dist/assets/share-card.png" },
    ],
  },
  mini: {
    postcss: { pxtransform: { enable: true }, cssModules: { enable: false } },
  },
});
