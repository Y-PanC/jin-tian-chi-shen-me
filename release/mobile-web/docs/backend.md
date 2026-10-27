# Web v2.0 后端与联调

## 运行方式

Python 3.11+；锁定依赖在 `backend/requirements.lock`。本地通过 `.venv/bin/python -m backend.run --no-browser` 启动，入口沿用 `http://127.0.0.1:5173/`，同一 FastAPI 服务提供 `dist/` 和 `/api/v1/`，不需要跨域配置。

本地数据库默认 SQLite，首次启动执行 Alembic 迁移。设置 `DATABASE_URL=postgresql+psycopg://...` 可使用 PostgreSQL。所有用户数据通过内部 UUID 关联；页面展示 ID 不参与认证。当前账号密码登录不提供自助找回密码，正式扩大使用范围前需补账号恢复流程。

## 后端配置

| 环境变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | 留空时使用 `.data/meals.sqlite3` |
| `MEDIA_ROOT` | 留空时使用 `.data/photos/` |
| `ALLOWED_HOSTS` | 逗号分隔的请求主机名，默认仅本机 |
| `COOKIE_SECURE` | 本机 HTTP 为 false；HTTPS 部署为 true |
| `OPENAI_BASE_URL` | OpenAI 兼容 API 的根地址，包含 `/v1` |
| `OPENAI_API_KEY` | 服务端 API 密钥 |
| `DASHSCOPE_API_KEY` | 百炼密钥，可替代 `OPENAI_API_KEY` |
| `VISION_MODEL` | 视觉模型名称 |
| `VISION_ENABLE_THINKING` | 是否发送 `enable_thinking: true`，默认 false |
| `VISION_TIMEOUT_SECONDS` | 单次识别超时，默认 30 秒；深度思考模型可设 120 |
| `VISION_DAILY_LIMIT` | 每个账号每日最多创建的识别任务数，默认 50，按北京时间重置 |

公开配置模板保持密钥为空。当前本机按用户提供的信息配置了百炼北京地域兼容接口和 `qwen3.8-max`；真实密钥只写入被忽略的 `.env`，权限为 600。服务不把密钥、供应商错误原文或模型思考过程返回前端。

识别使用 `AsyncOpenAI.chat.completions.create`，`stream=True`，输入为 `image_url` Base64 数据 URL；只收集 `delta.content` 并校验完成状态、JSON、菜名长度与允许标签。结构化响应不依赖供应商特有的 JSON Schema 参数。

## 业务边界

- 长期偏好保存在用户档案；当顿答案只在浏览器会话中使用，不改写长期偏好。
- 每次编辑携带 `expectedRevision`，后端原子比较版本；冲突返回 409。新建记录使用稳定草稿 ID，同内容重试返回原记录，避免网络异常导致重复餐食。
- 用餐时间必须带时区，后端统一保存 UTC；筛选、天数统计按请求时区换算。修改时间较早的餐食不会因为编辑操作变成上顿。
- 照片通过带会话的 API 读取。上传后服务端解码、限制像素、缩放、重编码 JPEG；保存时使用服务端元数据并验证归属。
- 模型输出是独立识别任务的结果，不自动新增或修改餐食。上传后自动识别并填入表单，可继续编辑；已有手写菜名和识别期间的字段修改保留，点击保存后才进入记录和统计。
- 未配置模型时识别接口返回 503，手动记录不受影响；供应商错误、超时、无食物及非法 JSON 都有可重试提示。
- 识别任务持久化为 queued/running/succeeded/failed；任务领取使用比较更新，进程中断后租约过期的任务标为可重试失败。每账号最多三个同时待处理任务，日额度使用数据库原子计数。
- 默认每账号照片空间为 250 MiB、记录容量为 10,000 餐。每小时清理七天未关联餐食且不参与识别的照片、三十天前完成的任务及过期会话；已保存餐食和照片不按此规则删除。
- 前端首期通过账号 state 获取记录，沿用原来的列表筛选和分页呈现；后端同时提供带年月日、时区和分页参数的列表 API。统计展示读取服务端计算结果。
- 推荐目前继续使用已有规则和示例菜品目录，不调用 LLM。

## 本机数据导入

登录后旧 `localStorage` 和 IndexedDB 不覆盖、不清空。设置页提供主动导入入口，上传旧照片并将记录送入后端。每条记录保留原文和用餐时间；缺失日期保持 null。旧版示例默认按来源与 ID 排除，用户主动勾选后可一并导入，原始来源保存在 `originalSource`。请求携带 `expectedUserId` 核对目标账号，账号切换时停止导入；后端按账号和原记录 ID 去重，批次失败会回滚该批记录。

未完成的照片上传可能形成暂存文件，由清理任务回收；源浏览器数据不因上传或导入失败被删除。登录、切换账号或退出时清理当顿会话和表单草稿。识别与餐食草稿只在当前标签页按账号保存，刷新后可恢复。

## 部署文件

`Dockerfile` 与 `compose.yaml` 提供 Web + PostgreSQL，数据库和照片使用独立持久卷；Web 端口默认只映射本机 `127.0.0.1:8000`。部署前设置 `.env` 中的 `POSTGRES_PASSWORD`（URL 安全字符）、`ALLOWED_HOSTS` 和模型参数。Compose 将 Cookie 设置为 Secure，需在 HTTPS 反向代理后使用。

反向代理应传递 Host 与 X-Forwarded-Proto；通过 Uvicorn 的 `FORWARDED_ALLOW_IPS` 指定实际代理 IP。不要向非可信来源开放代理头信任。部署后验证登录 Cookie、跨来源写入拒绝、照片鉴权及模型连通性。当前电脑 Docker daemon 未运行；已验证 PostgreSQL 表结构编译，容器和 PostgreSQL 的实际运行需在有容器服务的环境中完成。

容器构建仅复制 `backend/`、`dist/` 和依赖清单；`.dockerignore` 排除 `.env`、`.data`、虚拟环境和历史发布元数据。版本归档同样排除这些内容。

### 备份

本地备份时先停止应用，再将 `.data/meals.sqlite3` 与 `.data/photos/` 一起备份；停止后确认 WAL 已检查点合并，必要时使用 SQLite backup API 创建数据库副本。不要只复制运行中的 SQLite 主文件。恢复时同时恢复数据库和照片，保留一致的标识。

PostgreSQL 使用 `pg_dump` 备份数据库，并备份照片卷；恢复验证账号登录、随机餐食详情、照片读取和累计统计。模型配置单独保管，不打进源码归档。

## 验证记录

自动检查包括前端规则与云适配、后端多用户隔离、会话与来源校验、餐食版本冲突、幂等新建、时间筛选、统计、照片校验与鉴权、迁移去重、识别额度、SDK 流式返回和暂存清理。

本机百炼实测通过生成的纯色非食物图片验证输入与 JSON；浏览器隔离测试账号另外完成公开授权餐食照片识别、确认保存、列表读取和画像统计链路。

餐食联调照片：[Tomato and eggs.JPG](https://commons.wikimedia.org/wiki/File:Tomato_and_eggs.JPG)，作者 Godofnanjing，许可 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。仅用于临时测试数据库，上传时缩放和重编码；不作为产品默认餐食或用户样例。

参考：[OpenAI Python SDK](https://developers.openai.com/api/reference/python)、[百炼 qwen3.8-max](https://help.aliyun.com/zh/model-studio/qwen3-8-max)、[百炼 OpenAI 兼容 Chat](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)。
