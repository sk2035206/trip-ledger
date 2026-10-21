import { createHash, createPrivateKey } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
  copyFile,
} from "node:fs/promises";
import path from "node:path";

export const SDK_VERSION = "2.1.31";
const ALLOWED_EXTENSIONS = new Set([
  ".js",
  ".json",
  ".wxml",
  ".wxss",
  ".wxs",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ttf",
  ".woff",
  ".woff2",
  ".wasm",
  ".mp3",
  ".wav",
  ".mp4",
]);
const PUBLIC_SETTINGS = new Set([
  "es6",
  "es7",
  "enhance",
  "postcss",
  "minified",
  "minifyJS",
  "minifyWXML",
  "minifyWXSS",
  "disableUseStrict",
  "compileWorklet",
  "uglifyFileName",
  "uploadWithSourceMap",
  "useCompilerPlugins",
]);
const PRIVATE_KEY_MARKER =
  /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/;

export function parseUploadArgs(args) {
  const result = { check: false, help: false, version: "", desc: "", robot: 1 };
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === "--check") result.check = true;
    else if (name === "--help" || name === "-h") result.help = true;
    else if (["--version", "--desc", "--robot"].includes(name)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${name} 缺少参数`);
      result[name.slice(2)] = name === "--robot" ? Number(value) : value.trim();
    } else throw new Error(`不支持的参数：${name}`);
  }
  if (result.help) return result;
  if (!result.check && (!result.version || !result.desc))
    throw new Error(
      "上传必须显式填写 --version 和 --desc；仅检查请使用 --check",
    );
  if (
    result.version &&
    !/^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/.test(result.version)
  )
    throw new Error("版本号须为 1–64 位数字、字母、点、下划线或连字符");
  if (
    result.desc.length > 1024 ||
    Array.from(result.desc).some((character) => character.codePointAt(0) < 32)
  )
    throw new Error("更新说明须为不超过 1024 字符的单行文本");
  if (!Number.isInteger(result.robot) || result.robot < 1 || result.robot > 30)
    throw new Error("robot 须为 1–30 的整数");
  return result;
}

export async function validatePrivateKey(file) {
  let resolved;
  try {
    resolved = await realpath(file);
  } catch {
    throw new Error(
      "找不到代码上传私钥，请设置 config/private.key 或 WX_CI_PRIVATE_KEY 路径",
    );
  }
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error("上传私钥路径必须是普通文件");
  if (process.platform !== "win32" && info.mode & 0o077)
    throw new Error("上传私钥权限过宽，请先执行 chmod 600 后重试");
  const bytes = await readFile(resolved);
  try {
    if (createPrivateKey(bytes).asymmetricKeyType !== "rsa")
      throw new Error("not RSA");
  } catch {
    throw new Error(
      "无法解析 RSA 上传私钥，请使用微信公众平台下载的代码上传密钥",
    );
  } finally {
    bytes.fill(0);
  }
  return resolved;
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

export async function prepareProject({
  repoRoot,
  buildDir = path.join(repoRoot, "miniprogram/dist"),
  privateKeyPath,
  version = "",
  desc = "",
}) {
  const source = await realpath(buildDir);
  const publicConfig = JSON.parse(
    await readFile(
      path.join(repoRoot, "miniprogram/project.config.json"),
      "utf8",
    ),
  );
  const rootConfig = JSON.parse(
    await readFile(path.join(repoRoot, "project.config.json"), "utf8"),
  );
  if (
    !/^wx[0-9a-f]{16}$/.test(publicConfig.appid) ||
    rootConfig.appid !== publicConfig.appid
  )
    throw new Error("两处开发者工具配置的正式 AppID 不一致");
  if (privateKeyPath && isWithin(source, await realpath(privateKeyPath)))
    throw new Error("私钥不得放在小程序构建目录中");
  const app = JSON.parse(await readFile(path.join(source, "app.json"), "utf8"));
  if (
    !Array.isArray(app.pages) ||
    !app.pages.length ||
    app.lazyCodeLoading !== "requiredComponents"
  )
    throw new Error("小程序构建缺少页面或按需注入配置，请重新构建");
  const outputRoot = path.join(repoRoot, "release/wechat-ci");
  await mkdir(outputRoot, { recursive: true });
  const workDir = await mkdtemp(path.join(outputRoot, "candidate-"));
  const projectDir = path.join(workDir, "project");
  const destination = path.join(projectDir, "dist");
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const files = [];
  async function copyArtifacts(relative = "") {
    const entries = await readdir(path.join(source, relative), {
      withFileTypes: true,
    });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === ".DS_Store" || entry.name.startsWith("._")) continue;
      const name = path.join(relative, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`构建目录存在符号链接，已拒绝打包：${name}`);
      if (
        ["node_modules", "config", ".git"].includes(entry.name) ||
        entry.name.startsWith(".env") ||
        entry.name === "project.private.config.json"
      )
        throw new Error(`构建目录含非上传内容：${name}`);
      if (entry.isDirectory()) {
        await mkdir(path.join(destination, name));
        await copyArtifacts(name);
        continue;
      }
      if (
        !entry.isFile() ||
        !ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      )
        throw new Error(`构建目录存在不允许上传的文件：${name}`);
      const bytes = await readFile(path.join(source, name));
      if (PRIVATE_KEY_MARKER.test(bytes.toString("utf8")))
        throw new Error(`构建文件含私钥标记，已拒绝上传：${name}`);
      await copyFile(path.join(source, name), path.join(destination, name));
      files.push({
        path: `dist/${name.split(path.sep).join("/")}`,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
  await copyArtifacts();
  const config = {
    appid: publicConfig.appid,
    compileType: "miniprogram",
    miniprogramRoot: "dist/",
    projectname: publicConfig.projectname,
    libVersion: publicConfig.libVersion,
    setting: {
      ...Object.fromEntries(
        Object.entries(publicConfig.setting ?? {}).filter(
          ([name, value]) =>
            PUBLIC_SETTINGS.has(name) && typeof value === "boolean",
        ),
      ),
      urlCheck: true,
    },
  };
  const configBytes = Buffer.from(JSON.stringify(config, null, 2) + "\n");
  await writeFile(path.join(projectDir, "project.config.json"), configBytes);
  files.push({
    path: "project.config.json",
    bytes: configBytes.length,
    sha256: createHash("sha256").update(configBytes).digest("hex"),
  });
  const manifest = {
    appid: config.appid,
    version: version || null,
    desc: desc || null,
    sdkVersion: SDK_VERSION,
    files,
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex");
  await writeFile(
    path.join(workDir, "manifest.json"),
    JSON.stringify({ ...manifest, digest }, null, 2) + "\n",
  );
  return { appid: config.appid, workDir, projectDir, files, digest };
}

export async function uploadPrepared({
  ci,
  prepared,
  privateKeyPath,
  version,
  desc,
  robot = 1,
}) {
  // This is the only remote mutation. --check never calls this function.
  const project = new ci.Project({
    appid: prepared.appid,
    type: "miniProgram",
    projectPath: prepared.projectDir,
    privateKeyPath,
    ignores: ["node_modules/**/*", "**/*.key", "**/*.pem"],
  });
  return ci.upload({
    project,
    version,
    desc,
    robot,
    setting: { useProjectConfig: true },
    onProgressUpdate() {},
  });
}

export function safeErrorMessage(error) {
  const message =
    typeof error?.errMsg === "string"
      ? error.errMsg
      : error instanceof Error
        ? error.message
        : "操作失败，请检查上传配置和网络";
  return message
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
      "[私钥已隐藏]",
    )
    .replace(
      /("(?:privateKey|private_key|secret)"\s*:\s*")[^"]*(")/gi,
      "$1[已隐藏]$2",
    )
    .slice(0, 1000);
}
