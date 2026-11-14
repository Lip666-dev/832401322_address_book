/* ==========================================================================
 * store.js — 数据存取层（localStorage）
 * --------------------------------------------------------------------------
 * 只负责「读写 + 查询」，业务规则放在 model.js，界面渲染放在 app.js。
 * 全局导出：AddressBookStore
 * ========================================================================== */

(function (root) {
  'use strict';

  var Model = root.AddressBookModel;
  var STORAGE_KEY = 'addressbook.v1';
  var SCHEMA_VERSION = 1;

  /** 首次打开时展示的示例数据：覆盖收藏、多联系方式、分组、标签等场景。 */
  function seedContacts() {
    var raw = [
      {
        name: '张鑫宇',
        company: '福州大学 计算机与大数据学院',
        group: '同学',
        tags: ['队友', 'EE308FZ'],
        bookmarked: true,
        note: '极限编程作业队友，负责数据模型与 Excel 模块。',
        methods: [
          { type: 'mobile', value: '138 0013 8000', label: '常用', primary: true },
          { type: 'wechat', value: 'zxy_2004', label: '微信' },
          { type: 'email', value: '832401324@fzu.edu.cn', label: '学校邮箱' }
        ]
      },
      {
        name: '于承昊',
        company: '福州大学 计算机与大数据学院',
        group: '同学',
        tags: ['队长'],
        bookmarked: true,
        note: '本机主人，负责界面与收藏功能。',
        methods: [
          { type: 'mobile', value: '139 0013 9000', label: '常用', primary: true },
          { type: 'email', value: '832401322@fzu.edu.cn', label: '学校邮箱' },
          { type: 'address', value: '福建省福州市闽侯县上街镇福州大学 3 号宿舍楼 512', label: '宿舍' }
        ]
      },
      {
        name: '王建国',
        company: '福州大学 软件工程系',
        group: '老师',
        tags: ['课程教师'],
        bookmarked: true,
        note: 'EE308FZ 授课教师，Office Hour：周三 14:00-16:00。',
        methods: [
          { type: 'phone', value: '0591-2286 6120', label: '办公室', primary: true },
          { type: 'email', value: 'wangjg@fzu.edu.cn', label: '工作邮箱' },
          { type: 'address', value: '福州大学旗山校区 计算机楼 A305', label: '办公室' }
        ]
      },
      {
        name: '陈思远',
        company: '福州大学 数学与统计学院',
        group: '同学',
        tags: ['实验室', '算法'],
        bookmarked: false,
        note: '一起做算法校赛，习惯晚上十点后在实验室。',
        methods: [
          { type: 'mobile', value: '137 5599 2210', label: '常用', primary: true },
          { type: 'qq', value: '442133190', label: 'QQ' }
        ]
      },
      {
        name: '林晓曦',
        company: '厦门大学 经济学院',
        group: '家人',
        tags: ['表姐'],
        bookmarked: false,
        note: '',
        methods: [
          { type: 'mobile', value: '135 0099 1122', label: '常用', primary: true },
          { type: 'wechat', value: 'linxx_1999', label: '微信' }
        ]
      },
      {
        name: '刘一鸣',
        company: '福建星网锐捷 通讯事业群',
        group: '实习',
        tags: ['实习', '嵌入式'],
        bookmarked: false,
        note: '实习导师，周会汇报进度。',
        methods: [
          { type: 'mobile', value: '186 0501 7788', label: '工作', primary: true },
          { type: 'phone', value: '0591-2808 0000', label: '总机转 8321' },
          { type: 'email', value: 'liuyiming@star-net.cn', label: '工作邮箱' }
        ]
      },
      {
        name: '赵梓涵',
        company: '福州大学 外国语学院',
        group: '同学',
        tags: ['英语角'],
        bookmarked: false,
        note: '',
        methods: [
          { type: 'wechat', value: 'zhaozihan_fzu', label: '微信', primary: true },
          { type: 'email', value: 'zhaozihan@fzu.edu.cn', label: '学校邮箱' }
        ]
      },
      {
        name: '李明',
        company: '福州大学 计算机与大数据学院',
        group: '老师',
        tags: ['助教'],
        bookmarked: false,
        note: '课程助教，收作业和答疑。',
        methods: [
          { type: 'email', value: 'liming_ta@fzu.edu.cn', label: '学校邮箱', primary: true },
          { type: 'wechat', value: 'liming_ta', label: '微信' }
        ]
      },
      {
        name: '周雨桐',
        company: '福州大学 学生社团联合会',
        group: '社团',
        tags: ['摄影社'],
        bookmarked: false,
        note: '摄影社活动通知都找她。',
        methods: [
          { type: 'mobile', value: '150 6001 3344', label: '常用', primary: true },
          { type: 'weibo', value: '@雨桐拍照了吗', label: '微博' },
          { type: 'address', value: '福州大学旗山校区 学生活动中心 204', label: '社团办公室' }
        ]
      },
      {
        name: '孙浩然',
        company: '福建师范大学 软件学院',
        group: '高中同学',
        tags: ['高中'],
        bookmarked: false,
        note: '',
        methods: [
          { type: 'mobile', value: '139 0500 6621', label: '', primary: true }
        ]
      }
    ];

    return raw.map(function (item) {
      var contact = Model.normalizeContact(item);
      contact.updatedAt = contact.createdAt = new Date(
        Date.now() - Math.floor(Math.random() * 12) * 86400000
      ).toISOString();
      return contact;
    });
  }

  var state = {
    version: SCHEMA_VERSION,
    contacts: []
  };

  var storageAvailable = true;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function load() {
    var raw = null;
    try {
      raw = root.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      storageAvailable = false;
    }

    if (!raw) {
      state.contacts = seedContacts();
      save();
      return state;
    }

    try {
      var parsed = JSON.parse(raw);
      var list = Array.isArray(parsed) ? parsed : parsed.contacts;
      state.contacts = (list || []).map(Model.normalizeContact);
      state.version = parsed.version || SCHEMA_VERSION;
    } catch (error) {
      // 数据损坏时不要让应用打不开：保留一份副本，然后回到示例数据。
      try {
        root.localStorage.setItem(STORAGE_KEY + '.broken.' + Date.now(), raw);
      } catch (ignored) { /* 忽略二次异常 */ }
      state.contacts = seedContacts();
      save();
    }
    return state;
  }

  function save() {
    if (!storageAvailable) { return false; }
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        contacts: state.contacts
      }));
      return true;
    } catch (error) {
      storageAvailable = false;
      return false;
    }
  }

  function all() { return state.contacts; }

  function get(id) {
    var found = null;
    state.contacts.forEach(function (contact) { if (contact.id === id) { found = contact; } });
    return found;
  }

  function findByDedupeKey(key) {
    var found = null;
    state.contacts.forEach(function (contact) {
      if (!found && Model.dedupeKey(contact) === key) { found = contact; }
    });
    return found;
  }

  function findByName(name) {
    var key = Model.normalizeKey(name);
    var found = null;
    state.contacts.forEach(function (contact) {
      if (!found && Model.normalizeKey(contact.name) === key) { found = contact; }
    });
    return found;
  }

  /** 新建或更新；更新时刷新 updatedAt，并保持 createdAt。 */
  function upsert(contact) {
    var normalized = Model.normalizeContact(contact);
    var index = -1;
    state.contacts.forEach(function (item, position) {
      if (item.id === normalized.id) { index = position; }
    });

    if (index >= 0) {
      normalized.createdAt = state.contacts[index].createdAt;
      normalized.updatedAt = new Date().toISOString();
      state.contacts.splice(index, 1, normalized);
    } else {
      normalized.createdAt = normalized.createdAt || new Date().toISOString();
      normalized.updatedAt = new Date().toISOString();
      state.contacts.push(normalized);
    }
    save();
    return normalized;
  }

  function remove(id) {
    var before = state.contacts.length;
    state.contacts = state.contacts.filter(function (contact) { return contact.id !== id; });
    save();
    return state.contacts.length < before;
  }

  function toggleBookmark(id) {
    var contact = get(id);
    if (!contact) { return null; }
    contact.bookmarked = !contact.bookmarked;
    contact.updatedAt = new Date().toISOString();
    save();
    return contact;
  }

  function replaceAll(contacts) {
    state.contacts = contacts.map(Model.normalizeContact);
    save();
    return state.contacts;
  }

  function resetToSeed() {
    state.contacts = seedContacts();
    save();
    return state.contacts;
  }

  function stats() {
    var bookmarked = 0;
    state.contacts.forEach(function (contact) { if (contact.bookmarked) { bookmarked += 1; } });
    return { total: state.contacts.length, bookmarked: bookmarked };
  }

  /** 分组列表（按人数降序），用于左侧栏。 */
  function groups() {
    var map = {};
    state.contacts.forEach(function (contact) {
      var name = contact.group || '未分组';
      map[name] = (map[name] || 0) + 1;
    });
    return Object.keys(map).map(function (name) {
      return { name: name, count: map[name] };
    }).sort(function (a, b) {
      return (b.count - a.count) || a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
  }

  /** 标签列表（按使用次数降序）。 */
  function tags() {
    var map = {};
    state.contacts.forEach(function (contact) {
      (contact.tags || []).forEach(function (tag) { map[tag] = (map[tag] || 0) + 1; });
    });
    return Object.keys(map).map(function (tag) {
      return { name: tag, count: map[tag] };
    }).sort(function (a, b) {
      return (b.count - a.count) || a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
  }

  function snapshot() { return clone(state.contacts); }

  root.AddressBookStore = {
    STORAGE_KEY: STORAGE_KEY,
    load: load,
    save: save,
    all: all,
    get: get,
    findByName: findByName,
    findByDedupeKey: findByDedupeKey,
    upsert: upsert,
    remove: remove,
    toggleBookmark: toggleBookmark,
    replaceAll: replaceAll,
    resetToSeed: resetToSeed,
    stats: stats,
    groups: groups,
    tags: tags,
    snapshot: snapshot,
    isStorageAvailable: function () { return storageAvailable; }
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
