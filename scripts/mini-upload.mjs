import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseUploadArgs,
  prepareProject,
  safeErrorMessage,
  SDK_VERSION,
  uploadPrepared,
  validatePrivateKey,
} from "./mini-upload-core.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
async function main() {
  const args = parseUploadArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "本地预检：npm run mini:upload:check\n上传开发版：npm run mini:upload -- --version 1.0.2 --desc '更新说明' [--robot 1]\n私钥路径：WX_CI_PRIVATE_KEY，默认 config/private.key\n每次均先生产构建；--check 不调用微信接口。上传不会提交审核或正式发布。",
    );
    return;
  }
  const key = await validatePrivateKey(
    path.resolve(
      repoRoot,
      process.env.WX_CI_PRIVATE_KEY ?? "config/private.key",
    ),
  );
  const keyRelative = path.relative(repoRoot, key);
  if (!keyRelative.startsWith("..") && !path.isAbsolute(keyRelative)) {
    const tracked = spawnSync(
      "git",
      ["ls-files", "--error-unmatch", "--", keyRelative],
      { cwd: repoRoot, stdio: "ignore" },
    );
    if (tracked.status === 0)
      throw new Error("上传私钥已被 Git 跟踪，请先移出版本管理");
    const ignored = spawnSync(
      "git",
      ["check-ignore", "--quiet", "--", keyRelative],
      { cwd: repoRoot, stdio: "ignore" },
    );
    if (ignored.status !== 0)
      throw new Error("仓库内的上传私钥必须先加入 .gitignore");
  }
  const toolRequire = createRequire(
    path.join(repoRoot, "tools/wechat-ci/package.json"),
  );
  let sdk;
  try {
    sdk = toolRequire("miniprogram-ci/package.json");
    toolRequire.resolve("miniprogram-ci");
  } catch {
    throw new Error("未安装独立 CI 工具，请先运行 npm run mini:ci:install");
  }
  const lock = JSON.parse(
    await readFile(
      path.join(repoRoot, "tools/wechat-ci/package-lock.json"),
      "utf8",
    ),
  );
  const locked = lock.packages?.["node_modules/miniprogram-ci"];
  if (
    sdk.name !== "miniprogram-ci" ||
    sdk.version !== SDK_VERSION ||
    locked?.version !== SDK_VERSION ||
    locked.resolved !==
      `https://registry.npmjs.org/miniprogram-ci/-/miniprogram-ci-${SDK_VERSION}.tgz` ||
    typeof locked.integrity !== "string"
  ) {
    throw new Error("CI 工具来源或版本与锁定配置不一致，请重新安装工具依赖");
  }
  console.log(
    `CI ${SDK_VERSION} · ${args.check ? "本地预检，不连接微信" : `上传开发版 ${args.version}`}`,
  );
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const build = spawnSync(npm, ["run", "mini:build"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
  if (build.status !== 0) throw new Error("小程序生产构建失败，已停止上传");
  const prepared = await prepareProject({
    repoRoot,
    privateKeyPath: key,
    version: args.version,
    desc: args.desc,
  });
  let commit = null;
  let sourceDirty = null;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    sourceDirty = Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim(),
    );
  } catch {
    /* Optional outside Git. */
  }
  const metadata = {
    appid: prepared.appid,
    version: args.version || null,
    desc: args.desc || null,
    sdkVersion: SDK_VERSION,
    sourceCommit: commit,
    sourceDirty,
    manifestDigest: prepared.digest,
    timestamp: new Date().toISOString(),
  };
  console.log(
    `AppID ${prepared.appid} · 上传文件 ${prepared.files.length} 项 · ${prepared.projectDir}`,
  );
  if (args.check) {
    await writeFile(
      path.join(prepared.workDir, "check-result.json"),
      JSON.stringify(
        { ...metadata, status: "checked", remoteRequest: false },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "预检通过：RSA 私钥可解析、未跟踪且已忽略；暂存目录仅包含构建产物和公共配置。未调用微信接口，密钥与 IP 白名单的远端授权尚未验证。",
    );
    return;
  }
  console.warn(
    "官方 CI 依赖存在已知审计问题，请先审阅 tools/wechat-ci/README.md 并运行 npm run mini:ci:audit；仅对可信源码和产物使用。",
  );
  const ci = toolRequire("miniprogram-ci");
  console.log("正在调用微信代码上传接口…");
  const result = await uploadPrepared({
    ci,
    prepared,
    privateKeyPath: key,
    version: args.version,
    desc: args.desc,
    robot: args.robot,
  });
  const packages = Array.isArray(result?.subPackageInfo)
    ? result.subPackageInfo.map((item) => ({
        name: String(item.name ?? ""),
        size: Number(item.size) || 0,
      }))
    : [];
  const resultFile = path.join(prepared.workDir, "upload-result.json");
  await writeFile(
    resultFile,
    JSON.stringify({ ...metadata, status: "uploaded", packages }, null, 2) +
      "\n",
  );
  console.log(
    `上传成功：${args.version} 已生成开发版本。结果：${resultFile}。未提交审核或正式发布。`,
  );
}
main().catch((error) => {
  console.error(safeErrorMessage(error));
  process.exitCode = 1;
});
