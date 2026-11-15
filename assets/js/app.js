/* ==========================================================================
 * app.js — 界面控制层
 * --------------------------------------------------------------------------
 * 只处理 DOM 与交互：筛选、渲染、编辑弹窗、收藏切换、Excel 导入导出流程。
 * 数据模型见 model.js，持久化见 store.js，Excel 编解码见 excel.js。
 * ========================================================================== */

(function (root) {
  'use strict';

  var Model = root.AddressBookModel;
  var Store = root.AddressBookStore;
  var Excel = root.AddressBookExcel;
  var XLSX = root.XLSX;

  var state = {
    view: 'all',        // all | bookmarked
    group: null,        // 分组筛选
    tag: null,          // 标签筛选
    query: '',          // 搜索关键字
    sort: 'name'
  };

  var editing = null;       // 正在编辑的联系人（null 表示新建）
  var pendingImport = null; // 解析后的导入结果
  var lastDeleted = null;   // 最近一次删除，用于撤销

  /* ------------------------------ 小工具 ------------------------------ */

  function $(selector, scope) { return (scope || document).querySelector(selector); }
  function $$(selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)); }

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 卡片页脚用：把 ISO 时间显示成「11-12」这种短格式。 */
  function shortDate(iso) {
    var date = new Date(iso || Date.now());
    if (isNaN(date.getTime())) { return '—'; }
    function pad(value) { return String(value).padStart(2, '0'); }
    return pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function debounce(fn, wait) {
    var timer = 0;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  var ICONS = {
    mobile: '<path d="M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M11 18h2"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-4.9A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>',
    star: '<path d="m12 3 2.7 5.9 6.3.7-4.6 4.5 1.2 6.4L12 17.6 6.4 20.5l1.2-6.4L3 9.6l6.3-.7z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<path d="m20 6-11 11-5-5"/>'
  };

  function svg(name, size, extra) {
    var body = ICONS[name] || ICONS.link;
    return '<svg viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) +
      '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' +
      (extra || '') + '>' + body + '</svg>';
  }

  function typeIcon(type) {
    var meta = null;
    Model.METHOD_TYPES.forEach(function (item) { if (item.value === type) { meta = item; } });
    return svg(meta ? meta.icon : 'link', 13);
  }

  function toast(message, kind, action) {
    var box = $('#toasts');
    var node = document.createElement('div');
    node.className = 'toast ' + (kind || '');
    node.innerHTML = '<span class="dot"></span><span class="toast-text">' + esc(message) + '</span>';
    if (action) {
      var btn = document.createElement('button');
      btn.className = 'link-btn';
      btn.textContent = action.label;
      btn.style.color = '#a5b4fc';
      btn.style.marginLeft = '6px';
      btn.addEventListener('click', function () {
        action.run();
        node.remove();
      });
      node.appendChild(btn);
    }
    box.appendChild(node);
    setTimeout(function () {
      node.style.opacity = '0';
      node.style.transform = 'translateY(6px)';
      setTimeout(function () { node.remove(); }, 220);
    }, action ? 6000 : 3200);
  }

  function clearToasts() {
    var box = $('#toasts');
    if (box) { box.innerHTML = ''; }
  }

  /* ------------------------------ 筛选与渲染 ------------------------------ */

  function filterContacts() {
    var list = Store.all().slice();
    var query = state.query.trim().toUpperCase();

    if (state.view === 'bookmarked') {
      list = list.filter(function (contact) { return contact.bookmarked; });
    }
    if (state.group) {
      list = list.filter(function (contact) {
        return (contact.group || '未分组') === state.group;
      });
    }
    if (state.tag) {
      list = list.filter(function (contact) { return contact.tags.indexOf(state.tag) >= 0; });
    }
    if (query) {
      var terms = query.split(/\s+/).filter(Boolean);
      list = list.filter(function (contact) {
        var text = Model.searchText(contact);
        return terms.every(function (term) { return text.indexOf(term) >= 0; });
      });
    }

    return Model.sortContacts(list, state.sort);
  }

  function contactCard(contact) {
    var methods = contact.methods || [];
    var methodsHtml = methods.length
      ? methods.map(function (method) {
        return '<button type="button" class="method" data-action="copy" data-id="' + esc(contact.id) +
          '" data-method="' + esc(method.id) + '" data-type="' + esc(method.type) +
          '" title="点击复制">' +
          '<span class="method-icon">' + typeIcon(method.type) + '</span>' +
          '<span class="method-value">' + esc(method.value) + '</span>' +
          (method.label ? '<span class="method-label">' + esc(method.label) + '</span>' : '') +
          '</button>';
      }).join('')
      : '<span class="methods-empty">还没有联系方式</span>';

    var tagsHtml = '';
    if (contact.group) {
      tagsHtml += '<span class="mini-tag group">' + esc(contact.group) + '</span>';
    }
    contact.tags.forEach(function (tag) {
      tagsHtml += '<span class="mini-tag">' + esc(tag) + '</span>';
    });

    var meta = [];
    if (contact.bookmarked) {
      meta.push('<span class="bookmark-flag">' + svg('star', 12) + '已收藏</span>');
    }
    meta.push('<span>' + methods.length + ' 条联系方式</span>');
    meta.push('<span>·</span><span>' + shortDate(contact.updatedAt) + ' 更新</span>');

    return '' +
      '<article class="card' + (contact.bookmarked ? ' is-bookmarked' : '') + '" role="listitem" data-id="' + esc(contact.id) + '">' +
        '<div class="card-head">' +
          '<span class="avatar" style="background:' + Model.avatarColor(contact.name) + '">' + esc(Model.initials(contact.name)) + '</span>' +
          '<div class="card-ident">' +
            '<div class="card-name-row">' +
              '<span class="card-name" title="' + esc(contact.name) + '">' + esc(contact.name) + '</span>' +
            '</div>' +
            '<div class="card-company" title="' + esc(contact.company) + '">' + esc(contact.company || '—') + '</div>' +
          '</div>' +
          '<button type="button" class="star-btn' + (contact.bookmarked ? ' is-on' : '') + '" data-action="star" data-id="' + esc(contact.id) + '"' +
            ' title="' + (contact.bookmarked ? '取消收藏' : '收藏这个联系人') + '" aria-pressed="' + contact.bookmarked + '">' +
            svg('star', 19) +
          '</button>' +
        '</div>' +
        '<div class="methods">' + methodsHtml + '</div>' +
        '<div class="card-tags">' + tagsHtml + '</div>' +
        '<div class="card-foot">' +
          '<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + meta.join('') + '</span>' +
          '<span class="card-actions">' +
            '<button type="button" class="icon-btn" data-action="edit" data-id="' + esc(contact.id) + '" title="编辑">' + svg('edit', 16) + '</button>' +
            '<button type="button" class="icon-btn danger" data-action="delete" data-id="' + esc(contact.id) + '" title="删除">' + svg('trash', 16) + '</button>' +
          '</span>' +
        '</div>' +
      '</article>';
  }

  function renderSidebar() {
    var counts = Store.stats();
    $('#count-all').textContent = counts.total;
    $('#count-bookmarked').textContent = counts.bookmarked;

    $$('.nav-item').forEach(function (item) {
      item.classList.toggle('is-active', item.getAttribute('data-view') === state.view);
    });

    var groups = Store.groups();
    $('#group-list').innerHTML = groups.map(function (group) {
      return '<li><button type="button" class="chip-row' + (state.group === group.name ? ' is-active' : '') +
        '" data-group="' + esc(group.name) + '">' +
        '<span class="dot"></span><span class="name">' + esc(group.name) + '</span>' +
        '<span class="num">' + group.count + '</span></button></li>';
    }).join('');

    var tags = Store.tags();
    $('#tag-cloud').innerHTML = tags.length
      ? tags.map(function (tag) {
        return '<button type="button" class="tag' + (state.tag === tag.name ? ' is-active' : '') +
          '" data-tag="' + esc(tag.name) + '">#' + esc(tag.name) + '</button>';
      }).join('')
      : '<span class="muted" style="font-size:12px">还没有标签</span>';

    $('#group-options').innerHTML = groups
      .filter(function (group) { return group.name !== '未分组'; })
      .map(function (group) { return '<option value="' + esc(group.name) + '"></option>'; })
      .join('');
  }

  function renderList() {
    var list = filterContacts();
    var grid = $('#list');
    var empty = $('#empty');

    grid.innerHTML = list.map(contactCard).join('');

    var filtering = !!(state.group || state.tag || state.query.trim() || state.view === 'bookmarked');
    empty.hidden = list.length > 0;
    grid.hidden = list.length === 0;

    if (list.length === 0) {
      $('#empty-title').textContent = filtering ? '没有符合条件的联系人' : '还没有联系人';
      $('#empty-text').textContent = filtering
        ? '换个关键字，或清除筛选条件再试一次。'
        : '点击右上角「新建联系人」，或从 Excel 导入已有通讯录。';
    }

    var bar = $('#filter-bar');
    var parts = [];
    if (state.view === 'bookmarked') { parts.push('只看收藏'); }
    if (state.group) { parts.push('分组：' + state.group); }
    if (state.tag) { parts.push('标签：#' + state.tag); }
    if (state.query.trim()) { parts.push('搜索：“' + state.query.trim() + '”'); }
    bar.hidden = parts.length === 0;
    $('#filter-text').textContent = parts.join('　·　') + '（共 ' + list.length + ' 条）';

    $('#view-title').textContent = state.view === 'bookmarked' ? '收藏的联系人' : '全部联系人';
    $('#view-sub').textContent = state.view === 'bookmarked'
      ? '常用的人集中在这里，点卡片右上角的星标可以随时取消收藏'
      : '共 ' + Store.stats().total + ' 位联系人，按姓名浏览你的通讯录';
  }

  function render() {
    renderSidebar();
    renderList();
  }

  /* ------------------------------ 收藏 ------------------------------ */

  function toggleStar(id, button) {
    var contact = Store.toggleBookmark(id);
    if (!contact) { return; }

    if (button) {
      button.classList.toggle('is-on', contact.bookmarked);
      button.setAttribute('aria-pressed', String(contact.bookmarked));
      button.title = contact.bookmarked ? '取消收藏' : '收藏这个联系人';
    }
    renderSidebar();
    // 收藏视图 / 收藏排序下需要整体重排，直接重渲染列表更省心
    if (state.view === 'bookmarked') {
      renderList();
    } else {
      var card = document.querySelector('.card[data-id="' + id + '"]');
      if (card) { card.classList.toggle('is-bookmarked', contact.bookmarked); }
      var foot = card && card.querySelector('.card-foot');
      if (foot) {
        var flag = foot.querySelector('.bookmark-flag');
        if (contact.bookmarked && !flag) {
          foot.firstElementChild.insertAdjacentHTML('afterbegin', '<span class="bookmark-flag">' + svg('star', 12) + '已收藏</span>');
        } else if (!contact.bookmarked && flag) {
          flag.remove();
        }
      }
    }
    toast(contact.bookmarked ? '已收藏「' + contact.name + '」' : '已取消收藏「' + contact.name + '」',
      contact.bookmarked ? 'ok' : '');
  }

  /* ------------------------------ 编辑弹窗 ------------------------------ */

  function methodRowHtml(method) {
    var options = Model.METHOD_TYPES.map(function (type) {
      return '<option value="' + type.value + '"' + (method.type === type.value ? ' selected' : '') + '>' +
        type.label + '</option>';
    }).join('');

    return '' +
      '<div class="method-row" data-method-id="' + esc(method.id) + '">' +
        '<select class="method-select" aria-label="联系方式类型">' + options + '</select>' +
        '<input class="method-input method-value-input" type="text" maxlength="120" placeholder="号码 / 账号 / 地址" value="' + esc(method.value) + '">' +
        '<input class="method-input method-label-input" type="text" maxlength="20" placeholder="备注，如 工作" value="' + esc(method.label) + '">' +
        '<button type="button" class="method-primary' + (method.primary ? ' is-on' : '') + '" title="设为主要联系方式">' +
          '<span></span>' +
        '</button>' +
        '<button type="button" class="method-delete" title="删除这条联系方式">' + svg('trash', 15) + '</button>' +
      '</div>';
  }

  function refreshPrimaryStyles() {
    $$('#method-rows .method-row').forEach(function (row) {
      var isOn = row.querySelector('.method-primary').classList.contains('is-on');
      row.querySelector('.method-primary').title = isOn ? '当前主要联系方式' : '设为主要联系方式';
    });
  }

  function addMethodRow(method) {
    var container = $('#method-rows');
    container.insertAdjacentHTML('beforeend', methodRowHtml(method || Model.emptyMethod('mobile')));
    var rows = $$('#method-rows .method-row');
    if (rows.length === 1) {
      rows[0].querySelector('.method-primary').classList.add('is-on');
    }
    refreshPrimaryStyles();
  }

  function collectMethods() {
    return $$('#method-rows .method-row').map(function (row) {
      return {
        id: row.getAttribute('data-method-id'),
        type: row.querySelector('.method-select').value,
        value: row.querySelector('.method-value-input').value.trim(),
        label: row.querySelector('.method-label-input').value.trim(),
        primary: row.querySelector('.method-primary').classList.contains('is-on')
      };
    }).filter(function (method) { return method.value !== ''; });
  }

  function openEditor(contact) {
    editing = contact || null;
    clearToasts();
    var form = $('#editor-form');
    form.reset();

    var target = contact || Model.emptyContact();
    $('#editor-title').textContent = contact ? '编辑联系人' : '新建联系人';
    $('#editor-submit').textContent = contact ? '保存修改' : '保存';
    form.elements.name.value = target.name || '';
    form.elements.company.value = target.company || '';
    form.elements.group.value = target.group || '';
    form.elements.tags.value = (target.tags || []).join(', ');
    form.elements.note.value = target.note || '';
    form.elements.bookmarked.checked = !!target.bookmarked;

    $$('.field-error').forEach(function (node) { node.textContent = ''; });

    var rows = contact ? target.methods.map(copyForEditor) : [];
    if (!rows.length) { rows = [Model.emptyMethod('mobile')]; }
    $('#method-rows').innerHTML = rows.map(methodRowHtml).join('');
    refreshPrimaryStyles();

    $('#editor').showModal();
    setTimeout(function () { form.elements.name.focus(); }, 60);
  }

  function copyForEditor(method) {
    return { id: method.id, type: method.type, value: method.value, label: method.label, primary: method.primary };
  }

  function submitEditor(event) {
    event.preventDefault();
    var form = $('#editor-form');
    var candidate = {
      id: editing ? editing.id : Model.uid('c'),
      name: form.elements.name.value.trim(),
      company: form.elements.company.value.trim(),
      group: form.elements.group.value.trim(),
      tags: form.elements.tags.value.split(/[,，;；、]+/),
      bookmarked: form.elements.bookmarked.checked,
      note: form.elements.note.value.trim(),
      methods: collectMethods(),
      createdAt: editing ? editing.createdAt : undefined,
      updatedAt: undefined
    };

    var check = Model.validateContact(candidate);
    $$('.field-error').forEach(function (node) {
      node.textContent = check.errors[node.getAttribute('data-error-for')] || '';
    });
    if (!check.ok) {
      var firstInvalid = $('.field-error:not(:empty)');
      if (firstInvalid) { firstInvalid.scrollIntoView({ block: 'nearest' }); }
      return;
    }

    var saved = Store.upsert(candidate);
    $('#editor').close();
    render();
    toast(editing ? '已保存「' + saved.name + '」' : '已添加「' + saved.name + '」', 'ok');
    editing = null;
  }

  /* ------------------------------ 删除 ------------------------------ */

  function deleteContact(id) {
    var contact = Store.get(id);
    if (!contact) { return; }
    var backup = JSON.parse(JSON.stringify(contact));
    Store.remove(id);
    render();

    toast('已删除「' + contact.name + '」', '', {
      label: '撤销',
      run: function () {
        Store.upsert(backup);
        render();
        toast('已恢复「' + backup.name + '」', 'ok');
      }
    });
  }

  /* ------------------------------ 导出 ------------------------------ */

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function exportExcel() {
    if (!XLSX) { toast('Excel 组件没加载成功，请检查 vendor/xlsx.full.min.js', 'err'); return; }
    var list = filterContacts();
    if (!list.length) { toast('当前没有可导出的联系人', 'warn'); return; }

    var workbook = Excel.exportWorkbook(XLSX, list);
    var buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    var filename = Excel.exportFileName();
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);

    var scope = (state.group || state.tag || state.query.trim() || state.view === 'bookmarked') ? '当前筛选结果' : '全部联系人';
    toast('已导出 ' + list.length + ' 条（' + scope + '）→ ' + filename, 'ok');
  }

  function downloadTemplate() {
    if (!XLSX) { toast('Excel 组件没加载成功', 'err'); return; }
    var workbook = Excel.buildTemplate(XLSX);
    var buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      '通讯录导入模板.xlsx');
    toast('模板已下载，照着表头填好再导入即可', 'ok');
  }

  /* ------------------------------ 导入 ------------------------------ */

  function resetImportDialog() {
    pendingImport = null;
    $('#import-preview').hidden = true;
    $('#import-summary').innerHTML = '';
    $('#preview-table').innerHTML = '';
    $('#import-issues').hidden = true;
    $('#btn-do-import').disabled = true;
    $('#import-preview').dataset.strategy = 'merge';
  }

  function openImportDialog() {
    clearToasts();
    resetImportDialog();
    $('#import-dialog').showModal();
  }

  function strategy() {
    var checked = document.querySelector('input[name="strategy"]:checked');
    return checked ? checked.value : 'merge';
  }

  function readFile(file) {
    if (!file) { return; }
    if (!XLSX) { toast('Excel 组件没加载成功，无法解析文件', 'err'); return; }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast('请选择 .xlsx / .xls / .csv 文件', 'warn');
      return;
    }

    var reader = new FileReader();
    reader.onerror = function () { toast('读取文件失败，请重试', 'err'); };
    reader.onload = function () {
      var bytes = new Uint8Array(reader.result);
      // CSV 里中文常见 GBK 编码，交给 excel.js 判断编码后再解析
      var payload = /\.csv$/i.test(file.name) ? Excel.decodeCsv(bytes) : bytes;
      handleParsed(payload, file.name);
    };
    reader.readAsArrayBuffer(file);
  }

  function handleParsed(payload, fileName) {
    var parsed;
    try {
      parsed = Excel.parseWorkbook(XLSX, payload);
    } catch (error) {
      toast('这个文件解析失败：' + error.message, 'err');
      return;
    }

    if (!parsed.contacts.length) {
      var reason = parsed.issues.length ? parsed.issues[0].message : '没有读到任何联系人';
      toast('没有可导入的联系人：' + reason, 'err');
      return;
    }

    pendingImport = parsed;
    pendingImport.fileName = fileName;
    $('#import-preview').hidden = false;
    $('#btn-do-import').disabled = false;
    renderImportPreview();
  }

  function statusOfContactMap(results) {
    var map = {};
    results.forEach(function (result) { map[result.incoming.id] = result.status; });
    return map;
  }

  function renderImportPreview() {
    if (!pendingImport) { return; }
    var parsed = pendingImport;
    var merged = Excel.mergeContacts(Store.all(), parsed.contacts, strategy());
    var statusMap = statusOfContactMap(merged.results);

    var duplicateCount = merged.report.merged + merged.report.skipped + merged.report.overwritten;
    $('#import-summary').innerHTML =
      '<div class="stat"><b>' + parsed.stats.total + '</b><span>表格行数</span></div>' +
      '<div class="stat good"><b>' + parsed.stats.valid + '</b><span>可导入</span></div>' +
      '<div class="stat warn"><b>' + duplicateCount + '</b><span>与现有重复</span></div>' +
      '<div class="stat bad"><b>' + parsed.stats.invalid + '</b><span>无效行</span></div>';

    var labels = {
      added: '<span class="badge new">新增</span>',
      merged: '<span class="badge dup">合并</span>',
      skipped: '<span class="badge dup">跳过</span>',
      overwritten: '<span class="badge dup">覆盖</span>',
      'dup-file': '<span class="badge dup">文件内重名</span>',
      bad: '<span class="badge bad">跳过</span>'
    };

    var rows = parsed.rows.slice(0, 8).map(function (row) {
      var status = row.status;
      if (row.contact && statusMap[row.contact.id]) { status = statusMap[row.contact.id]; }
      var contact = row.contact;
      var methods = contact
        ? contact.methods.slice(0, 3).map(function (method) {
          return Model.methodTypeLabel(method.type) + ' ' + method.value;
        }).join('；') + (contact.methods.length > 3 ? '…' : '')
        : (row.message || '');
      return '<tr>' +
        '<td>' + row.row + '</td>' +
        '<td>' + (labels[status] || '<span class="badge new">新增</span>') + '</td>' +
        '<td>' + esc(row.name || '—') + '</td>' +
        '<td>' + esc(contact ? contact.group : '') + '</td>' +
        '<td class="methods-cell">' + esc(methods) + '</td>' +
        '</tr>';
    }).join('');

    var more = parsed.rows.length > 8
      ? '<tr><td colspan="5" class="muted">… 还有 ' + (parsed.rows.length - 8) + ' 行，导入后可在列表里查看</td></tr>'
      : '';

    $('#preview-table').innerHTML =
      '<thead><tr><th>行号</th><th>状态</th><th>姓名</th><th>分组</th><th>联系方式</th></tr></thead>' +
      '<tbody>' + rows + more + '</tbody>';

    var issues = parsed.issues;
    if (issues.length) {
      $('#import-issues').hidden = false;
      $('#import-issues').innerHTML = '<strong>需要留意的问题（共 ' + issues.length + ' 条）</strong><ul>' +
        issues.map(function (issue) {
          return '<li>第 ' + issue.row + ' 行：' + esc(issue.message) + '</li>';
        }).join('') + '</ul>';
    } else {
      $('#import-issues').hidden = true;
    }
  }

  function confirmImport() {
    if (!pendingImport) { return; }
    var merged = Excel.mergeContacts(Store.all(), pendingImport.contacts, strategy());
    Store.replaceAll(merged.contacts);
    $('#import-dialog').close();
    render();

    var report = merged.report;
    toast('导入完成：新增 ' + report.added + ' 条，合并 ' + report.merged + ' 条，跳过 ' +
      report.skipped + ' 条，覆盖 ' + report.overwritten + ' 条', 'ok');
    pendingImport = null;
  }

  /* ------------------------------ 事件绑定 ------------------------------ */

  function bindEvents() {
    // 视图切换
    $$('.nav-item').forEach(function (item) {
      item.addEventListener('click', function () {
        state.view = item.getAttribute('data-view');
        state.group = null;
        state.tag = null;
        render();
      });
    });

    // 分组 / 标签筛选
    $('#group-list').addEventListener('click', function (event) {
      var button = event.target.closest('[data-group]');
      if (!button) { return; }
      state.group = state.group === button.getAttribute('data-group') ? null : button.getAttribute('data-group');
      state.view = 'all';
      render();
    });

    $('#tag-cloud').addEventListener('click', function (event) {
      var button = event.target.closest('[data-tag]');
      if (!button) { return; }
      state.tag = state.tag === button.getAttribute('data-tag') ? null : button.getAttribute('data-tag');
      state.view = 'all';
      render();
    });

    $('#filter-clear').addEventListener('click', function () {
      state.group = null;
      state.tag = null;
      state.query = '';
      state.view = 'all';
      $('#search').value = '';
      render();
    });

    // 搜索
    var onSearch = debounce(function (value) {
      state.query = value;
      renderList();
    }, 140);
    $('#search').addEventListener('input', function (event) { onSearch(event.target.value); });

    // 排序
    $('#sort').addEventListener('change', function (event) {
      state.sort = event.target.value;
      renderList();
    });

    // 卡片操作
    $('#list').addEventListener('click', function (event) {
      var target = event.target.closest('[data-action]');
      if (!target) { return; }
      var id = target.getAttribute('data-id');
      var action = target.getAttribute('data-action');

      if (action === 'star') {
        toggleStar(id, target);
      } else if (action === 'edit') {
        openEditor(Store.get(id));
      } else if (action === 'delete') {
        deleteContact(id);
      } else if (action === 'copy') {
        var contact = Store.get(id);
        var method = null;
        (contact.methods || []).forEach(function (item) {
          if (item.id === target.getAttribute('data-method')) { method = item; }
        });
        if (method) { copyValue(method); }
      }
    });

    // 新建
    $('#btn-new').addEventListener('click', function () { openEditor(null); });

    // 编辑器
    $('#editor-form').addEventListener('submit', submitEditor);
    $('#btn-add-method').addEventListener('click', function () {
      addMethodRow(Model.emptyMethod('email'));
      var rows = $$('#method-rows .method-row');
      rows[rows.length - 1].querySelector('.method-value-input').focus();
    });

    $('#method-rows').addEventListener('click', function (event) {
      var row = event.target.closest('.method-row');
      if (!row) { return; }

      if (event.target.closest('.method-delete')) {
        var rows = $$('#method-rows .method-row');
        if (rows.length === 1) {
          row.querySelector('.method-value-input').value = '';
          row.querySelector('.method-label-input').value = '';
        } else {
          row.remove();
        }
        refreshPrimaryStyles();
        return;
      }

      if (event.target.closest('.method-primary')) {
        $$('#method-rows .method-primary').forEach(function (node) { node.classList.remove('is-on'); });
        event.target.closest('.method-primary').classList.add('is-on');
        refreshPrimaryStyles();
      }
    });

    // 导出 / 导入
    $('#btn-export').addEventListener('click', exportExcel);
    $('#btn-import').addEventListener('click', openImportDialog);
    $('#btn-template').addEventListener('click', downloadTemplate);
    $('#btn-do-import').addEventListener('click', confirmImport);

    $$('input[name="strategy"]').forEach(function (radio) {
      radio.addEventListener('change', renderImportPreview);
    });

    $('#btn-pick-file').addEventListener('click', function () { $('#file-input').click(); });
    $('#file-input').addEventListener('change', function (event) {
      readFile(event.target.files[0]);
      event.target.value = '';
    });

    var dropzone = $('#dropzone');
    dropzone.addEventListener('click', function (event) {
      if (event.target.closest('.link-btn')) { return; }
      $('#file-input').click();
    });
    ['dragenter', 'dragover'].forEach(function (name) {
      dropzone.addEventListener(name, function (event) {
        event.preventDefault();
        dropzone.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      dropzone.addEventListener(name, function (event) {
        event.preventDefault();
        dropzone.classList.remove('is-over');
      });
    });
    dropzone.addEventListener('drop', function (event) {
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      readFile(file);
    });

    // 关闭弹窗
    $$('[data-close]').forEach(function (button) {
      button.addEventListener('click', function () { button.closest('dialog').close(); });
    });
    $$('dialog').forEach(function (dialog) {
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) { dialog.close(); }
      });
    });
    $('#editor').addEventListener('close', function () { editing = null; });

    // 恢复示例数据
    $('#btn-seed').addEventListener('click', function () {
      var backup = Store.snapshot();
      Store.resetToSeed();
      render();
      toast('已恢复示例数据', 'ok', {
        label: '撤销',
        run: function () {
          Store.replaceAll(backup);
          render();
        }
      });
    });

    // 快捷键
    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        $('#search').focus();
        $('#search').select();
      }
      if (event.key === 'Escape') {
        $$('dialog[open]').forEach(function (dialog) { dialog.close(); });
      }
    });
  }

  function copyValue(method) {
    var text = method.value;
    function done() { toast('已复制：' + text, 'ok'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      var input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      try { document.execCommand('copy'); done(); } catch (error) { toast('复制失败，请手动选择文本', 'err'); }
      input.remove();
    }
  }

  /* ------------------------------ 启动 ------------------------------ */

  function boot() {
    Store.load();
    bindEvents();
    $('#sort').value = state.sort;
    render();

    if (!Store.isStorageAvailable()) {
      toast('浏览器禁用了本地存储，本次修改只在当前页面有效', 'warn');
    }
    if (!XLSX) {
      toast('未能加载 Excel 组件（vendor/xlsx.full.min.js），导入导出将不可用', 'err');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this));
