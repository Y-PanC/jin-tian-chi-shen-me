# 今天吃什么 · v1 测试与演示交付

当前分支 **v1**，对应固定版本 **1.0.0**。偏好引导、当顿问答、规则推荐和本机饮食记录原型。

| 分支 | 固定版本 | 重点 |
|---|---|---|
| [v1](https://github.com/Y-PanC/jin-tian-chi-shen-me/tree/v1) | 1.0.0 | 偏好引导、当顿问答、规则推荐和本机饮食记录原型 |
| [v2](https://github.com/Y-PanC/jin-tian-chi-shen-me/tree/v2) | 2.0.0 | 登录注册、Python 后端、账号隔离、饮食记录和自动照片识别 |
| [v3](https://github.com/Y-PanC/jin-tian-chi-shen-me/tree/v3) | 3.0.0 | 三步多选问答、分页推荐、真实菜式图、健康分和独立推荐依据页 |
| [v4](https://github.com/Y-PanC/jin-tian-chi-shen-me/tree/v4) | 4.0.0 | 星级健康指数、四维推荐依据、九档预算统一和已有记录真实配图 |

每个版本建议单独克隆到不同目录，使用独立账号和数据。`v4` 为包含最新合并修改的 v4.0 正式版。

## 快速运行

需要 Python 3；运行自动检查另需 Node.js 20 或更新版本。

```sh
git clone --branch v1 --single-branch https://github.com/Y-PanC/jin-tian-chi-shen-me.git today-food-v1
cd today-food-v1/release
python3 -m http.server 5174 --bind 127.0.0.1 --directory mobile-web/dist
```

打开 <http://127.0.0.1:5174/>。macOS 也可在 `release/` 双击 `启动本地预览.command`。本版为纯前端原型，资料和记录保存在浏览器中。

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
```

前端 19 项定版检查通过。原始结果见 `release/验证记录/` 或 `release/验证记录.txt`。

## 演示顺序

1. 完成首次偏好引导，返回首页
2. 完成问一问并查看推荐，修改本次条件后再次推荐
3. 新增一顿饮食记录，进入我的查看统计与口味画像
4. 刷新或重新进入页面，确认本机已保存的数据仍可读取

## 模型与演示数据

本版不依赖后端或模型配置。

菜品、商家、价格及评分按本版演示规则展示；真实菜式参考图片的来源和许可随资产保留。当前交付用于本地测试与汇报，公网环境按本版部署说明另行配置。

[完整版本说明](release/版本说明.md) · [项目资料](release/项目资料/)

## 定版预览

![v1 首页](release/预览图/首页.png)
