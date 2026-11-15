/**
 * 数据模型单元测试（Node 内置断言，无第三方依赖）。
 *
 *   node tests/model.test.mjs
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const Model = require(path.join(root, 'assets', 'js', 'model.js'));

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

function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) { throw new Error(`${message || 'values differ'}: ${a} !== ${b}`); }
}

console.log('数据模型测试');

check('校验：姓名必填、至少一条联系方式', () => {
  const empty = Model.emptyContact();
  const result = Model.validateContact(empty);
  if (result.ok) { throw new Error('empty contact should be invalid'); }
  if (!result.errors.name) { throw new Error('name error missing'); }
  if (!result.errors.methods) { throw new Error('methods error missing'); }
});

check('校验：邮箱格式、电话字符集', () => {
  const contact = Model.normalizeContact({
    name: '测试', methods: [{ type: 'email', value: 'not-an-email' }, { type: 'mobile', value: '138abc' }]
  });
  const result = Model.validateContact(contact);
  if (result.ok) { throw new Error('should be invalid'); }
  if (!/邮箱/.test(result.errors.methods)) { throw new Error('email error missing'); }
});

check('校验：合法联系人通过', () => {
  const contact = Model.normalizeContact({
    name: '张鑫宇',
    methods: [
      { type: 'mobile', value: '138 0013 8000' },
      { type: 'email', value: 'zxy@fzu.edu.cn' },
      { type: 'address', value: '福州大学 3 号楼 512' }
    ]
  });
  equal(Model.validateContact(contact).ok, true);
});

check('规整：只保留一个 primary，并去掉空值', () => {
  const contact = Model.normalizeContact({
    name: ' 张三 ', methods: [
      { type: 'mobile', value: '  ', label: '空值应丢弃' },
      { type: 'email', value: 'a@b.com', primary: true },
      { type: 'wechat', value: 'wx', primary: true }
    ]
  });
  equal(contact.name, '张三');
  equal(contact.methods.length, 2);
  equal(contact.methods.filter((m) => m.primary).length, 1);
  equal(contact.methods[1].primary, true);
});

check('类型识别：中英文别名都归一化到同一种类型', () => {
  equal(Model.resolveMethodType('手机号'), 'mobile');
  equal(Model.resolveMethodType('Mobile'), 'mobile');
  equal(Model.resolveMethodType('E-mail'), 'email');
  equal(Model.resolveMethodType('微信'), 'wechat');
  equal(Model.resolveMethodType('QQ'), 'qq');
  equal(Model.resolveMethodType('住址'), 'address');
  equal(Model.resolveMethodType('钉钉'), 'other');
});

check('标签：字符串、逗号分隔、去重、最多 8 个', () => {
  const contact = Model.normalizeContact({ name: 'A', tags: '同事, 项目组，同事' });
  equal(contact.tags, ['同事', '项目组']);
  const many = Model.normalizeContact({ name: 'B', tags: Array.from({ length: 12 }, (_, i) => 't' + i) });
  equal(many.tags.length, 8);
});

check('判重指纹：名字相同号码格式不同，视为同一个人', () => {
  const a = Model.normalizeContact({ name: '张鑫宇', methods: [{ type: 'mobile', value: '138-0013-8000' }] });
  const b = Model.normalizeContact({ name: ' 张鑫宇 ', methods: [{ type: 'mobile', value: '13800138000' }] });
  equal(Model.dedupeKey(a), Model.dedupeKey(b));
});

check('排序：中文按拼音、可切换最近修改', () => {
  const list = [
    Model.normalizeContact({ name: '王建国', updatedAt: '2026-01-01T00:00:00.000Z' }),
    Model.normalizeContact({ name: '陈思远', updatedAt: '2026-03-01T00:00:00.000Z' }),
    Model.normalizeContact({ name: '李工', updatedAt: '2026-02-01T00:00:00.000Z' })
  ];
  equal(Model.sortContacts(list, 'name').map((c) => c.name), ['陈思远', '李工', '王建国']);
  equal(Model.sortContacts(list, 'updated').map((c) => c.name), ['陈思远', '李工', '王建国']);
});

check('头像：中文取末字、英文取首字母、底色稳定', () => {
  equal(Model.initials('张鑫宇'), '宇');
  equal(Model.initials('Anna Lee'), 'AL');
  equal(Model.initials(''), '?');
  equal(Model.avatarColor('张鑫宇'), Model.avatarColor('张鑫宇'));
  if (Model.avatarColor('张鑫宇') === Model.avatarColor('王建国')) {
    // 只是提示：有可能撞色，但不应该经常发生
  }
});

check('搜索文本覆盖姓名、公司、标签与所有联系方式', () => {
  const contact = Model.normalizeContact({
    name: '刘一鸣', company: '星网锐捷', tags: ['实习'],
    methods: [{ type: 'email', value: 'liuyiming@star-net.cn' }]
  });
  const text = Model.searchText(contact);
  ['刘一鸣', '星网锐捷', '实习', 'liuyiming', '邮箱'].forEach((keyword) => {
    if (text.indexOf(keyword.toUpperCase()) < 0) { throw new Error('missing keyword ' + keyword); }
  });
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { process.exitCode = 1; }
