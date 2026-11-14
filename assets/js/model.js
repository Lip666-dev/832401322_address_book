/* ==========================================================================
 * model.js — 通讯录数据模型
 * --------------------------------------------------------------------------
 * 纯函数模块：不碰 DOM、不碰 localStorage，方便在浏览器和 Node 测试中共用。
 * 全局导出：AddressBookModel
 * ========================================================================== */

(function (root) {
  'use strict';

  /**
   * 联系方式类型表。value 用于存储与 Excel 列，label 用于界面与导入识别。
   * icon 对应 app.js 里的内联 SVG。
   */
  var METHOD_TYPES = [
    { value: 'mobile', label: '手机', icon: 'mobile', aliases: ['手机', '手机号', '移动电话', 'mobile', 'cell', 'cellphone'] },
    { value: 'phone', label: '座机', icon: 'phone', aliases: ['座机', '电话', '固话', '办公室电话', 'phone', 'tel', 'telephone'] },
    { value: 'email', label: '邮箱', icon: 'mail', aliases: ['邮箱', '电子邮箱', '电子邮件', 'email', 'e-mail', 'mail'] },
    { value: 'wechat', label: '微信', icon: 'chat', aliases: ['微信', 'wechat', 'weixin'] },
    { value: 'qq', label: 'QQ', icon: 'chat', aliases: ['qq', '扣扣'] },
    { value: 'weibo', label: '微博', icon: 'chat', aliases: ['微博', 'weibo'] },
    { value: 'address', label: '地址', icon: 'pin', aliases: ['地址', '住址', '通讯地址', 'address', 'addr'] },
    { value: 'other', label: '其他', icon: 'link', aliases: ['其他', '其它', 'other', 'custom'] }
  ];

  var TYPE_BY_VALUE = {};
  var TYPE_BY_ALIAS = {};
  METHOD_TYPES.forEach(function (type) {
    TYPE_BY_VALUE[type.value] = type;
    TYPE_BY_ALIAS[type.value] = type;
    type.aliases.forEach(function (alias) {
      TYPE_BY_ALIAS[normalizeKey(alias)] = type;
    });
  });

  /** 去掉空白、下划线、连字符，并转小写，用于表头/类型别名匹配。 */
  function normalizeKey(text) {
    return String(text == null ? '' : text)
      .replace(/[\s_\-/\\]+/g, '')
      .toLowerCase();
  }

  /** 按 value 或别名（中英文都行）解析联系方式类型，无法识别时归入 other。 */
  function resolveMethodType(raw) {
    var key = normalizeKey(raw);
    if (TYPE_BY_ALIAS[key]) { return TYPE_BY_ALIAS[key].value; }
    if (!key) { return 'other'; }
    // 兜底：包含关系，例如“手机号码(主)”“wechat id”
    var found = null;
    Object.keys(TYPE_BY_ALIAS).forEach(function (alias) {
      if (!found && alias.length >= 2 && key.indexOf(alias) >= 0) {
        found = TYPE_BY_ALIAS[alias].value;
      }
    });
    return found || 'other';
  }

  function methodTypeLabel(value) {
    var type = TYPE_BY_VALUE[value];
    return type ? type.label : '其他';
  }

  /** 生成短 id（不依赖 crypto，旧浏览器也能用）。 */
  var idCounter = 0;
  function uid(prefix) {
    idCounter += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + idCounter.toString(36) +
      Math.random().toString(36).slice(2, 6);
  }

  function now() { return new Date().toISOString(); }

  /** 空白联系方式对象（编辑器里“添加一行”用）。 */
  function emptyMethod(type) {
    return { id: uid('m'), type: type || 'mobile', value: '', label: '', primary: false };
  }

  /** 空白联系人对象。 */
  function emptyContact() {
    return {
      id: uid('c'),
      name: '',
      company: '',
      group: '',
      tags: [],
      bookmarked: false,
      note: '',
      methods: [emptyMethod('mobile')],
      createdAt: now(),
      updatedAt: now()
    };
  }

  /** 把任意来源（本地存储 / Excel / 用户输入）的对象规整成合法联系人。 */
  function normalizeContact(raw) {
    var source = raw || {};
    var methods = Array.isArray(source.methods) ? source.methods : [];
    var cleaned = methods
      .map(function (method) {
        if (!method) { return null; }
        var value = String(method.value == null ? '' : method.value).trim();
        if (!value) { return null; }
        return {
          id: method.id || uid('m'),
          type: resolveMethodType(method.type),
          value: value,
          label: String(method.label == null ? '' : method.label).trim(),
          primary: !!method.primary
        };
      })
      .filter(Boolean);

    // 只允许一个“主要”联系方式：优先后出现的显式标记，否则取第一条。
    var primaryIndex = -1;
    cleaned.forEach(function (method, index) { if (method.primary) { primaryIndex = index; } });
    cleaned.forEach(function (method, index) { method.primary = index === (primaryIndex >= 0 ? primaryIndex : 0); });

    var tags = source.tags;
    if (typeof tags === 'string') {
      tags = tags.split(/[,，;；、|\/]+/);
    }
    tags = (Array.isArray(tags) ? tags : [])
      .map(function (tag) { return String(tag).trim(); })
      .filter(function (tag) { return tag.length > 0 && tag.length <= 20; });

    return {
      id: source.id || uid('c'),
      name: String(source.name == null ? '' : source.name).trim(),
      company: String(source.company == null ? '' : source.company).trim(),
      group: String(source.group == null ? '' : source.group).trim(),
      tags: tags.filter(function (tag, index) { return tags.indexOf(tag) === index; }).slice(0, 8),
      bookmarked: !!source.bookmarked,
      note: String(source.note == null ? '' : source.note).trim(),
      methods: cleaned,
      createdAt: source.createdAt || now(),
      updatedAt: source.updatedAt || now()
    };
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * 表单校验。返回 { ok, errors: { name, methods } }。
   * 规则：姓名必填；至少要有一条联系方式；邮箱要像邮箱；其余不能太长。
   */
  function validateContact(contact) {
    var errors = {};
    var name = String(contact.name || '').trim();
    if (!name) {
      errors.name = '请填写姓名';
    } else if (name.length > 40) {
      errors.name = '姓名最多 40 个字符';
    }

    var methods = (contact.methods || []).filter(function (method) {
      return String(method.value || '').trim() !== '';
    });

    if (!methods.length) {
      errors.methods = '至少填写一条联系方式（手机、邮箱、微信、地址都可以）';
    } else {
      for (var i = 0; i < methods.length; i += 1) {
        var method = methods[i];
        var value = String(method.value).trim();
        if (value.length > 120) {
          errors.methods = '第 ' + (i + 1) + ' 条联系方式太长（最多 120 个字符）';
          break;
        }
        if (method.type === 'email' && !EMAIL_RE.test(value)) {
          errors.methods = '第 ' + (i + 1) + ' 条邮箱格式不正确：' + value;
          break;
        }
        if ((method.type === 'mobile' || method.type === 'phone') && !/^[0-9+\-()\s]{3,24}$/.test(value)) {
          errors.methods = '第 ' + (i + 1) + ' 条电话号码含有不支持的字符：' + value;
          break;
        }
      }
    }

    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  /** Excel 导入时用于判重的指纹：姓名 + 第一条联系方式（都做归一化）。 */
  function dedupeKey(contact) {
    var name = normalizeKey(contact.name);
    var primary = (contact.methods || [])[0];
    var value = primary ? normalizeKey(primary.value) : '';
    return name + '|' + value;
  }

  /** 生成用于搜索的大写文本，覆盖姓名、公司、分组、标签、备注和所有联系方式。 */
  function searchText(contact) {
    var parts = [contact.name, contact.company, contact.group, contact.note].concat(contact.tags || []);
    (contact.methods || []).forEach(function (method) {
      parts.push(method.value, method.label, methodTypeLabel(method.type));
    });
    return parts.join(' ').toUpperCase();
  }

  /** 排序：支持按姓名（中文按拼音）、最近修改、联系方式数量。 */
  function sortContacts(list, mode) {
    var copy = list.slice();
    var collator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base', numeric: true });
    if (mode === 'updated') {
      copy.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
    } else if (mode === 'methods') {
      copy.sort(function (a, b) {
        return (b.methods.length - a.methods.length) || collator.compare(a.name, b.name);
      });
    } else {
      copy.sort(function (a, b) {
        return collator.compare(a.name, b.name) || collator.compare(a.company, b.company);
      });
    }
    return copy;
  }

  /** 头像文字：中文取最后一个字，英文取首字母。 */
  function initials(name) {
    var text = String(name || '').trim();
    if (!text) { return '?'; }
    if (/[\u4e00-\u9fa5]/.test(text)) {
      var tail = text.replace(/[^\u4e00-\u9fa5]/g, '');
      return tail.slice(-1);
    }
    var words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 2) { return (words[0][0] + words[1][0]).toUpperCase(); }
    return text.slice(0, 2).toUpperCase();
  }

  /** 由姓名稳定地得出一个头像底色，刷新后不会变。 */
  var AVATAR_COLORS = [
    'linear-gradient(140deg,#6366f1,#4338ca)',
    'linear-gradient(140deg,#0ea5e9,#0369a1)',
    'linear-gradient(140deg,#10b981,#047857)',
    'linear-gradient(140deg,#f59e0b,#b45309)',
    'linear-gradient(140deg,#ec4899,#be185d)',
    'linear-gradient(140deg,#8b5cf6,#6d28d9)',
    'linear-gradient(140deg,#14b8a6,#0f766e)',
    'linear-gradient(140deg,#f97316,#c2410c)'
  ];

  function avatarColor(name) {
    var text = String(name || '');
    var hash = 0;
    for (var i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) % 100000;
    }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
  }

  /** 主要联系方式（用于列表里显示“默认号码”）。 */
  function primaryMethod(contact) {
    var methods = contact.methods || [];
    for (var i = 0; i < methods.length; i += 1) {
      if (methods[i].primary) { return methods[i]; }
    }
    return methods[0] || null;
  }

  var api = {
    METHOD_TYPES: METHOD_TYPES,
    normalizeKey: normalizeKey,
    resolveMethodType: resolveMethodType,
    methodTypeLabel: methodTypeLabel,
    uid: uid,
    emptyMethod: emptyMethod,
    emptyContact: emptyContact,
    normalizeContact: normalizeContact,
    validateContact: validateContact,
    dedupeKey: dedupeKey,
    searchText: searchText,
    sortContacts: sortContacts,
    initials: initials,
    avatarColor: avatarColor,
    primaryMethod: primaryMethod,
    EMAIL_RE: EMAIL_RE
  };

  root.AddressBookModel = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
}(typeof globalThis !== 'undefined' ? globalThis : this));
