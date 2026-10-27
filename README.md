# 今天吃什么 · v4 测试与演示交付

当前分支 **v4**，对应固定版本 **4.0.0**。星级健康指数、四维推荐依据、九档预算统一和已有记录真实配图。

| 分支 | 固定版本 | 重点 |
|---|---|---|
| [v1](https://github.com/Y-PanC/jin-tian-chi-shen-me/tree/v1) | 1.0.0 | 偏好引导、当顿问答、规则推荐和本机饮食记录原型 |
| [v2](https://github.com/Y-PanC/jin-tian-chi-shen-me/tree/v2) | 2.0.0 | 登录注册、Python 后端、账号隔离、饮食记录和自动照片识别 |
| [v3](https://github.com/Y-PanC/jin-tian-chi-shen-me/tree/v3) | 3.0.0 | 三步多选问答、分页推荐、真实菜式图、健康分和独立推荐依据页 |
| [v4](https://github.com/Y-PanC/jin-tian-chi-shen-me/tree/v4) | 4.0.0 | 星级健康指数、四维推荐依据、九档预算统一和已有记录真实配图 |

每个版本建议单独克隆到不同目录，使用独立账号和数据。`v4` 为包含最新合并修改的 v4.0 正式版。

## 快速运行

需要 Python 3.11 或更新版本；运行前端自动检查另需 Node.js 20 或更新版本。

```sh
git clone --branch v4 --single-branch https://github.com/Y-PanC/jin-tian-chi-shen-me.git today-food-v4
cd today-food-v4/release/mobile-web
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.lock
.venv/bin/python -m backend.run --port 5177
```

打开 <http://127.0.0.1:5177/>，保持服务进程运行。macOS 可改为在 `release/` 先双击 `安装后端依赖.command`，再双击 `启动本地预览.command`。Windows 在上述命令中将 `.venv/bin/python` 替换为 `.venv\Scripts\python.exe`，并使用本机 Python 启动命令创建环境。

使用 HTTP 入口打开，保持完整目录结构。请勿直接双击源码 HTML，也不要将 v2～v4 作为纯静态网页运行。

## 文件位置

| 路径 | 内容 |
|---|---|
| `release/mobile-web/dist/` | 本版前端页面、脚本、本地数据与图片资产 |
| `release/mobile-web/backend/` | Python 后端、迁移和依赖（v2～v4） |
| `release/mobile-web/tests/` | 前端自动检查 |
| `release/项目资料/` | 方案工作簿、设计资料（以本版实际文件为准） |
| `release/版本说明.md` | 完整固定范围、历史说明与恢复方法 |
| `release/MANIFEST.json` | 原始逐文件 SHA-256 清单 |
| `release/SOURCE_COMMIT.txt` | 原开发仓库定版源码提交号 |

`release/` 完整保留本版固定资产文件内容；GitHub 分支增加交付说明，分支提交号与原开发仓库的源码提交号各自独立。原版本说明中提到的历史标签属于原开发仓库。

## 测试

从仓库根目录执行完整性校验：

```sh
python3 release/校验版本.py
```

从仓库根目录执行自动检查：

```sh
cd release/mobile-web
node --test tests/*.test.mjs
.venv/bin/python -m pytest backend/tests -q
```

前端 100 项、后端 28 项定版检查通过。原始结果见 `release/验证记录/` 或 `release/验证记录.txt`。

## 演示顺序

1. 注册测试账号并登录，设置饮食偏好
2. 检查九档预算、“不限类别”底部整行、健康指数半星展示，以及四维推荐依据；从推荐进入记录，确认菜名、标签和图片带入
3. 新增、编辑餐食，检查菜名、照片、标签、用餐时间和备注的保存
4. 进入我的及设置，检查统计、偏好保存以及退出登录
5. 如需展示旧记录，在设置中主动导入自己的浏览器记录；新账号默认从空记录开始

## 模型与演示数据

基础推荐、记录和统计无需模型配置。需要演示真实照片识别时，将 `release/mobile-web/.env.example` 复制为同目录 `.env`，按 [后端配置说明](release/mobile-web/docs/backend.md) 填写自己的接口地址、模型名和密钥。没有配置时仍可手动记录，识别功能会提示不可用。

账号和照片保存在各自克隆目录的 `release/mobile-web/.data/`。新账号没有个人历史记录；本仓库不附带账号数据库、私人照片或真实密钥。多个版本同时演示时使用不同浏览器配置文件，避免同名登录 Cookie 互相覆盖。

菜品、商家、价格及评分按本版演示规则展示；真实菜式参考图片的来源和许可随资产保留。当前交付用于本地测试与汇报，公网环境按本版部署说明另行配置。

[完整版本说明](release/版本说明.md) · [项目资料](release/项目资料/)
