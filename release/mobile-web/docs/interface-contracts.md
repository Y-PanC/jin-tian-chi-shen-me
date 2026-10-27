# 页面与数据接口 · Web v2.0

原生 HTML/CSS/JS 前端与 Python/FastAPI 后端同源运行。入口为 `http://127.0.0.1:5173/`；未登录跳转登录页，页面模块在账号 state 读取成功后加载。配置说明和部署边界见 [backend.md](backend.md)。

## 页面

| 文件 | 行为 |
| --- | --- |
| `index.html` | 按登录状态及服务端长期档案分流 |
| `page_login.html` | 账号密码登录、注册；只允许返回本站已知页面 |
| `page0_home_old_user.html` | 首页、当前目标、问一问／记一顿入口、随机科普卡片 |
| `page1_guide.html` | 六项长期偏好；`?return=profile` 保存后返回我的 |
| `page2_ask.html` | 四项当顿选择；`?edit=1` 恢复本次答案 |
| `page3_result.html` | 三份规则推荐、换批、修改想法、选择菜品 |
| `page4_log.html` | 记录入口、最近饮食、横向年月日筛选 |
| `page4_meal.html` | 新增／查看／编辑；`?id=<id>` 编辑；`?from=result` 预填推荐 |
| `page5_profile.html` | 服务端累计统计、常吃食物、口味画像 |
| `page6_settings.html` | 昵称、展示 ID、输入开关、偏好修改、本机记录导入、退出 |
| `restart_guide.html` | 备份并重置账号偏好，可恢复；餐食不受影响 |

引导和问一问的步骤可点击切换，已填答案保留。默认偏好编辑入口集中于我的设置；当顿选择只保存于当前会话。选中推荐不表示吃过，保存餐食后才计入记录。

最近饮食卡片固定显示照片、用餐时间、菜名和标签区域，缺失值显示占位提示；独立备注按需展示。旧版编辑／推荐入口兼容跳转到详情页，详情返回保留日期筛选。

## API

API 前缀 `/api/v1/`。需要登录的接口使用 HttpOnly、SameSite=Strict 的会话 Cookie，前端不持有密钥或会话令牌。所有写入请求带 `X-Meal-Request: 1`，浏览器 Origin 必须同源。

| 方法与路径 | 请求／返回 |
| --- | --- |
| GET `health` | 服务标识、版本、照片识别是否配置；不返回供应商或密钥 |
| POST `auth/register`、`auth/login` | `{username,password}`；设置会话 Cookie |
| POST `auth/logout` | 注销当前会话 |
| GET `state?tz=Asia/Shanghai` | user、profile、settings、version、records、stats、knowledgeHistory、importKeys、capabilities |
| PUT `preferences` | `{profile?,settings?,expectedVersion}`；返回新档案与版本 |
| PUT `knowledge-history` | 当前用户科普卡片展示历史 |
| POST `meals` | `{record}`；稳定记录 ID 支持同内容幂等重试 |
| GET `meals/{id}` | 当前用户的单条记录 |
| PUT `meals/{id}` | `{record,expectedRevision}`；更新原记录 |
| DELETE `meals/{id}?revision=N` | 校验版本后删除当前用户记录 |
| GET `meals` | year/month/day、tz、offset、limit；返回 items、total、nextOffset |
| GET `stats?tz=...` | mealCount、dayCount、dishCounts 与 taste |
| POST `photos` | multipart：id 和 file；返回服务端照片元数据 |
| GET `photos/{id}` | 当前用户私有 JPEG 图片 |
| DELETE `photos/{id}` | 删除不再被餐食引用且未在识别中的暂存照片 |
| POST `recognitions` | `{photoIds:[...]}`；202 返回任务 id 与状态 |
| GET `recognitions/{id}` | queued/running/succeeded/failed、result、error |
| POST `import` | `{records:[...]}`；每批最多 200 条；返回 imported、skipped |

常用错误：401 登录过期，403 请求来源无效，404 不存在或无权访问，409 数据版本冲突或容量限制，413 请求过大，422 字段不合法，429 频率／额度限制，503 识别未配置。错误不回显输入、密钥或供应商原始响应。

## 服务端记录

记录保持前端 schemaVersion 3，主要字段：

```js
{
  id, revision, schemaVersion: 3,
  dishes: ['番茄炒蛋', '米饭'], dish, dish_name, text,
  tags: ['蔬菜', '蛋白质'], remarks: '',
  photos: [{id, name, mimeType, size, width, height}],
  eatenAt, loggedAt, timeZone, period, createdAt, updatedAt,
  inputMethod, source, originalText?
}
```

最多 8 道菜、每道 50 字、菜名总长 240 字；最多 12 个标签，每个 16 字；备注最多 1200 字；最多四张照片。照片源文件不超过 12 MiB，服务端缩放至最长边 1600px，并生成 JPEG 和权威元数据。记录不能引用其他用户或其他餐食的照片。

新增／编辑时间使用带时区的 ISO-8601，统一保存 UTC；日期筛选及统计按浏览器时区转换。无效或未来时间拒绝保存，表单保留。编辑 ID 与 createdAt 不变，revision 原子递增；重试新建使用固定草稿 ID，避免新增重复餐食。

识别返回 `{dishes:string[],tags:string[]}`。标签仅包含可见食物类别，不推断咸度、甜度等单项强度。照片上传后自动创建识别任务，结果填入可编辑表单；已有手写菜名和识别期间修改的字段保留。用户保存后才成为餐食数据。

## 统计

每条已保存记录计一餐；记录天数为有效用餐时间在请求时区内的自然日去重数。菜品种类去掉首尾空格后按菜名去重，同一餐的同名菜只计一次；常吃食物按包含该菜的餐数排序。

口味画像六轴为咸味（偏咸）、甜味（偏甜）、酸味（偏酸）、辣味（偏辣）、鲜味（鲜香）和油感（偏油）。每餐每轴最多计一次，比例为对应标签餐数／全部餐数。未记录的维度不推断强度。雷达图使用统一自适应显示范围，实际百分比不改变。

## 浏览器兼容与迁移

`assets/journal.js` 保留历史日志的规范化和本机读写适配，以便旧数据导入及兼容检查。正常登录页面读取 `MealCloud.state.records`，通过专用餐食 API 保存，不再把账号记录写入 `localStorage.meal_logs`。长期偏好和个人设置也从账号 state 读取。

旧 localStorage 的 `meal_logs`、`user_profile`、`user_settings` 和 IndexedDB `meal_journal_media_v2/photos` 保持原样。设置页通过明确操作导入真实记录与照片；虚构样例按来源／ID 排除，新账号不自动建立示例数据。导入按账号＋原记录 ID 去重，保留原文；没有日期的旧记录保持 null。

当前当顿答案、上批推荐、选中菜品以及按账号隔离的未保存表单草稿使用 sessionStorage。切换账号或退出时清理；正常刷新可恢复已上传的暂存照片和识别任务。识别任务的权威状态在后端。
