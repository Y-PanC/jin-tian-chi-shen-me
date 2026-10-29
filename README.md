# 今天吃什么 · v4 测试与演示交付

当前分支 **v4**，功能基础版本 **4.0.0**，部署修订 **4.0.0+deploy.2**（2026-10-29）。

## 正常启动

正常启动 Python 后端就会自动准备好以下账号及历史记录：

| 项目 | 内容 |
|---|---|
| 账号 | `Yunzhong`，登录不区分大小写 |
| 密码 | `1234567890` |
| 历史记录 | 33 餐、16 天、28 种菜品，包含菜名、标签、时间、备注及个人偏好 |
| 页面 | “记一顿 → 最近饮食”和“我的”会直接读取已有记录 |

初始化只执行一次，重启保留编辑、新增和删除。其他注册账号仍从空记录开始，互相隔离。

需要 Python 3.11+。macOS/Linux：

```sh
git clone --branch v4 --single-branch https://github.com/Y-PanC/jin-tian-chi-shen-me.git today-food-v4
cd today-food-v4/release/mobile-web
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.lock
.venv/bin/python -m backend.run
```

Windows PowerShell：

```powershell
git clone --branch v4 --single-branch https://github.com/Y-PanC/jin-tian-chi-shen-me.git today-food-v4
cd today-food-v4/release/mobile-web
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock
.\.venv\Scripts\python.exe -m backend.run
```

打开 <http://127.0.0.1:5177/page_login.html>，使用 `Yunzhong / 1234567890` 登录。首次安装也可在 `release/` 中双击“安装后端依赖.command”，之后双击“启动本地预览.command”。服务窗口保持打开。

从旧版本更新时，先关闭旧服务、拉取 v4 最新代码，再运行上述正常启动命令。旧版单独入口生成的 `.demo-data/`，在新目录尚无数据库且没有另行指定数据库地址时，会自动复制到统一目录；原文件保留。已有其他账号不会被覆盖。已有 Yunzhong 及其记录、密码和个性设置会保留；尚未初始化且为空的 Yunzhong 会补入历史记录。

## Docker

在仓库根目录：

```sh
cp release/mobile-web/.env.example release/mobile-web/.env
docker compose up --build -d
```

如果 `.env` 已存在，保留现有配置即可。Docker 和 Python 都调用相同的 `backend.app:create_app`，自动初始化同一个演示数据集。打开 <http://127.0.0.1:5177/page_login.html>。数据库和照片保存在持久卷，容器重启后保留。

根目录 Compose 保留上一版的 `demo-data` 卷名，以复用已有容器数据。在 `release/mobile-web/` 内使用 Compose 同样支持正常初始化；需要 PostgreSQL 时使用该目录的 `compose.postgres.yaml`，按 [后端部署说明](release/mobile-web/docs/backend.md) 配置数据库密码、域名、HTTPS 和代理。

本次 Python 启动、登录、记录和初始化检查已实测；Docker Compose 配置检查通过，镜像构建和容器运行尚未实测。

## 配置和存储

- Python 默认存储：`release/mobile-web/.data/meals.sqlite3` 与 `.data/photos/`
- 配置文件：`release/mobile-web/.env`，可由同目录 `.env.example` 复制
- 演示数据源：`release/mobile-web/backend/data/demo-account.json`
- 初始化逻辑：`release/mobile-web/backend/demo_seed.py`，数据库迁移后自动执行
- 如明确不需要公开演示账号，可配置 `SEED_DEMO_ACCOUNT=false`；已存在的数据不受影响

基础推荐、手动记录和统计无需模型配置。照片识别需在 `.env` 中填入自己的 OpenAI 兼容接口地址、模型名和密钥。真实密钥、数据库、会话和私人照片不上传到 GitHub。

对外部署应设置 `ALLOWED_HOSTS` 为实际域名或 IP，HTTPS 使用 `COOKIE_SECURE=true`。本机 HTTP 保持 false。GitHub Pages 只能运行静态页面，完整应用需要 Python 后端。

## 检查

从仓库根目录校验交付文件：

```sh
python3 release/校验版本.py
```

从 `release/mobile-web/` 检查后端：

```sh
.venv/bin/python -m pytest backend/tests -q
```

本次聚焦启动、账号初始化、迁移和数据保留，未重复检查未改动的前端。功能基础版本定版时前端 100 项、后端 28 项通过，记录保留在 `release/验证记录/`。

## 演示顺序

1. 正常启动，使用 Yunzhong 登录并进入首页
2. 打开“记一顿 → 最近饮食”，查看已有记录、标签、时间和备注
3. 打开“我的”，查看 33 餐、16 天、28 种菜品、常吃食物 Top 3 和六维口味画像
4. 通过问一问的类别多选、预算和配送时间查看推荐及二级依据；从“选这份”进入记一顿
5. 新增、编辑或删除记录，重启后确认修改保留

<img src="docs/yunzhong-preview.jpg" width="300" alt="Yunzhong 档案：33 餐、16 天、28 种菜品">

## 版本与文件

| 分支 | 功能基础版本 | 重点 |
|---|---|---|
| [v1](https://github.com/Y-PanC/jin-tian-chi-shen-me/tree/v1) | 1.0.0 | 前端偏好、问答、推荐与记录原型 |
| [v2](https://github.com/Y-PanC/jin-tian-chi-shen-me/tree/v2) | 2.0.0 | 登录、后端、多用户隔离和照片识别 |
| [v3](https://github.com/Y-PanC/jin-tian-chi-shen-me/tree/v3) | 3.0.0 | 三步问答、分页、真实图片和独立推荐依据 |
| [v4](https://github.com/Y-PanC/jin-tian-chi-shen-me/tree/v4) | 4.0.0 | 星级健康指数、四维推荐依据、统一预算及本次统一启动 |

`release/mobile-web/` 为可部署源码，`release/项目资料/` 为方案资料。v4 分支本次直接接入正常启动，交付修订见 `DELIVERY_VERSION`；本地原定版归档和标签保持原样。`release/MANIFEST.json` 校验当前交付文件，原定版清单保留于 `docs/v4.0.0-original-manifest.json`，原基础源码提交仍记录在 `release/SOURCE_COMMIT.txt`。

[部署说明](release/部署说明.md) · [部署修订记录](docs/v4-startup-20261029.md) · [项目资料](release/项目资料/)
