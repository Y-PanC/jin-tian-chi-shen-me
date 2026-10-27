# 菜品照片与来源

- `web-r01.jpg` 至 `web-r50.jpg`（r11 为 PNG）：从 Wikimedia Commons 公开文件页查找并下载的真实菜品照片。每张照片的源页面、作者、许可、对应参考菜式和本地路径见 `credits.json`，菜单内也保留这些字段供卡片显示。
- `clams-steamed-egg.jpg`、`spicy-blood-curd.jpg`、`lamb-radish-soup.jpg`、`pizza.jpg`、`chrysanthemum-greens.jpg`、`coconut-chicken.jpg`：从用户提供的《今天吃什么-v3.0文档.xlsx》“C组 1023 v1”L3:L8 对应的内嵌图片提取，按原顺序对应六道菜，未改动。
- `unavailable.svg`：图片读取失败时的占位图。

网络照片均为真实菜式参考照片，不代表示例店铺实拍，也不作为菜品配料依据；相近菜式的差异通过 `imageReferenceDish` 和 `imageAlt` 说明。图片采用来源站提供的缩略图，页面按卡片比例裁切，未改变内容。请在展示或再分发时保留每张图片的作者、来源页和许可链接。

全部图片通过本地相对路径加载。
