# 页面与数据接口

纯前端手机 Web 演示版，没有服务端写入、账号服务、AI 调用、定位或下单。

## 页面

| 文件 | 行为 |
| --- | --- |
| `index.html` | 按本机长期档案分流 |
| `page0_home_old_user.html` | 首页、当前目标及可随机换批的横向健康饮食科普卡片 |
| `page1_guide.html` | 六项长期饮食偏好，新手保存后进入首页；`?return=profile` 保存后返回我的 |
| `page2_ask.html` | 当顿偏好，`?edit=1` 恢复本次选择 |
| `page3_result.html` | 推荐、换一批、修改想法、选择菜品 |
| `page4_log.html` | 文字记录、照片预览、听写提示、最近饮食及日期时间轴 |
| `page5_profile.html` | 总餐数、用餐时间、常吃菜品、口味雷达图 |
| `page6_settings.html` | 昵称、手机号、输入入口开关及长期偏好编辑入口 |
| `restart_guide.html` | 备份当前偏好后重新开始引导，并提供恢复入口 |

个人档案与问一问的顶部步骤可点击切换，当前页面中已填写的答案在切换时保留。

默认偏好编辑入口集中在“我的 → 基本设置”。问一问只改变本次选择，题目下统一标注“仅用于本次”；口味与忌口题目明确标注“（多选）”，“其他”选中后直接显示输入框。

`page4_log.html?from=result` 预填选中推荐，用户点击记录后保存；`?edit=<id>` 修改原记录，保留 id 和原用餐时间。新增文字可包含月/日、昨天/前天及 HH:mm；无时间取当前本机时间。无效或未来时间显示错误，保留输入。

## 存储职责

| 位置 | 键 | 内容／维护方 |
| --- | --- | --- |
| localStorage | `user_profile` | 目标、口味、忌口、辣度、预算、饭量；引导页维护 |
| localStorage | `user_settings` | nickname、phone、photoInputEnabled、voiceInputEnabled；设置页维护并合并既有字段 |
| localStorage | `meal_logs` | 全站唯一饮食记录数组；记一顿写入，画像、首页和推荐读取 |
| localStorage | `meal_logs_starter_v14` | 虚构样例初始化／清空标记 |
| localStorage | `knowledge_card_history_v1` | 科普卡片本轮已展示内容及上一批内容 |
| localStorage | `onboarding_restart_backup` | 重新开始引导前的偏好及临时选择备份 |
| sessionStorage | `meal_request` | 当前问答答案及档案快照 |
| sessionStorage | `last_recommendation` | 上一批推荐 |
| sessionStorage | `selected_meal` | 选中但尚未记录的菜品；保存后移除 |

长期偏好与个人资料具有不同字段和维护页面，不互相复制。退出本地资料只清空 nickname/phone，保留偏好与记录。

## 饮食记录兼容层

`assets/journal.js` 导出 `MealJournal`，统一读写和解析：

```js
import { MealJournal as J } from './journal.js';
const logs = J.read();
const parsed = J.analyze(logs[0].text, logs[0].loggedAt);
// parsed: { items: string[], tastes: string[], period: string | null }
J.write(logs); // 读、修改、写回完整数组
```

读取兼容两种现有 schema，不会仅因读取而改写存储：

```js
// 第七版原型
{ id, text, loggedAt, inputMethod, dish_name?, item_id?, source? }
// 原项目
{ id, dish, tags, period, eatenAt, createdAt?, updatedAt?, source?, shop?, price?, category? }
```

规范化后同时提供 text/dish、loggedAt/eatenAt、inputMethod、tags、period。时间统一为 ISO-8601，在本机时区显示；缺失时间保留 null。原文不被菜名替代，现有 tags 数组优先于关键词推断，附加字段及来源保留。新手工记录以原文推断菜名与口味，属于原型关键词规则。存储损坏或写入失败时保留原数据，并向用户报错。

`assets/services.js` 的 `readLogs()` 也读取这一层，供首页及推荐使用。`recommendMeals(request, previousIds)` 及 `logMeal({type,text})` 仍为可替换的演示适配器。

## 样例与画像

记一顿及我的仅在 meal_logs 从未存在、无初始化或清空标记时载入 `assets/data/meal-seed-v3.js` 的 30 餐虚构样例。已有非空记录、显式空数组、损坏存储均不覆盖；清空后不重建。界面显示虚构样例餐数。

常吃菜品优先使用样例 dish_name，否则从记录原文提取。口味图读取记录的标签；第七版没有 tags 的记录由共享关键词规则补齐。用餐时间范围来自记录时间戳：早餐 06:00–09:59、午餐 10:00–14:59、下午茶 15:00–16:59、晚餐 17:00–21:59，其余为夜宵。

照片仅作临时预览，不保存图片；麦克风入口仅提示设备听写，网页不录音，也不进行图像识别。
