/* ==========================================================================
 * excel.js — Excel 导入 / 导出
 * --------------------------------------------------------------------------
 * 导出（宽表）：一个联系人一行，基础信息各占一列，联系方式按 1…N 展开成
 *              「类型 / 号码 / 备注」三列，列数随最多联系方式数自动扩展。
 * 导入：优先按表头文字识别字段（本应用导出的文件可以直接回导），
 *       也兼容「姓名 / 手机 / 邮箱 / 地址」这类普通表格。
 *
 * 全局导出：AddressBookExcel（浏览器）
 * CommonJS：module.exports（Node 测试）
 * ========================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./model.js'));
  } else {
    root.AddressBookExcel = factory(root.AddressBookModel);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Model) {
  'use strict';

  var BASE_FIELDS = [
    { key: 'name', header: '姓名' },
    { key: 'company', header: '公司/部门' },
    { key: 'group', header: '分组' },
    { key: 'tags', header: '标签' },
    { key: 'bookmarked', header: '收藏' },
    { key: 'note', header: '备注' }
  ];

  var BASE_ALIASES = {
    name: ['姓名', '名字', '名称', '联系人', '联系人姓名', 'name', 'fullname', 'full name', 'contact'],
    company: ['公司', '单位', '部门', '公司部门', '公司/部门', '所属单位', 'company', 'organization', 'org', 'department', 'dept'],
    group: ['分组', '组', '分类', '类别', 'group', 'category', 'type'],
    tags: ['标签', '关键词', 'tags', 'tag', 'keywords'],
    bookmarked: ['收藏', '星标', '收藏夹', '是否收藏', 'bookmarked', 'bookmark', 'favorite', 'favourite', 'star'],
    note: ['备注', '说明', '注释', 'note', 'notes', 'remark', 'remarks', 'memo']
  };

  var BASE_BY_ALIAS = {};
  Object.keys(BASE_ALIASES).forEach(function (key) {
    BASE_ALIASES[key].forEach(function (alias) {
      BASE_BY_ALIAS[Model.normalizeKey(alias)] = key;
    });
  });

  var SLOT_RE = /^联系方式(\d{1,2})(类型|号码|内容|值|备注|标签)$/;
  var SLOT_RE_EN = /^contact(\d{1,2})(type|value|number|label|note)$/;

  var TYPE_LABELS = Model.METHOD_TYPES.map(function (type) { return type.label; }).join('/');

  var COLUMN_WIDTHS = {
    name: 14, company: 30, group: 10, tags: 20, bookmarked: 8, note: 30,
    type: 11, value: 24, label: 14
  };

  /* ------------------------------ 导出 ------------------------------ */

  /** 根据联系人列表计算表头与二维数据。maxMethods 至少 3，方便手工补录。 */
  function buildTable(contacts) {
    var maxMethods = 3;
    contacts.forEach(function (contact) {
      if (contact.methods.length > maxMethods) { maxMethods = contact.methods.length; }
    });

    var headers = BASE_FIELDS.map(function (field) { return field.header; });
    for (var slot = 1; slot <= maxMethods; slot += 1) {
      headers.push('联系方式' + slot + '类型', '联系方式' + slot + '号码', '联系方式' + slot + '备注');
    }

    var rows = contacts.map(function (contact) {
      var row = [
        contact.name,
        contact.company,
        contact.group,
        (contact.tags || []).join(', '),
        contact.bookmarked ? '是' : '否',
        contact.note
      ];
      for (var index = 0; index < maxMethods; index += 1) {
        var method = contact.methods[index];
        if (method) {
          row.push(Model.methodTypeLabel(method.type), method.value, method.label);
        } else {
          row.push('', '', '');
        }
      }
      return row;
    });

    return { headers: headers, rows: rows, maxMethods: maxMethods };
  }

  function colLetter(index) {
    var letters = '';
    var n = index;
    while (n >= 0) {
      letters = String.fromCharCode(65 + (n % 26)) + letters;
      n = Math.floor(n / 26) - 1;
    }
    return letters;
  }

  function sheetFromTable(XLSX, table) {
    var aoa = [table.headers].concat(table.rows);
    var sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet['!cols'] = table.headers.map(function (header) {
      var key = BASE_BY_ALIAS[Model.normalizeKey(header)];
      var width = 18;
      if (key && COLUMN_WIDTHS[key]) { width = COLUMN_WIDTHS[key]; }
      else if (header.indexOf('类型') >= 0) { width = COLUMN_WIDTHS.type; }
      else if (header.indexOf('号码') >= 0) { width = COLUMN_WIDTHS.value; }
      else if (header.indexOf('备注') >= 0) { width = COLUMN_WIDTHS.label; }
      return { wch: width };
    });
    if (table.rows.length > 0) {
      sheet['!autofilter'] = {
        ref: 'A1:' + colLetter(table.headers.length - 1) + (table.rows.length + 1)
      };
    }
    return sheet;
  }

  function helpSheet(XLSX, contacts) {
    var lines = [
      ['字段', '说明', '示例'],
      ['姓名', '必填。联系人姓名，同一文件内重名会被合并为一条', '张鑫宇'],
      ['公司/部门', '可选。单位、学院或部门', '福州大学 计算机与大数据学院'],
      ['分组', '可选。界面左侧「分组」按此分组', '同学'],
      ['标签', '可选。多个标签用逗号分隔', '队友, EE308FZ'],
      ['收藏', '可选。填「是」或「否」（true/false 也识别）', '是'],
      ['备注', '可选。自由文字', '小组组长'],
      ['联系方式N类型', '手机 / 座机 / 邮箱 / 微信 / QQ / 微博 / 地址 / 其他', '手机'],
      ['联系方式N号码', '对应类型的号码、账号或地址；一个联系人可以有任意多条', '138 0013 8000'],
      ['联系方式N备注', '可选。例如「常用」「工作」「家庭」', '常用'],
      ['', '', ''],
      ['导出说明', '一个联系人一行；联系方式从第 1 组开始向右排列，最多的一组决定有多少列', ''],
      ['导出时间', new Date().toISOString(), ''],
      ['记录条数', String(contacts.length), '']
    ];
    var sheet = XLSX.utils.aoa_to_sheet(lines);
    sheet['!cols'] = [{ wch: 18 }, { wch: 62 }, { wch: 32 }];
    return sheet;
  }

  /** 生成导出用的工作簿。opts.sheetName 默认「联系人」。 */
  function exportWorkbook(XLSX, contacts, opts) {
    var options = opts || {};
    var workbook = XLSX.utils.book_new();
    var table = buildTable(contacts);
    XLSX.utils.book_append_sheet(workbook, sheetFromTable(XLSX, table), options.sheetName || '联系人');
    XLSX.utils.book_append_sheet(workbook, helpSheet(XLSX, contacts), '字段说明');
    return workbook;
  }

  /** 导入模板：表头 + 两行示例，方便同学手工整理数据。 */
  function buildTemplate(XLSX) {
    var workbook = XLSX.utils.book_new();
    var headers = BASE_FIELDS.map(function (field) { return field.header; });
    for (var slot = 1; slot <= 3; slot += 1) {
      headers.push('联系方式' + slot + '类型', '联系方式' + slot + '号码', '联系方式' + slot + '备注');
    }
    var rows = [
      ['张三', '福州大学 计算机与大数据学院', '同学', '队友, 项目组', '是', '示例行，可删除',
        '手机', '138 0000 0000', '常用',
        '邮箱', 'zhangsan@example.com', '学校邮箱',
        '微信', 'zhangsan_wx', ''
      ],
      ['李四', '某公司 研发部', '同事', '后端', '否', '',
        '座机', '0591-1234 5678', '办公室',
        '地址', '福州市鼓楼区某路 1 号', '',
        '', '', ''
      ]
    ];
    var table = { headers: headers, rows: rows, maxMethods: 3 };
    XLSX.utils.book_append_sheet(workbook, sheetFromTable(XLSX, table), '联系人');
    XLSX.utils.book_append_sheet(workbook, helpSheet(XLSX, []), '字段说明');
    return workbook;
  }

  function stamp(date) {
    var d = date || new Date();
    function pad(value) { return String(value).padStart(2, '0'); }
    return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
      pad(d.getHours()) + pad(d.getMinutes());
  }

  function exportFileName(date) {
    return '通讯录_' + stamp(date) + '.xlsx';
  }

  /* ------------------------------ 导入 ------------------------------ */

  /**
   * 解码 CSV 文本：中文 Windows 上 Excel 导出的 CSV 常见是 GBK 编码，
   * 直接按 UTF-8 读会把中文读成乱码。先严格按 UTF-8 解，失败再退回 GBK。
   */
  function decodeCsv(bytes) {
    var data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    if (typeof TextDecoder === 'undefined') { return ''; }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(data);
    } catch (error) {
      try {
        return new TextDecoder('gbk').decode(data);
      } catch (fallbackError) {
        return new TextDecoder('utf-8').decode(data);
      }
    }
  }

  function isTruthy(value) {
    var text = Model.normalizeKey(value);
    return ['是', 'y', 'yes', 'true', '1', '✓', '√', '已收藏', '收藏'].indexOf(text) >= 0;
  }

  function splitTags(value) {
    if (value == null) { return []; }
    return String(value).split(/[,，;；、|\/]+/).map(function (tag) { return tag.trim(); }).filter(Boolean);
  }

  /** 识别一个表头：基础字段 / 联系方式分槽 / 直接是某类型（手机、邮箱…）。 */
  function classifyHeader(header) {
    var raw = String(header == null ? '' : header).trim();
    var key = Model.normalizeKey(raw);
    if (!key) { return null; }

    if (BASE_BY_ALIAS[key]) { return { kind: 'base', field: BASE_BY_ALIAS[key] }; }

    var slot = key.match(SLOT_RE) || key.match(SLOT_RE_EN);
    if (slot) {
      var partMap = { '类型': 'type', 'type': 'type', '号码': 'value', '内容': 'value', '值': 'value',
        'value': 'value', 'number': 'value', '备注': 'label', '标签': 'label', 'label': 'label', 'note': 'label' };
      return { kind: 'slot', slot: parseInt(slot[1], 10), part: partMap[slot[2]] || 'value', header: raw };
    }

    var type = Model.resolveMethodType(raw);
    if (type !== 'other' || /^(其他|其它|other)$/.test(key)) {
      var typeMeta = null;
      Model.METHOD_TYPES.forEach(function (item) { if (item.value === type) { typeMeta = item; } });
      var label = raw;
      if (typeMeta && (label === typeMeta.label || Model.normalizeKey(label) === type)) { label = ''; }
      return { kind: 'method', type: type, label: label, header: raw };
    }

    return { kind: 'unknown', header: raw };
  }

  /** 找到真正的表头行：前 10 行里，命中已知字段最多的一行。 */
  function findHeaderRow(rows) {
    var best = { index: -1, score: 0 };
    var limit = Math.min(rows.length, 10);
    for (var i = 0; i < limit; i += 1) {
      var score = 0;
      (rows[i] || []).forEach(function (cell) {
        var classified = classifyHeader(cell);
        if (classified && classified.kind !== 'unknown') { score += 1; }
      });
      if (score > best.score && score >= 1) { best = { index: i, score: score }; }
    }
    return best.index;
  }

  function pickSheet(XLSX, workbook, wanted) {
    var names = workbook.SheetNames || [];
    var preferred = wanted || '联系人';
    if (names.indexOf(preferred) >= 0) { return preferred; }
    for (var i = 0; i < names.length; i += 1) {
      var rows = XLSX.utils.sheet_to_json(workbook.Sheets[names[i]], { header: 1, blankrows: false, defval: '' });
      if (findHeaderRow(rows) >= 0) { return names[i]; }
    }
    return names[0] || null;
  }

  /**
   * 解析工作簿。
   * @param {object} XLSX SheetJS 命名空间
   * @param {ArrayBuffer|Uint8Array|string} data 文件内容
   * @param {object} [opts] { sheetName, maxIssues }
   * @returns {{contacts:Array, rows:Array, issues:Array, stats:object, sheetName:string, headers:Array}}
   */
  function parseWorkbook(XLSX, data, opts) {
    var options = opts || {};
    var workbook;
    if (typeof data === 'string') {
      workbook = XLSX.read(data, { type: 'string', raw: false });
    } else if (data instanceof ArrayBuffer || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(data))) {
      workbook = XLSX.read(data, { type: 'array', cellDates: false });
    } else {
      workbook = XLSX.read(data, { type: 'binary' });
    }

    var sheetName = pickSheet(XLSX, workbook, options.sheetName);
    if (!sheetName) {
      return { contacts: [], rows: [], issues: [{ row: 0, message: '文件里没有工作表' }],
        stats: { total: 0, valid: 0, invalid: 0 }, sheetName: '', headers: [] };
    }

    var sheet = workbook.Sheets[sheetName];
    var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
    var headerIndex = findHeaderRow(rows);
    if (headerIndex < 0) {
      return { contacts: [], rows: [], issues: [{ row: 0, message: '没有找到表头：表格里至少需要「姓名」这一列' }],
        stats: { total: 0, valid: 0, invalid: 0 }, sheetName: sheetName, headers: [] };
    }

    var headers = rows[headerIndex].map(function (cell) { return String(cell == null ? '' : cell).trim(); });
    var columns = headers.map(classifyHeader);

    var baseIndex = {};
    var slots = {};
    var methodColumns = [];
    columns.forEach(function (column, index) {
      if (!column) { return; }
      if (column.kind === 'base') { baseIndex[column.field] = index; }
      if (column.kind === 'slot') {
        slots[column.slot] = slots[column.slot] || {};
        slots[column.slot][column.part] = index;
      }
      if (column.kind === 'method') { methodColumns.push({ index: index, type: column.type, label: column.label }); }
    });

    if (baseIndex.name === undefined) {
      return { contacts: [], rows: [], issues: [{ row: headerIndex + 1, message: '缺少「姓名」列，无法导入' }],
        stats: { total: 0, valid: 0, invalid: 0 }, sheetName: sheetName, headers: headers };
    }

    var contacts = [];
    var reportRows = [];
    var issues = [];
    var maxIssues = options.maxIssues || 20;
    var byName = {};
    var total = 0;
    var invalid = 0;

    for (var r = headerIndex + 1; r < rows.length; r += 1) {
      var row = rows[r] || [];
      var flat = row.map(function (cell) { return String(cell == null ? '' : cell).trim(); });
      var isEmpty = flat.every(function (cell) { return cell === ''; });
      if (isEmpty) { continue; }

      total += 1;
      var excelRow = r + 1;
      var name = flat[baseIndex.name] || '';
      if (!name) {
        invalid += 1;
        reportRows.push({ row: excelRow, name: '', status: 'bad', message: '缺少姓名' });
        if (issues.length < maxIssues) { issues.push({ row: excelRow, message: '缺少姓名，整行已跳过' }); }
        continue;
      }

      var methods = [];

      Object.keys(slots).map(Number).sort(function (a, b) { return a - b; }).forEach(function (slot) {
        var mapping = slots[slot];
        var value = mapping.value === undefined ? '' : flat[mapping.value];
        if (!value) { return; }
        var typeRaw = mapping.type === undefined ? '' : flat[mapping.type];
        var label = mapping.label === undefined ? '' : flat[mapping.label];
        methods.push({
          type: typeRaw ? Model.resolveMethodType(typeRaw) : 'other',
          value: value,
          label: label
        });
      });

      methodColumns.forEach(function (column) {
        var value = flat[column.index];
        if (!value) { return; }
        methods.push({ type: column.type, value: value, label: column.label });
      });

      // 同一文件里重名 → 合并成一条，避免导入后出现两条一模一样的记录。
      var nameKey = Model.normalizeKey(name);
      if (byName[nameKey]) {
        var existing = byName[nameKey];
        methods.forEach(function (method) {
          var duplicated = existing.methods.some(function (item) {
            return item.type === method.type && Model.normalizeKey(item.value) === Model.normalizeKey(method.value);
          });
          if (!duplicated) { existing.methods.push(method); }
        });
        splitTags(flat[baseIndex.tags]).forEach(function (tag) {
          if (existing.tags.indexOf(tag) < 0) { existing.tags.push(tag); }
        });
        reportRows.push({ row: excelRow, name: name, status: 'dup-file', message: '文件内重名，已并入上一条' });
        continue;
      }

      var contact = Model.normalizeContact({
        name: name,
        company: baseIndex.company === undefined ? '' : flat[baseIndex.company],
        group: baseIndex.group === undefined ? '' : flat[baseIndex.group],
        tags: baseIndex.tags === undefined ? '' : splitTags(flat[baseIndex.tags]),
        bookmarked: baseIndex.bookmarked === undefined ? false : isTruthy(flat[baseIndex.bookmarked]),
        note: baseIndex.note === undefined ? '' : flat[baseIndex.note],
        methods: methods
      });

      contact.name = name;
      byName[nameKey] = contact;
      contacts.push(contact);
      reportRows.push({ row: excelRow, name: name, status: 'ok', contact: contact });
    }

    return {
      contacts: contacts,
      rows: reportRows,
      issues: issues,
      headers: headers,
      sheetName: sheetName,
      stats: { total: total, valid: contacts.length, invalid: invalid }
    };
  }

  /* ------------------------------ 合并 ------------------------------ */

  function methodSignature(method) {
    return method.type + '|' + Model.normalizeKey(method.value);
  }

  function copyContact(contact) {
    return JSON.parse(JSON.stringify(contact));
  }

  /**
   * 把导入的联系人合并进现有列表。
   * strategy: 'merge'（默认，补充信息）| 'skip'（保留原记录）| 'overwrite'（用导入内容替换）
   * @returns {{contacts:Array, results:Array, report:object}}
   */
  function mergeContacts(existing, incoming, strategy) {
    var mode = strategy || 'merge';
    var contacts = existing.map(copyContact);
    var byName = {};
    contacts.forEach(function (contact) { byName[Model.normalizeKey(contact.name)] = contact; });

    var results = [];
    var report = { total: incoming.length, added: 0, merged: 0, skipped: 0, overwritten: 0 };

    incoming.forEach(function (raw) {
      var contact = copyContact(raw);
      var key = Model.normalizeKey(contact.name);
      var target = byName[key];

      if (!target) {
        byName[key] = contact;
        contacts.push(contact);
        report.added += 1;
        results.push({ contact: contact, incoming: contact, status: 'added' });
        return;
      }

      if (mode === 'skip') {
        report.skipped += 1;
        results.push({ contact: target, incoming: contact, status: 'skipped', existing: target });
        return;
      }

      if (mode === 'overwrite') {
        var keptId = target.id;
        var keptCreatedAt = target.createdAt;
        ['company', 'group', 'tags', 'bookmarked', 'note', 'methods'].forEach(function (field) {
          target[field] = copyContact(contact)[field];
        });
        target.id = keptId;
        target.createdAt = keptCreatedAt;
        target.updatedAt = new Date().toISOString();
        report.overwritten += 1;
        results.push({ contact: target, incoming: contact, status: 'overwritten', existing: target });
        return;
      }

      // merge：联系方式取并集，其余字段只在原记录为空时补齐
      var known = {};
      target.methods.forEach(function (method) { known[methodSignature(method)] = true; });
      contact.methods.forEach(function (method) {
        if (!known[methodSignature(method)]) {
          target.methods.push({
            id: method.id,
            type: method.type,
            value: method.value,
            label: method.label,
            primary: false
          });
          known[methodSignature(method)] = true;
        }
      });
      contact.tags.forEach(function (tag) {
        if (target.tags.indexOf(tag) < 0) { target.tags.push(tag); }
      });
      ['company', 'group', 'note'].forEach(function (field) {
        if (!target[field] && contact[field]) { target[field] = contact[field]; }
      });
      target.bookmarked = target.bookmarked || contact.bookmarked;
      target.updatedAt = new Date().toISOString();
      report.merged += 1;
      results.push({ contact: target, incoming: contact, status: 'merged', existing: target });
    });

    return { contacts: contacts, results: results, report: report };
  }

  return {
    BASE_FIELDS: BASE_FIELDS,
    buildTable: buildTable,
    classifyHeader: classifyHeader,
    decodeCsv: decodeCsv,
    exportWorkbook: exportWorkbook,
    buildTemplate: buildTemplate,
    exportFileName: exportFileName,
    parseWorkbook: parseWorkbook,
    mergeContacts: mergeContacts,
    TYPE_LABELS: TYPE_LABELS
  };
}));
