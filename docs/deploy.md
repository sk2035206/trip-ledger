# 旅行分账部署说明

## 目录约定

- 前端静态资源目录：`/usr/share/nginx/html/trip-ledger`
- 后端服务目录：`/home/trip-ledger`
- 后端 API：`http://127.0.0.1:5174`
- Web 服务：`http://127.0.0.1:5173`

## 本地打包

```bash
npm run release:build
```

生成文件在 `release/`：

- `trip-ledger-frontend-latest.tar.gz`
- `trip-ledger-backend-latest.tar.gz`

## 使用 scp 上传

复制配置模板：

```bash
cp config/deploy.example.env config/deploy.env
```

修改 `config/deploy.env`：

```bash
DEPLOY_TARGET=xxy
REMOTE_FRONTEND_DIR=/usr/share/nginx/html/trip-ledger
REMOTE_BACKEND_DIR=/home/trip-ledger
```

执行上传：

```bash
npm run deploy:scp
```

默认会上传到 `xxy`，并自动创建远端目录。需要发到其他服务器时，修改 `config/deploy.env` 里的 `DEPLOY_TARGET`。

## 服务器解压与启动

```bash
mkdir -p /usr/share/nginx/html/trip-ledger /home/trip-ledger
tar -xzf /usr/share/nginx/html/trip-ledger/trip-ledger-frontend.tar.gz -C /usr/share/nginx/html/trip-ledger
tar -xzf /home/trip-ledger/trip-ledger-backend.tar.gz -C /home/trip-ledger

cd /home/trip-ledger
npm ci
cp -n config/mysql.example.json config/mysql.json
vi config/mysql.json

API_HOST=127.0.0.1 API_PORT=5174 WEB_HOST=127.0.0.1 WEB_PORT=5173 npm run prod:start
```

停止服务：

```bash
cd /home/trip-ledger
npm run prod:stop
```

## nginx 示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /_next/static/ {
        alias /usr/share/nginx/html/trip-ledger/_next/static/;
        expires 30d;
        access_log off;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5174;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
