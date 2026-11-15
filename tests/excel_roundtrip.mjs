/**
 * Excel 导入 / 导出 往返测试（只用 Node 内置模块，无第三方测试框架）。
 *
 *   node tests/excel_roundtrip.mjs
 *
 * 覆盖：宽表结构、导出→读回→解析的内容一致性、普通表格兼容、文件内重名合并、
 *       缺姓名行的处理、三种重复策略、联系方式超过 3 条时的列扩展。
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const XLSX = require(path.join(root, 'vendor', 'xlsx.full.min.js'));
const Model = require(path.join(root, 'assets', 'js', 'model.js'));
const Excel = require(path.join(root, 'assets', 'js', 'excel.js'));

let passed = 0;
const failures = [];

function check(name, callback) {
  try {
    callback();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  FAIL ${name}\n       ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) { throw new Error(message); }
}

function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) { throw new Error(`${message || 'values differ'}\n       actual:   ${a}\n       expected: ${b}`); }
}

function sampleContacts() {
  return [
    Model.normalizeContact({
      name: '张鑫宇', company: '福州大学', group: '同学', tags: ['队友', 'EE308FZ'],
      bookmarked: true, note: '组长',
      methods: [
        { type: 'mobile', value: '138 0013 8000', label: '常用', primary: true },
        { type: 'wechat', value: 'zxy_2004' },
        { type: 'email', value: '832401324@fzu.edu.cn', label: '学校邮箱' },
        { type: 'address', value: '福州大学 3 号楼 512', label: '宿舍' }
      ]
    }),
    Model.normalizeContact({
      name: '王建国', company: '福州大学 软件工程系', group: '老师', tags: ['课程教师'],
      bookmarked: false, methods: [{ type: 'phone', value: '0591-2286 6120', label: '办公室' }]
    }),
    Model.normalizeContact({
      name: 'Anna Lee', company: 'FZU Lab', group: '同事', tags: [], bookmarked: false,
      methods: [
        { type: 'email', value: 'anna@example.com', primary: true },
        { type: 'mobile', value: '+86 139 0000 1111' }
      ]
    })
  ];
}

console.log('Excel 导入导出测试');

/* 1. 宽表结构 */
check('宽表：一人一行，列数随最多联系方式扩展', () => {
  const contacts = sampleContacts();
  const table = Excel.buildTable(contacts);
  assert(table.maxMethods === 4, `maxMethods should be 4, got ${table.maxMethods}`);
  assert(table.rows.length === contacts.length, 'one row per contact');
  table.rows.forEach((row) => equal(row.length, table.headers.length, 'row width equals header width'));
  equal(table.headers.slice(0, 6), ['姓名', '公司/部门', '分组', '标签', '收藏', '备注']);
  equal(table.headers.slice(6, 9), ['联系方式1类型', '联系方式1号码', '联系方式1备注']);
  equal(table.headers[table.headers.length - 1], '联系方式4备注');
});

/* 2. 导出 → 读回 → 解析，内容一致 */
check('往返：导出 xlsx 再导入，姓名/分组/联系方式完全一致', () => {
  const contacts = sampleContacts();
  const workbook = Excel.exportWorkbook(XLSX, contacts);
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  // 真的落盘一次，外部工具（openpyxl / Excel）能打开
  const out = path.join(root, '_verification', 'downloads', 'roundtrip.xlsx');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buffer);

  const parsed = Excel.parseWorkbook(XLSX, new Uint8Array(buffer));
  assert(parsed.issues.length === 0, `unexpected issues: ${JSON.stringify(parsed.issues)}`);
  equal(parsed.stats.valid, 3, 'valid rows');
  equal(parsed.contacts.map((c) => c.name), ['张鑫宇', '王建国', 'Anna Lee'], 'names');

  const zhang = parsed.contacts[0];
  equal(zhang.group, '同学', 'group');
  equal(zhang.tags, ['队友', 'EE308FZ'], 'tags');
  equal(zhang.bookmarked, true, 'bookmark flag survives export/import');
  equal(zhang.methods.map((m) => m.type), ['mobile', 'wechat', 'email', 'address'], 'method types');
  equal(zhang.methods.map((m) => m.value), ['138 0013 8000', 'zxy_2004', '832401324@fzu.edu.cn', '福州大学 3 号楼 512'], 'method values');
  equal(zhang.methods[0].label, '常用', 'method label');
  equal(zhang.methods[0].primary, true, 'primary method preserved');
  equal(parsed.contacts[2].methods.map((m) => m.value), ['anna@example.com', '+86 139 0000 1111'], 'english contact');

  // 第二个工作表是字段说明，不应被当成联系人导进来
  assert(parsed.sheetName === '联系人', `picked sheet ${parsed.sheetName}`);
});

/* 3. 兼容普通表格（每列一个类型） */
check('兼容普通表格：姓名/手机/邮箱/微信/地址 每列一种类型', () => {
  const aoa = [
    ['姓名', '手机', '邮箱', '微信', '地址', '收藏'],
    ['吴敏', '137 0591 2244', 'wumin@fzu.edu.cn', 'wumin_fzu', '福州大学 4 号楼 208', '是'],
    ['郑凯', '150 5918 0033', '', '', '', '否']
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '通讯录');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  const parsed = Excel.parseWorkbook(XLSX, new Uint8Array(buffer));
  equal(parsed.stats.valid, 2);
  equal(parsed.contacts[0].name, '吴敏');
  equal(parsed.contacts[0].bookmarked, true);
  equal(parsed.contacts[0].methods.map((m) => [m.type, m.value]), [
    ['mobile', '137 0591 2244'],
    ['email', 'wumin@fzu.edu.cn'],
    ['wechat', 'wumin_fzu'],
    ['address', '福州大学 4 号楼 208']
  ]);
  equal(parsed.contacts[1].methods.length, 1);
});

