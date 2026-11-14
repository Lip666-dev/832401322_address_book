# 代码规范（Code Standards）

本文件是两人协作的约定，写代码之前先定下来，Review 时按它逐条检查。
仓库地址：<https://github.com/Lip666-dev/832401322_address_book>

## 1. 总体约定

1. **不引入构建步骤**：交付的四个 JS 文件必须是「直接丢进浏览器就能跑」的普通脚本，评审老师 `clone` 下来双击 `index.html` 就能用。
2. **分层不越界**：
   - `model.js` 不碰 DOM、不碰存储，只做纯函数；
   - `store.js` 只管读写与查询，不含界面逻辑；
   - `excel.js` 只管表格编解码，通过参数接收 `XLSX`，方便在 Node 里测试；
   - `app.js` 只做 DOM 与交互。
3. **注释用中文，标识符用英文**：注释解释「为什么」，不复述「这行在干什么」。
4. 新增文件前先想清楚是否真的需要；本作业四个 JS 文件已经是上限。

## 2. 命名

| 对象 | 规则 | 例子 |
| --- | --- | --- |
| 文件 / 目录 | 小写 + 短横线（文档可用下划线） | `app.css`、`excel.js`、`test-report.md` |
| 变量 / 函数 | 小驼峰 | `contactList`、`normalizeContact`、`toggleBookmark` |
| 构造函数 / 类 | 大驼峰 | `Browser`（工具脚本里） |
| 常量 | 全大写下划线 | `STORAGE_KEY`、`BASE_FIELDS`、`METHOD_TYPES` |
| DOM id | 小驼峰，动词开头表示按钮 | `btn-import`、`method-rows`、`import-preview` |
| CSS 类 | 小写 + 短横线，状态用 `is-` / `has-` 前缀 | `card`、`is-bookmarked`、`is-active` |

禁止拼音缩写（`lianxiren`、`lxfs`），禁止单字母变量（循环下标 `i` 除外）。

## 3. JavaScript

- **风格**：ES5 语法为主（`var` + `function`），因为脚本要能在老浏览器和 Node 里直接 `require`。箭头函数、模板字符串只在工具脚本（`_verification/`）里用。
- **严格模式**：每个文件顶部 `'use strict';`，模块用 IIFE 包裹，只向全局暴露一个命名空间：

  ```js
  (function (root) {
    'use strict';
    // ...
    root.AddressBookModel = api;
  }(typeof globalThis !== 'undefined' ? globalThis : this));
  ```

- **分号**：语句结尾必须写；缩进 2 空格；单行不超过 110 字符。
- **字符串**：统一单引号，需要插值时才用拼接；不要用 `eval`、`with`。
- **相等比较**：只用 `===` / `!==`。
- **错误处理**：可能抛异常的地方（`JSON.parse`、`localStorage`、`FileReader`、`XLSX.read`）必须 `try/catch`，并且给用户一个能看懂的中文提示，不能把原始异常直接弹给用户。
- **DOM 安全**：拼接 HTML 时必须经过 `esc()` 转义，禁止把用户输入直接塞进 `innerHTML`。
- **事件**：列表用事件委托（`#list` 上监听 `data-action`），不在每个卡片上绑一堆监听器。

## 4. CSS

- 颜色、圆角、阴影统一走 `:root` 里的 CSS 变量，不在选择器里写死 `#4f46e5` 这种色值。
- 类名按「块-元素-状态」组织，同类元素不重复定义样式。
- 组件样式写在对应区块注释下（`/* ---------- 联系人卡片 ---------- */`）。
- 必须验证三个宽度：1440 / 1024 / 390（手机）。
- 动效统一 150–200ms，`prefers-reduced-motion` 下自动关闭。

## 5. Excel 格式契约

调用方只依赖这三点，改动时 CP 双方都要知道：

1. 工作表名：`联系人`（导入时优先取名为「联系人」的表，否则找第一个能识别出表头的表）。
2. 基础列：`姓名`（必填）、`公司/部门`、`分组`、`标签`、`收藏`、`备注`。
3. 联系方式列：`联系方式N类型` / `联系方式N号码` / `联系方式N备注`，`N` 从 1 开始连续；导出时列数 = max(3, 最多联系方式数)。

## 6. Git 协作

- 分支：`main` 保护，功能在 `feature/<功能>` 分支上做，通过 PR 合并。
- 提交信息：`<type>: <做了什么>`，type ∈ `feat` / `fix` / `docs` / `test` / `style` / `chore`。
  - 例：`feat: star contacts and add a bookmarked view`
  - 例：`test: cover excel round trip and merge strategies`
- 一个提交只做一件事；提交前必须自测通过（`node tests/*.mjs`），不允许提交「跑不起来」的中间状态。
- 冲突处理：先 `git pull --rebase`，冲突解决后必须重跑测试，并在 PR 描述里说明改了哪些文件。

## 7. Review 检查清单

- [ ] 功能是否真的能点通（不是只看代码）
- [ ] 手机宽度下布局是否正常
- [ ] 用户输入是否都做了转义与校验
- [ ] 新增的 Excel 表头是否同步更新了 `docs/codestyle.md` 与导入映射
- [ ] 测试是否仍然全绿；新功能是否补了用例
- [ ] 注释里的中英文是否通顺、有没有错别字
