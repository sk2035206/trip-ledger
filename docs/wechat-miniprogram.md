# 微信小程序开发与维护

## 当前状态

- 正式 AppID：`wx028019a8de4909d1`。
- 用户于 **2026-10-21 确认已完成正式账号切换和版本发布**；具体版本号、审核与发布时间以微信公众平台为准。
- 当前用户确认已手动上传并发布的版本：`1.0.1`。
- 默认 API：`https://jcxxy.cn`，与 H5 共用现有 Node API / MySQL 账本。
- H5 / API 已于 2026-10-20 配套部署，`GET /api/state` 已支持 `revision`。历史记录见 [发布记录](releases.md)。

内部使用，共用全局人员、类别和账单，不新增用户隔离或微信登录。分享页仅查看指定账单，没有写入入口；这不代表新增了服务端权限系统。

## 技术与目录

小程序使用 Taro 4.3、React 18、TypeScript、Vite 4，依赖独立于 H5 的 React 19 / Vite 8。

| 路径 | 职责 |
| --- | --- |
| `miniprogram/config/index.ts` | Taro 构建、API 地址、公共模块别名 |
| `miniprogram/src/app.config.ts` | 页面注册、窗口样式、组件按需注入 |
| `miniprogram/src/pages/home/` | 工作台、出行/人员/类别管理 |
| `miniprogram/src/pages/trip/` | 账单详情、成员管理、费用录入 |
| `miniprogram/src/pages/share/` | 单账单只读分享 |
| `miniprogram/src/components/` | 列表、金额摘要、弹层、费用表单等 |
| `miniprogram/src/lib/` | 微信请求、页面共享状态、保存与错误处理 |
| `frontend/` | 共享类型、分账计算、日期、文本解析、费用校验、版本客户端 |
| `server/state/` | 状态指纹、锁与事务保存 |

## 安装、开发与构建

Node.js 要求 `>=22.13.0`。首次克隆先安装根目录依赖，再安装小程序依赖：

```bash
npm ci
npm run mini:install
npm run mini:dev
```

已安装过小程序依赖时，建议在 `miniprogram/` 执行 `npm ci`，按其锁文件复现版本。该目录 `.npmrc` 固定 `legacy-peer-deps=true`，避免 Taro 跨平台 peerDependencies 自动引入未使用的框架。

构建与类型检查：

```bash
npm run mini:typecheck
npm run mini:build
```

产物位于 `miniprogram/dist/`，构建不会上传、审核或发布小程序。H5 / API 的 `release:build` 和 `deploy:scp` 也不会发布微信小程序。

## 微信开发者工具

任选一个入口导入，两个配置使用同一正式 AppID：

| 导入目录 | 配置 | `miniprogramRoot` |
| --- | --- | --- |
| 仓库根目录 | `project.config.json` | `miniprogram/dist/` |
| `miniprogram/` | `miniprogram/project.config.json` | `dist/` |

不要直接导入 `src/`。切换账号后，使用有该小程序开发权限的微信登录，确认项目 AppID 后重新编译。

两处 `project.private.config.json` 是本机 IDE 偏好，均不提交。`node_modules/`、`.swc/`、`.taro/`、`dist/` 和预览截图也不提交。AppID 是公开项目标识；AppSecret 不放在前端源码中。

### 组件按需注入

`src/app.config.ts` 保留：

```ts
lazyCodeLoading: "requiredComponents"
```

构建后确认 `miniprogram/dist/app.json` 包含此字段，然后在开发者工具点击“代码质量 → 重新扫描”。本地已验证构建配置，IDE 扫描结果以工具实际显示为准。

## API 环境与联调

开发与生产构建默认连接 **线上真实账本** `https://jcxxy.cn`。自动化或写入测试须显式指定隔离测试 API：

```bash
TRIP_LEDGER_API_URL=https://你的测试域名 npm run mini:dev
TRIP_LEDGER_API_URL=https://你的测试域名 npm run mini:build
```

API 地址为根地址，不带结尾 `/api`；小程序直接发起请求，不依赖 Vinext 的同源代理。现有后端支持 `/api/*` 和 `/ledger/api/*`。

本地模拟器可使用：

```bash
# 先确认本地数据库配置与测试数据范围，再启动 API
npm run api:start
TRIP_LEDGER_API_URL=http://127.0.0.1:5174 npm run mini:dev
```

`mini:dev` 不会启动 API。本地 HTTP 调试可按需关闭开发者工具域名校验；生产构建只接受 HTTPS。真机的 `127.0.0.1` 指手机自身，需使用手机可访问的测试服务地址。

