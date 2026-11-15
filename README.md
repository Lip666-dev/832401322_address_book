# 通讯录 · Address Book

EE308FZ 软件工程 / 2601_FZU-MU_SE 极限编程作业 —— 一对程序员合作完成的通讯录应用。

- 队长：于承昊（832401322）
- 队友：张鑫宇（832401324）
- 技术栈：原生 HTML + CSS + JavaScript，无框架、无构建步骤；Excel 读写用本地打包的 [SheetJS](https://sheetjs.com/)（`vendor/xlsx.full.min.js`）
- 数据存储：浏览器 `localStorage`（单机版，刷新不丢）

## 1. 功能清单（对应作业评分点）

| 作业要求 | 本仓库实现 | 分值 |
| --- | --- | ---: |
| 收藏联系人 | 卡片右上角星标一键收藏 / 取消；左侧「收藏」视图；收藏卡片金色边框 + 「已收藏」角标；收藏数实时统计 | 25 |
| 多种联系方式 | 一个联系人任意多条联系方式，类型覆盖手机 / 座机 / 邮箱 / 微信 / QQ / 微博 / 地址 / 其他；每条可加备注（工作、家庭…）并指定「主要」联系方式；列表按类型配图标，点击即可复制 | 10 |
| Excel 导出 | 一个联系人一行，基础信息各占一列，联系方式按 `联系方式1类型 / 号码 / 备注` 展开，列数随最多联系方式自动扩展；附带「字段说明」工作表；表头冻结、自动筛选、列宽已调整 | 25 |
| Excel 导入 | 识别表头文字自动映射字段；兼容本应用导出的宽表，也兼容「姓名 / 手机 / 邮箱 / 微信 / 地址」这类普通表格；支持 `.xlsx` `.xls` `.csv`；导入前预览新增 / 合并 / 跳过 / 无效行；三种重复处理策略；逐行错误提示 | 25 |
| 页面样式 | 卡片式布局、分组 / 标签筛选、拼音排序、搜索高亮提示、空状态、Toast 提示、响应式（窄屏自动单列） | 10 |

另外还有一些顺手做的小功能：删除可撤销、示例数据可一键恢复、`Ctrl + K` 聚焦搜索、导入模板下载。

## 2. 快速开始

三种方式任选一种，都不需要安装依赖：

```bash
# 方式一：Python 标准库起一个本地服务器（推荐，端口 8021）
python serve.py

# 方式二：Windows 直接双击
start.bat

# 方式三：任意静态服务器
npx serve .        # 或 VS Code Live Server
```

浏览器打开 <http://127.0.0.1:8021/> 即可。**直接双击 `index.html` 也能用**（脚本全部是普通 `<script>`，不依赖模块加载）。

要求 Python 3.8+；如果机器上没有 Python，任意静态服务器都行，因为整个应用是纯前端。

## 3. 目录结构

```text
address-book/
├── index.html                 # 页面骨架（列表、编辑弹窗、导入弹窗）
├── assets/
│   ├── css/app.css            # 全部样式（设计变量、响应式、打印样式）
│   └── js/
│       ├── model.js           # 数据模型：类型表、规整、校验、排序、判重
│       ├── store.js           # 存取层：localStorage、示例数据、分组/标签查询
│       ├── excel.js           # Excel 宽表导出 / 表头识别 / 导入 / 三种合并策略
│       └── app.js             # 界面控制：渲染、筛选、弹窗、收藏、导入导出流程
├── vendor/xlsx.full.min.js    # SheetJS 0.18.5（本地打包，离线可用）
├── samples/                   # 导入示例文件（普通表格格式）
├── tests/                     # Node 单元测试（无第三方依赖）
│   ├── model.test.mjs
│   └── excel_roundtrip.mjs
├── docs/
│   ├── design.md              # 实现设计说明（结构、数据模型、算法与取舍）
│   ├── codestyle.md           # 代码规范
│   └── test-report.md         # 测试报告（自动化 + 手工）
├── serve.py                   # 本地静态服务器
└── start.bat                  # Windows 启动脚本
```

## 4. Excel 格式

导出的文件长这样（`联系人` + `字段说明` 两个工作表）：

| 姓名 | 公司/部门 | 分组 | 标签 | 收藏 | 备注 | 联系方式1类型 | 联系方式1号码 | 联系方式1备注 | 联系方式2类型 | … |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 张鑫宇 | 福州大学 | 同学 | 队友, EE308FZ | 是 | 组长 | 手机 | 138 0013 8000 | 常用 | 邮箱 | … |

- **一个联系人占一行**，联系方式从第 1 组开始向右排列，最多的一组决定有多少列（至少 3 组，方便手工补录）。
- `收藏` 列认「是 / 否」「true / false」「1 / 0」，留空视为否。
- 类型列认中英文：手机 / mobile、邮箱 / email、微信 / wechat、地址 / address …
- 导入时按**表头文字**识别，不依赖列顺序：列叫「手机号」「Phone」都能认出来；列叫「姓名」的那一列必须有。
- 同名联系人：同一个文件里重名自动并成一条；与已有联系人重名时按选择的策略处理（合并 / 跳过 / 覆盖）。

## 5. 测试

```bash
node tests/model.test.mjs          # 10 个用例：校验、规整、类型识别、排序、判重
node tests/excel_roundtrip.mjs     # 10 个用例：宽表结构、导出→读回、普通表格兼容、脏数据、三种策略
```

两套用例共 20 个，全部通过；`excel_roundtrip.mjs` 会把导出的文件真的写进 `_verification/downloads/roundtrip.xlsx`，可以用 Excel / WPS / openpyxl 打开验证。详细结果见 [docs/test-report.md](docs/test-report.md)。

## 6. 部署

应用是纯静态站点，任何静态托管都能跑：

| 方式 | 做法 |
| --- | --- |
| 云服务器（可选，本次未部署） | `bash deploy/deploy.sh root@<server>` 一键上传，用 Nginx 或 `PORT=8081 python serve.py` 起服务，见 `deploy/README.md` |
| GitHub Pages | 仓库 Settings → Pages → Source 选 `main` / 根目录 |
| 本地演示 | `python serve.py` |

## 7. 已知限制

- 单机版：数据存在浏览器 `localStorage`，换浏览器 / 清缓存会丢；跨设备同步需要通过 Excel 导入导出。
- 只做了表格的导入导出，没有做整库 JSON 备份（导出 xlsx 已覆盖这个需求）。
- 联系方式类型是固定枚举 + 「其他」，不支持用户自定义新类型。

## 8. 团队协作

- 代码规范：[docs/codestyle.md](docs/codestyle.md)
- 实现设计：[docs/design.md](docs/design.md)
- 测试报告：[docs/test-report.md](docs/test-report.md)
- 作业博客：`blog/`（含截图、演示视频、PSP 表、分工与贡献比）

## 9. 版本与发布

- **v1.0.0**（2026-11-15）：收藏、多联系方式、Excel 导入导出三项功能完成，21 个自动化用例全部通过，界面在 Edge 157 上实测。
- 演示视频：[docs/media/address-book-demo.mp4](docs/media/address-book-demo.mp4)（约 27 秒）。
- 仓库：<https://github.com/Lip666-dev/832401322_address_book>
