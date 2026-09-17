# Trip Ledger

旅行分账 H5 项目：记录每次旅行的公共费用、出行费用、个人费用和人员付款，自动生成成员分账清单。

- 前端：Vinext（Next.js 兼容层）+ React 19 + Tailwind CSS
- 后端：独立 Node HTTP 服务（`server/`）
- 存储：MySQL 关系表（`mysql2` 直连，无 ORM）

## 环境要求

- Node.js `>=22.13.0`
- MySQL `8.0+`

## 快速开始

```bash
npm install

# 复制数据库配置模板并填写真实连接信息
cp config/mysql.example.json config/mysql.json

# 同时启动后端 API（127.0.0.1:5174）和 Web（0.0.0.0:5173）
npm run dev:start
```

访问 `http://127.0.0.1:5173/`。首次启动时后端会自动建表，无需手工执行 SQL。

停止服务：

```bash
npm run dev:stop
```

## 目录结构

- `app/`：页面、只读分享页与同源 API 代理路由
- `frontend/`：共享类型、示例数据、分账计算、截图文本解析和 API 客户端
- `server/`：Node API、业务服务层和 MySQL 存储层
- `server/mysql/schema.sql`：建表参考 SQL（后端启动时会自动建表并补齐字段）
- `config/mysql.example.json`：数据库配置模板
- `config/mysql.json`：本地真实数据库配置，不应提交敏感信息
- `scripts/`：本地与生产环境的启停、打包、上传脚本
- `docs/`：需求、部署和开发约定文档
- `tests/`：Node 内置测试运行器编写的单元测试

## 数据库配置

`config/mysql.json`：

```json
{
  "host": "127.0.0.1",
  "port": 3306,
  "user": "root",
  "password": "123456",
  "database": "trip_ledger",
  "connectionLimit": 10
}
```

后端启动时会自动建表，并按主键在事务内增量同步数据；不会清空整表重建。表之间不使用外键约束。

## 接口

后端 API 默认只监听 `127.0.0.1:5174`，前端通过同源 `/api/*` 代理访问。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 存储健康检查与各业务表行数 |
| GET | `/api/state` | 读取全量状态 |
| PUT | `/api/state` | 保存全量状态 |
| GET | `/api/trips/{tripId}` | 读取单个账单，供只读分享页使用 |
| GET | `/api/share-card.png` | 微信分享缩略图 |

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev:start` | 启动本地后端 + Web |
| `npm run dev:stop` | 停止本地服务 |
| `npm run dev:restart` | 重启本地服务 |
| `npm run dev:logs` | 跟踪本地开发日志 |
| `npm run api:start` / `api:stop` | 只启停后端 API |
| `npm run build` | 构建前端产物 |
| `npm run test` | 构建并运行单元测试 |
| `npm run lint` | ESLint 检查 |
| `./node_modules/.bin/tsc --noEmit` | TypeScript 类型检查 |
| `npm run release:build` | 打包前后端发布产物到 `release/` |
| `npm run deploy:scp` | 上传发布产物到服务器 |

日志统一写入 `logs/`。

## 截图导入

公共费用支持从账单截图导入：浏览器本地使用 tesseract.js 做中英文 OCR，识别文本经 `frontend/ledger-import.ts` 解析为待确认项目，按关键词匹配类别，确认后批量写入当前账单。OCR 不经过后端。

## 发布

仅当明确需要上线时执行。发布流程、nginx 配置和线上环境变量见 `docs/deploy.md`。

## 相关文档

- `docs/requirements.md`：功能需求与计算规则
- `docs/project-rules.md`：开发约定、数据库规则和发布约定
- `docs/deploy.md`：部署说明
- [vinext Documentation](https://github.com/cloudflare/vinext)
