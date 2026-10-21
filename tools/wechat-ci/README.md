# 官方微信小程序 CI 工具依赖

此目录只用于开发/构建机器上的代码上传，不是 H5、Node API 或小程序运行依赖。安装请从完整源码仓库执行 `npm run mini:ci:install`，不要在服务器运行包里安装。

## 来源与版本（2026-10-21 核验）

- npm 包：`miniprogram-ci`，发布者 `wechat-miniprogram`。
- npm `latest` 标签：`2.1.31`，本项目使用精确版本，完整依赖由本目录锁文件固定。
- GitHub 分发仓库：<https://github.com/wechat-miniprogram/miniprogram-ci-dist>。
- 当时 GitHub package.json 的 `2.1.48` 对应 npm `beta` 标签，不与稳定版本混用。
- 仅从 `https://registry.npmjs.org/` 安装，禁用安装生命周期脚本；SDK 加载和本地预检已验证。

## 已知依赖审计问题

2026-10-21 对最终 `2.1.31` 锁文件执行 npm audit，结果为 **87 个受影响依赖项**：critical 41、high 18、moderate 27、low 1。该计数包含依赖链上的风险传播，不表示 87 个彼此独立的漏洞，也不代表这些问题都可由本项目上传流程触发。

其中涉及 Babel 旧版依赖、protobufjs、request/form-data 等。探索时检查的 beta `2.1.48` 仍有 40 个受影响项（critical 3），因此切到 beta 也不等于消除漏洞。

当前未对所有漏洞进行可达性审计，没有将官方 SDK 的依赖强制升级或使用未经验证的 overrides。独立目录、版本锁定和禁用安装脚本不能替代漏洞修复。仅在可信源码和构建机器上使用，不允许非受信任代码/PR 接触上传密钥；真实上传前应审阅最新审计结果：

```bash
npm run mini:ci:audit
```

若要求工具链无 critical 项，目前这两个已核验的官方版本均不满足，应等待经验证的官方修复或继续使用已有开发者工具的上传流程。

本目录不保存私钥。`config/private.key` 留在仓库的本地忽略路径，实际上传时只传文件路径给 SDK；上传目录、Git 提交和服务器发布包均排除它。

使用命令、离线检查范围、IP 白名单与上传权限见 [小程序维护说明](../../docs/wechat-miniprogram.md#官方-miniprogram-ci-上传)。