/* 4. 表头不在第一行也能识别（前面有标题行） */
check('表头识别：前面有标题行、空行也能找到表头', () => {
  const aoa = [
    ['2026 秋季 通讯录导出'],
    [],
    ['序号', '姓名', '联系方式1类型', '联系方式1号码'],
    [1, '李四', '手机', '135 0000 0000']
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const parsed = Excel.parseWorkbook(XLSX, new Uint8Array(buffer));
  equal(parsed.contacts.length, 1);
  equal(parsed.contacts[0].name, '李四');
  equal(parsed.contacts[0].methods[0].type, 'mobile');
});

/* 5. 文件内重名合并 + 缺姓名行 */
check('脏数据：文件内重名合并、缺姓名行计入无效', () => {
  const aoa = [
    ['姓名', '手机', '邮箱'],
    ['张鑫宇', '138 0013 8000', ''],
    ['张鑫宇', '', '832401324@fzu.edu.cn'],
    ['', '138 0000 1234', ''],
    ['王五', '139 1111 2222', '']
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '联系人');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const parsed = Excel.parseWorkbook(XLSX, new Uint8Array(buffer));

  equal(parsed.stats.invalid, 1);
  equal(parsed.contacts.map((c) => c.name), ['张鑫宇', '王五']);
  equal(parsed.contacts[0].methods.length, 2, 'duplicated rows merged into one contact');
  equal(parsed.rows.filter((r) => r.status === 'dup-file').length, 1);
});

/* 6. 合并策略 */
check('策略 merge：补充新号码、保留原备注、标签取并集', () => {
  const existing = [Model.normalizeContact({
    id: 'c_existing', name: '张鑫宇', company: '福州大学', group: '同学', tags: ['队友'],
    note: '组长', bookmarked: true,
    methods: [{ type: 'mobile', value: '138 0013 8000', label: '常用', primary: true }]
  })];
  const incoming = [Model.normalizeContact({
    name: '张鑫宇', tags: ['EE308FZ'], note: '导入的备注',
    methods: [
      { type: 'mobile', value: '13800138000' },
      { type: 'email', value: '832401324@fzu.edu.cn' }
    ]
  })];

  const merged = Excel.mergeContacts(existing, incoming, 'merge');
  assert(merged.report.merged === 1, 'should merge');
  const contact = merged.contacts[0];
  equal(merged.contacts.length, 1, 'no duplicate contact created');
  equal(contact.id, 'c_existing', 'keeps original id');
  equal(contact.note, '组长', 'keeps original note');
  equal(contact.tags, ['队友', 'EE308FZ'], 'tags union');
  equal(contact.bookmarked, true, 'bookmark stays on');
  assert(contact.methods.length >= 2, `methods merged, got ${contact.methods.length}`);
  equal(contact.methods[0].primary, true, 'primary untouched');
});

check('策略 skip：原记录一条都不改', () => {
  const existing = [Model.normalizeContact({
    name: '张鑫宇', note: '原备注', methods: [{ type: 'mobile', value: '138' }]
  })];
  const incoming = [Model.normalizeContact({ name: '张鑫宇', note: '新备注', methods: [{ type: 'email', value: 'a@b.com' }] })];
  const result = Excel.mergeContacts(existing, incoming, 'skip');
  equal(result.report.skipped, 1);
  equal(result.contacts[0].note, '原备注');
  equal(result.contacts[0].methods.map((m) => m.type), ['mobile']);
});

check('策略 overwrite：用表格内容替换，但保留 id 与创建时间', () => {
  const existing = [Model.normalizeContact({
    id: 'keep_me', name: '张鑫宇', note: '原备注', createdAt: '2026-01-01T00:00:00.000Z',
    methods: [{ type: 'mobile', value: '138' }]
  })];
  const incoming = [Model.normalizeContact({
    name: '张鑫宇', note: '新备注', group: '同学',
    methods: [{ type: 'email', value: 'a@b.com' }]
  })];
  const result = Excel.mergeContacts(existing, incoming, 'overwrite');
  equal(result.report.overwritten, 1);
  equal(result.contacts[0].id, 'keep_me');
  equal(result.contacts[0].createdAt, '2026-01-01T00:00:00.000Z');
  equal(result.contacts[0].note, '新备注');
  equal(result.contacts[0].methods.map((m) => m.type), ['email']);
});

/* 7. 空文件 / 没有姓名列 */
check('异常文件：没有姓名列时给出明确提示', () => {
  const sheet = XLSX.utils.aoa_to_sheet([['电话', '邮箱'], ['138', 'a@b.com']]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const parsed = Excel.parseWorkbook(XLSX, new Uint8Array(buffer));
  equal(parsed.contacts.length, 0);
  assert(parsed.issues.length > 0, 'should report an issue');
  assert(/姓名/.test(parsed.issues[0].message), 'issue should mention 姓名');
});

/* 8. 模板文件本身可以回导 */
check('导入模板：模板里的示例行能被正确解析', () => {
  const workbook = Excel.buildTemplate(XLSX);
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const parsed = Excel.parseWorkbook(XLSX, new Uint8Array(buffer));
  equal(parsed.contacts.length, 2);
  equal(parsed.contacts[0].name, '张三');
  equal(parsed.contacts[0].methods.length, 3);
  equal(parsed.contacts[1].methods.map((m) => m.type), ['phone', 'address']);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  process.exitCode = 1;
}