微信后台配置 `https://jcxxy.cn` 为 request 合法域名。小程序分享使用打包在本地的分享图，不依赖 H5 的微信签名接口。

连接失败时，页面区分读取失败和修改未保存；控制台记录请求地址和微信 `errMsg`。遇到“后端版本不匹配”，检查 API 是否返回 `revision`，不可绕过版本校验保存。

## 页面与交互

- 小程序必须允许未登录用户直接进入首页，不设置强制登录启动页；无权限时展示无数据的“连接账本”状态，用户主动点击“登录并连接”后才显示密码输入弹层。
- 登录成功后在本地保存服务端签发的 7 天会话令牌；令牌过期或接口返回 401 时回到未连接状态，不自动弹登录、不强制跳转。只读分享页始终免登录。
- 标题、状态栏与列表工具栏统一使用满宽布局：说明在左，刷新、查看全部、新增、完整清单、小组合计、分享等操作固定在右侧。
- 小组合计与费用录入的成员选择统一为三列等宽按钮，长名称单行省略；选中状态显示勾选标记和背景。
- 行程 Tab 选中时为墨绿底白字，未选中时保留浅色边框；切换后保留明确的选中状态。
- 四个主入口放在底部：工作台、出行、人员、类别；新增入口和搜索在各管理页。
- 账单详情保留 H5 的总览/清单/公费/出行/个人/人员，支持快速切换账单。
- 清单展示应付/应收回金额、成员明细和小组合计，计算规则与 H5 一致。小组合计未选成员时展示账单公共费用分类，选中后按类别汇总所选成员的公共分摊、出行与个人费用，代付以负数抵扣；分项之和等于组合应付。分项条统一从左侧向右延伸，长度按金额绝对值计算，金额前的正负号区分分摊与抵扣。
- 费用条目分别展示付款人与分摊人，编辑/删除放在更多菜单，删除仍需确认。
- 批量管理需要显式进入，全选只作用于当前分类；批量替换类别、分摊人或删除。
- 底部文本导入与右侧主操作等高，保留原有宽度；导入弹层的解析文本按钮居中。
- 底部主操作随当前分区变化；录入弹层突出金额，错误就地提示，放弃未保存输入需确认。
- 分享卡片进入指定账单只读页，只调用 `GET /api/trips/{tripId}`，不读取全量状态、不保存。
- 小程序提供文本解析、逐项修改和确认导入；截图 OCR 尚未实现，H5 的浏览器 OCR 保持原状。

## 保存协议与恢复

| 请求/状态 | 行为 |
| --- | --- |
| `POST /api/auth/login` | 携带密码与小程序客户端标识，成功后返回签名会话令牌和到期时间 |
| `GET /api/state` | 返回 `{ state, revision }` |
| `PUT /api/state` | 请求 `{ state, revision }`，成功返回新状态与版本 |
| HTTP 401 | 清理本地会话，首页显示“登录并连接”，不强制跳转登录页 |
| HTTP 409 | 版本冲突，本次修改未保存 |
| HTTP 428 | 缺少版本，刷新或更新客户端 |
| HTTP 503 | 写锁等待超时，稍后重试 |

`revision` 是规范化数据库状态的 SHA-256 指纹，无需新增业务表。读取使用一致性快照；保存通过数据库命名锁串行化，在同一事务内比较版本、增量同步并读取结果。

两端读取同一版本后，先保存者成功，后保存者收到 409。H5 / API 必须配套更新，不混跑旧版 API；长期打开的旧 H5 页面需要刷新。

小程序成功读取前不能编辑，也不会将示例数据作为远程账本保存。保存期间禁用其他修改；失败后保留当前内存草稿，可重试或复制 JSON。409 后不自动更新版本覆盖远程数据，需复制草稿，再确认放弃本地修改并刷新。关闭小程序会丢失内存草稿。

若服务器提交后网络断开，重试可能收到 409；先刷新核对实际数据，避免重复录入。

## 官方 miniprogram-ci 上传

官方工具安装在独立目录 `tools/wechat-ci/`，不加入 H5 或 Taro 的依赖树，也不进入小程序产物。默认固定 npm 的 `latest` 标签对应版本 `2.1.31`；核验时 npm 发布者为 `wechat-miniprogram`。GitHub 分发仓库标注的 `2.1.48` 属于 npm 的 beta 标签，不作为本项目默认版本。

`tools/wechat-ci/.npmrc` 使用官方 npm registry 并禁用依赖安装脚本；版本与完整依赖 integrity 记录在独立锁文件。后续升级须重新核验来源、审计与验证，不直接拉取 GitHub master 或执行强制修复。

