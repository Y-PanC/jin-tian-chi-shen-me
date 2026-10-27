# 第七版虚构样例来源

样例原文件为用户提供的「今天吃什么_VibeCoding原型_第七版_可携包/data/meal-seed-v3.js」。本项目保留这 30 条虚构日记的原文、菜品标识和来源标记，用于还原记一顿及我的页面。

记录覆盖约 15 天的早餐、午餐与晚餐，涉及校园食堂和外卖场景。每条使用相对日期 daysAgo、hour、minute 在首次初始化时生成本机日期，source 固定为 `fictional-mixed-dining-sample`。它们仅用于原型演示，不代表任何人的真实饮食、订单或访谈事实。

原包的 28 条候选菜数据及其商户、SKU、价格线索没有替换本项目的推荐菜单。推荐继续读取 `dist/assets/data/menu.json` 与 `decision-table.json` 的演示数据。

初始化由 `MealJournal.seedStarter()` 统一完成，只面向没有 meal_logs、没有初始化或清空标记的浏览器。已有记录保持原样，清空后不会重新生成。记一顿和我的都显示当前虚构示例餐数。
