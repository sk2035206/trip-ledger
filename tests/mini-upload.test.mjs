import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  parseUploadArgs,
  prepareProject,
  safeErrorMessage,
  uploadPrepared,
  validatePrivateKey,
} from "../scripts/mini-upload-core.mjs";

const appid = "wx028019a8de4909d1";
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "trip-ci-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "miniprogram/dist"), { recursive: true });
  await mkdir(path.join(root, "config"));
  const config = {
    appid,
    setting: { es6: true, unexpectedSecret: "do-not-copy" },
    miniprogramRoot: "dist/",
  };
  await writeFile(
    path.join(root, "miniprogram/project.config.json"),
    JSON.stringify(config),
  );
  await writeFile(
    path.join(root, "project.config.json"),
    JSON.stringify({ appid }),
  );
  await writeFile(
    path.join(root, "miniprogram/dist/app.json"),
    JSON.stringify({
      pages: ["pages/home/index"],
      lazyCodeLoading: "requiredComponents",
    }),
  );
  await writeFile(path.join(root, "miniprogram/dist/app.js"), "App({})");
  await writeFile(
    path.join(root, "config/private.key"),
    "TEST SECRET OUTSIDE BUILD",
  );
  await writeFile(
    path.join(root, "config/mysql.json"),
    '{"password":"not-for-upload"}',
  );
  return root;
}

test("upload requires explicit version and description; check cannot be mistaken for upload", () => {
  assert.throws(() => parseUploadArgs([]), /显式填写/);
  assert.throws(() => parseUploadArgs(["--version", "1.0.2"]), /显式填写/);
  assert.throws(() => parseUploadArgs(["--version", "--desc"]), /缺少参数/);
  assert.throws(() => parseUploadArgs(["--release"]), /不支持/);
  assert.throws(() => parseUploadArgs(["--check", "--robot", "31"]), /1–30/);
  assert.equal(parseUploadArgs(["--check"]).check, true);
  assert.deepEqual(
    parseUploadArgs(["--version", "1.0.2", "--desc", "更新布局"]),
    { check: false, help: false, version: "1.0.2", desc: "更新布局", robot: 1 },
  );
});

test("upload staging copies build output only and strips unrelated project settings", async (t) => {
  const root = await fixture(t);
  const result = await prepareProject({
    repoRoot: root,
    privateKeyPath: path.join(root, "config/private.key"),
    version: "1.0.2",
    desc: "验证",
  });
  assert.deepEqual(result.files.map((file) => file.path).sort(), [
    "dist/app.js",
    "dist/app.json",
    "project.config.json",
  ]);
  const config = JSON.parse(
    await readFile(path.join(result.projectDir, "project.config.json"), "utf8"),
  );
  assert.equal(config.appid, appid);
  assert.equal(config.miniprogramRoot, "dist/");
  assert.equal(config.setting.unexpectedSecret, undefined);
  const manifest = await readFile(
    path.join(result.workDir, "manifest.json"),
    "utf8",
  );
  assert.ok(
    !manifest.includes("TEST SECRET") && !manifest.includes("not-for-upload"),
  );
  assert.equal(result.digest.length, 64);
});

test("private keys, environment files and symlinks in build output prevent upload staging", async (t) => {
  for (const name of [
    "private.key",
    ".env",
    "debug.map",
    "project.private.config.json",
  ]) {
    const root = await fixture(t);
    await writeFile(
      path.join(root, "miniprogram/dist", name),
      "should not upload",
    );
    await assert.rejects(prepareProject({ repoRoot: root }), /不允许|非上传/);
  }
  const root = await fixture(t);
  await symlink(
    path.join(root, "config/private.key"),
    path.join(root, "miniprogram/dist/key.js"),
  );
  await assert.rejects(prepareProject({ repoRoot: root }), /符号链接/);
});

test("private key contents embedded in otherwise valid JavaScript are rejected", async (t) => {
  const root = await fixture(t);
  await writeFile(
    path.join(root, "miniprogram/dist/leak.js"),
    "-----BEGIN RSA PRIVATE KEY-----\nnot-a-real-key",
  );
  await assert.rejects(prepareProject({ repoRoot: root }), /私钥标记/);
});

test("mismatched AppIDs or a key placed under dist are rejected", async (t) => {
  const root = await fixture(t);
  await assert.rejects(
    prepareProject({
      repoRoot: root,
      privateKeyPath: path.join(root, "miniprogram/dist/app.js"),
    }),
    /私钥不得/,
  );
  await writeFile(
    path.join(root, "project.config.json"),
    JSON.stringify({ appid: "wx1111111111111111" }),
  );
  await assert.rejects(prepareProject({ repoRoot: root }), /AppID 不一致/);
});

test("local key validation parses RSA without returning secret material and enforces permissions", async (t) => {
  const root = await fixture(t);
  const key = path.join(root, "config/private.key");
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  await writeFile(key, privateKey, { mode: 0o600 });
  await chmod(key, 0o600);
  assert.equal(await validatePrivateKey(key), await realpath(key));
  if (process.platform !== "win32") {
    await chmod(key, 0o644);
    await assert.rejects(validatePrivateKey(key), /权限过宽/);
    await chmod(key, 0o600);
  }
  await writeFile(key, "invalid");
  await assert.rejects(validatePrivateKey(key), /无法解析/);
});

test("official SDK adapter uploads only the isolated project using a key path", async () => {
  const calls = [];
  const ci = {
    Project: class {
      constructor(options) {
        this.options = options;
        calls.push("project");
      }
    },
    async upload(options) {
      calls.push("upload");
      assert.equal(options.version, "1.0.2");
      assert.equal(options.project.options.projectPath, "/isolated/project");
      assert.equal(
        options.project.options.privateKeyPath,
        "/outside/private.key",
      );
      assert.equal(options.project.options.privateKey, undefined);
      assert.equal(options.setting.useProjectConfig, true);
      return { subPackageInfo: [] };
    },
  };
  await uploadPrepared({
    ci,
    prepared: { appid, projectDir: "/isolated/project" },
    privateKeyPath: "/outside/private.key",
    version: "1.0.2",
    desc: "说明",
  });
  assert.deepEqual(calls, ["project", "upload"]);
});

test("SDK errors redact PEM private key data", () => {
  const message = safeErrorMessage(
    new Error(
      "oops -----BEGIN RSA PRIVATE KEY-----\nsecret-content\n-----END RSA PRIVATE KEY-----",
    ),
  );
  assert.ok(!message.includes("secret-content"));
  assert.match(message, /隐藏/);
});

test("server archive exclusions prevent config keys from entering release bundles", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "config/another.pem"), "TEST PEM");
  const script = await readFile(
    new URL("../scripts/release-build.sh", import.meta.url),
    "utf8",
  );
  const exclusions = Array.from(
    script.matchAll(/--exclude='([^']+)'/g),
    (match) => `--exclude=${match[1]}`,
  );
  const archive = path.join(root, "backend.tar.gz");
  execFileSync("tar", [...exclusions, "-czf", archive, "-C", root, "config"]);
  const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
  assert.ok(
    !entries.includes("private.key") &&
      !entries.includes("another.pem") &&
      !entries.includes("mysql.json"),
  );
});