### 首次安装与离线检查

```bash
npm run mini:ci:install
npm run mini:upload:check
```

用户提供的代码上传私钥保留在 `config/private.key`，其权限应为 `600`。该文件已加入 Git 忽略，服务器打包脚本也排除 `config/*.key` 和 `config/*.pem`。可通过环境变量指定其他本地路径：

```bash
WX_CI_PRIVATE_KEY=/你的安全目录/private.key npm run mini:upload:check
```

预检会本地解析 RSA 私钥、确认未被 Git 跟踪且仓库内密钥已忽略，再执行新的生产构建。只复制构建目录和白名单公共项目配置到 `release/wechat-ci/candidate-*/project/`，拦截密钥、环境文件、私有 IDE 配置、符号链接和含私钥标记的文件。密钥路径传给 SDK，密钥本身不复制进上传目录，不写日志。

`--check` 不调用微信接口，不上传或预览代码，不能确认微信后台是否已登记对应公钥以及当前出口 IP 是否在白名单中。

### 上传开发版本

1. 在微信公众平台为正式 AppID 下载代码上传密钥，并配置实际上传机器的出口 IP 白名单。保留白名单限制，IP 改变时按实际情况更新。
2. 按本次授权填写新的版本号与说明。例如下面是后续版本的命令示例，**不是已执行的上传**：

```bash
npm run mini:upload -- --version 1.0.2 --desc '本次更新说明'
```

脚本支持可选 `--robot 1`（范围 1–30）。不提供版本号或说明会立即拒绝，避免误传默认版本；每次上传都会重新构建，不复用陈旧产物。

正式调用是 `ci.Project` + `ci.upload`，只上传隔离目录对应的小程序开发版，不提交审核、正式发布或操作云开发资源，也不依赖开发者工具登录和本机 CLI 服务端口。

每次检查或成功上传的摘要位于 `release/wechat-ci/candidate-*/`，包含 AppID、版本、说明、SDK 版本、源码提交/是否有未提交修改、文件清单与 SHA-256；成功上传另写 `upload-result.json`。敏感字段不会写入摘要，整个目录属于本地忽略产物。

### 依赖审计与边界

```bash
npm run mini:ci:audit
```

官方来源并不代表依赖没有漏洞。首次审计发现官方 SDK 依赖树含已知高危和严重问题；使用版本、审计结果与验证范围见 `tools/wechat-ci/README.md`。当前采取版本锁定、禁用安装脚本、独立依赖目录、受控产物和密钥排除；**独立目录不等于操作系统沙箱，也不能消除依赖漏洞**。仅对可信源码和构建产物使用该工具，不让非受信任的 PR 或外部包接触上传私钥。

真实上传前需要评估当前审计结果。不要为了消除审计提示直接运行 `npm audit fix --force` 或擅自替换 SDK 固定依赖；优先采用经验证的官方更新。IP 白名单、微信权限与实际网络请求的验证仍需首次真实上传确认。

官方参考：[SDK 使用说明](https://github.com/wechat-miniprogram/miniprogram-ci-dist#readme)、[npm 包](https://www.npmjs.com/package/miniprogram-ci)。

## 后续发布流程

1. 确认正式 AppID、目标 API、类目、备案和隐私指引等后台要求。
2. 运行验证与生产构建，检查 `dist/app.json` 的按需注入配置。
3. 在开发者工具核对 AppID、代码质量和包大小，用隔离数据完成真机验收。
4. 获得该次发布授权后，上传代码、填写版本信息，按后台流程设置体验版、提交审核并发布。
5. 发布后核对首页、数据读取、只读分享、异常提示，并在 [发布记录](releases.md) 记录结果。

本地构建、Git 提交、服务器部署、微信上传和版本发布是不同操作；后续服务器部署或微信上传审核仍需明确授权。数据库实际数据变更遵守 [项目约定](project-rules.md)。

## 验证

```bash
npm run lint
./node_modules/.bin/tsc --noEmit
npm run mini:typecheck
npm test
npm run mini:build
```

现有测试覆盖分账、金额/成员校验、文本解析、状态指纹、双客户端冲突、并发保存拒绝、失败回滚、锁释放及网络错误。事务测试使用隔离内存适配器，不连接真实数据库。

后续功能变更还应在隔离数据环境检查：三类费用增删改、人员/类别改名和删除限制、成员移除影响、批量操作、文本确认导入、两端冲突、断网恢复、分享页只读、长名单、小屏、键盘与安全区。浏览器适配预览只能验证部分布局和操作，不能代替微信真机验收。
