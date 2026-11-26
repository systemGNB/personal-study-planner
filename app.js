/*
 * Тренажёр аналитика — офлайн PWA.
 * Всё содержимое — в data/ (см. docs/CONTENT.md): manifest.json перечисляет наборы вопросов,
 * темы, настройки, план недель и список изменений. Код менять не нужно, чтобы добавить вопросы или тему.
 * Новый формат вопроса = новая запись в TYPES (раздел «Типы вопросов»).
 * Прогресс — в localStorage телефона.
 */
(function () {
  'use strict';

  // =====================================================================
  // Константы интерфейса
  // =====================================================================
  var KEY = 'analyst-trainer.v1';
  var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var WD = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  var WD_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  var STYLE_PILL = { lav: 'var(--lav)', red: 'var(--red)', peri: 'var(--peri)', pink: 'var(--pink)', ink: 'var(--pill-ink)', outline: 'var(--pill-outline)' };
  var SKINS = [['accent', 'Акцент'], ['bright', 'Яркое'], ['paper', 'Бумага'], ['sage', 'Шалфей'], ['sky', 'Небо']];

  var ACH = [
    { id: 'first', ic: '●', t: 'Первый раунд', d: 'Пройти один раунд' },
    { id: 'streak3', ic: '✦', t: 'Серия 3 дня', d: '3 дня подряд с раундом' },
    { id: 'streak7', ic: '✦', t: 'Серия 7 дней', d: '7 дней подряд с раундом' },
    { id: 'streak30', ic: '✦', t: 'Серия 30 дней', d: '30 дней подряд с раундом' },
    { id: 'perfect1', ic: '★', t: 'Раунд без ошибок', d: '10 из 10 верно' },
    { id: 'perfect5', ic: '★', t: '5 раундов без ошибок', d: 'Пять раундов 10 из 10' },
    { id: 'answers100', ic: '◆', t: '100 ответов', d: 'Ответить на 100 вопросов' },
    { id: 'answers500', ic: '◆', t: '500 ответов', d: 'Ответить на 500 вопросов' },
    { id: 'detective', ic: '⌕', t: 'Детектив SQL', d: 'Найти 10 ошибок в запросах' },
    { id: 'fixer', ic: '↺', t: 'Работа над ошибками', d: 'Пройти 5 раундов по слабым местам' },
    { id: 'metricsAll', ic: '▲', t: 'Все метрики', d: 'Выучить все продуктовые и маркетинговые метрики' },
    { id: 'weekMin', ic: '▦', t: 'Минимум недели', d: 'Закрыть весь минимум недели' },
    { id: 'weekMax', ic: '▦', t: 'Максимум недели', d: 'Закрыть весь максимум недели' }
  ];

  // =====================================================================
  // Данные (загружаются из data/)
  // =====================================================================
  var CFG = {
    roundSize: 10, dailyNewDefault: 10, intervals: [0, 1, 3, 7, 14, 30, 60], learnedBox: 2,
    xp: { r: 10, p: 5, w: 2 }, levels: [[0, 'Стажёр']]
  };
  var VERSION = '', TOPICS = [], TOPIC = {}, QS = [], BY_ID = {}, WEEKS = [], CHANGES = [];

  // =====================================================================
  // Хранилище прогресса
  // =====================================================================
  var mem = null;
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = mem; }
    s = s || {};
    s.q = s.q || {}; s.log = s.log || []; s.days = s.days || {}; s.xp = s.xp || 0;
    s.perfect = s.perfect || 0; s.found = s.found || 0; s.weakRounds = s.weakRounds || 0;
    s.ach = s.ach || {}; s.week = s.week || {}; s.notes = s.notes || {};
    s.settings = s.settings || {}; s.bank = s.bank || { count: 0, version: '' };
    return s;
  }
  function save() { mem = S; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* без localStorage работаем в памяти */ } }
  var S = load();
  function applySkin() {
    var k = S.settings.skin || 'accent', root = document.documentElement;
    if (!SKINS.some(function (x) { return x[0] === k; })) k = 'accent';
    if (k === 'bright') root.removeAttribute('data-skin'); else root.setAttribute('data-skin', k);
    var bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    Array.prototype.forEach.call(document.querySelectorAll('meta[name=theme-color]'), function (m) { m.setAttribute('content', k === 'bright' ? m.getAttribute('data-c') : bg); });
  }
  applySkin();

  // =====================================================================
  // Даты и утилиты
  // =====================================================================
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { return iso(new Date()); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
  function monday(s) { var d = parse(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso(d); }
  function human(s) { var d = parse(s); return d.getDate() + ' ' + MONTHS[d.getMonth()]; }
  function shortD(s) { var d = parse(s); return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()]; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(text) { return esc(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>'); }
  function $(sel) { return document.querySelector(sel); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function plural(n, one, few, many) { var a = n % 10, b = n % 100; if (a === 1 && b !== 11) return one; if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few; return many; }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2800); }

  // автопроверка: регистр, пробелы, кавычки, $, «,»/«;»/«.» не важны
  function norm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»“”„]/g, '"').replace(/[\s ]+/g, '')
      .replace(/^=/, '').replace(/×/g, '*').replace(/\$/g, '');
  }
  function variants(s) { var n = norm(s); return [n, n.replace(/,/g, ';'), n.replace(/,/g, '.')]; }
  function autoMatch(input, accept) {
    var vi = variants(input);
    return (accept || []).some(function (a) { var va = variants(a); return vi.some(function (x) { return va.indexOf(x) >= 0; }); });
  }

  // =====================================================================
  // Загрузка данных по манифесту
  // =====================================================================
  function fetchJSON(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }); }
  function opt(url) { return url ? fetchJSON('data/' + url).catch(function () { return null; }) : Promise.resolve(null); }

  function loadData() {
    return fetchJSON('data/manifest.json').then(function (m) {
      return Promise.all([opt(m.config), opt(m.topics), opt(m.weeks), opt(m.changelog)].concat((m.packs || []).map(opt)))
        .then(function (r) {
          if (r[0]) for (var k in r[0]) CFG[k] = r[0][k];
          if (r[1]) { TOPICS = r[1].topics || []; TOPIC = {}; TOPICS.forEach(function (t) { TOPIC[t.id] = t; }); }
          if (r[2]) WEEKS = r[2].weeks || [];
          if (r[3]) CHANGES = r[3].entries || [];
          var qs = [], seen = {};
          r.slice(4).forEach(function (p) {
            if (!p) return;
            (p.questions || []).forEach(function (q) {
              if (!q || !q.id || seen[q.id] || !TYPES[q.type] || !TOPIC[q.topic]) return; // незнакомое пропускаем, а не падаем
              q.pack = p.pack; seen[q.id] = 1; qs.push(q);
            });
          });
          QS = qs; BY_ID = {}; QS.forEach(function (q) { BY_ID[q.id] = q; });
          VERSION = m.version || '';
          var n = QS.length;
          if (S.bank.count && n > S.bank.count) setTimeout(function () { toast('Новые вопросы: +' + (n - S.bank.count)); }, 500);
          else if (S.bank.version && VERSION && VERSION !== S.bank.version) setTimeout(function () { toast('Приложение обновлено — смотри «Что нового» в «Прогрессе»'); }, 500);
          S.bank = { count: n, version: VERSION, checked: today(), seen: S.bank.seen || '' }; save();
        });
    });
  }

  // =====================================================================
  // Интервальные повторения
  // =====================================================================
  function st(id) { return S.q[id]; }
  function isLearned(id) { var s = st(id); return !!(s && s.box >= CFG.learnedBox); }
  function inScope(q, f) {
    if (!f) return true;
    if (f.topic && q.topic !== f.topic) return false;
    if (f.tag && (q.tags || []).indexOf(f.tag) < 0) return false;
    if (f.idset && !f.idset[q.id]) return false;
    return true;
  }
  // темы недели: блоки вопросов из data/weeks.json → focus
  function setOf(ids) { var o = {}; (ids || []).forEach(function (i) { o[i] = 1; }); return o; }
  function weekFocus() { var w = currentWeek(); return (w && w.focus) || []; }
  function blockScope(b) { return { idset: setOf(b.ids), name: b.name }; }
  function weekScope() { var ids = []; weekFocus().forEach(function (b) { ids = ids.concat(b.ids); }); return ids.length ? { idset: setOf(ids), name: 'Темы недели' } : null; }
  function scopeStats(f) {
    var qs = QS.filter(function (q) { return inScope(q, f); });
    var learned = qs.filter(function (q) { return isLearned(q.id); }).length, seen = qs.filter(function (q) { return st(q.id); }).length;
    var p = qs.length ? learned / qs.length : 0;
    return { total: qs.length, learned: learned, seen: seen, pct: p, lvl: Math.min(5, Math.floor(p * 5 + 1e-9)) };
  }
  function dueList(f) {
    var t = today();
    return QS.filter(function (q) { var s = st(q.id); return s && s.due <= t && inScope(q, f); })
      .sort(function (a, b) { return st(a.id).due < st(b.id).due ? -1 : 1; });
  }
  function newList(f) { return QS.filter(function (q) { return !st(q.id) && inScope(q, f); }); }
  function dailyNew() { return S.settings.dailyNew || CFG.dailyNewDefault; }
  function dayRec(d) { d = d || today(); return S.days[d] || (S.days[d] = { rounds: 0, answers: 0, fresh: 0 }); }
  function newLeft() { return Math.max(0, dailyNew() - dayRec().fresh); }
  function weakness(q) { var s = st(q.id); if (!s) return 0; var n = s.right + s.wrong + (s.partial || 0); return n ? (s.wrong + 0.5 * (s.partial || 0)) / n : 0; }
  function weakList(f) {
    return QS.filter(function (q) { return weakness(q) > 0 && !isLearned(q.id) && inScope(q, f); }) // выученные выходят из списка
      .sort(function (a, b) { return weakness(b) - weakness(a) || (st(b.id).wrong - st(a.id).wrong); });
  }

  function grade(q, g, mode) {
    var t = today(), s = st(q.id), isNew = !s, I = CFG.intervals;
    if (!s) s = S.q[q.id] = { box: 0, due: t, right: 0, wrong: 0, partial: 0 };
    var early = (mode === 'free' || mode === 'weak' || mode === 'tag') && s.due > t; // досрочный повтор не двигает вверх
    if (g === 'r') {
      s.right++;
      if (!early) { s.box = Math.min(s.box + 1, I.length - 1); s.due = addDays(t, I[s.box]); }
      if (s.box >= CFG.learnedBox && !s.learnedAt) s.learnedAt = t;
    } else if (g === 'p') {
      s.partial = (s.partial || 0) + 1;
      if (!early) { s.box = Math.max(s.box, 1); s.due = addDays(t, 1); }
    } else {
      s.wrong++; s.box = 0; s.due = addDays(t, 1);
    }
    var dr = dayRec(); dr.answers++; if (isNew) dr.fresh++;
    S.xp += CFG.xp[g];
    S.log.push({ d: t, id: q.id, g: g });
    if (q.type === 'find' && g !== 'w') S.found++;
    save();
  }

  // =====================================================================
  // Уровни, серии, достижения
  // =====================================================================
  function level(xp) {
    var L = CFG.levels, i = 0; while (i + 1 < L.length && xp >= L[i + 1][0]) i++;
    return { n: i + 1, total: L.length, name: L[i][1], from: L[i][0], to: L[i + 1] ? L[i + 1][0] : null, next: L[i + 1] ? L[i + 1][1] : null };
  }
  function streak() {
    var d = today(), n = 0;
    if (!(S.days[d] && S.days[d].rounds)) d = addDays(d, -1);
    while (S.days[d] && S.days[d].rounds) { n++; d = addDays(d, -1); }
    return n;
  }
  function topicStats(id) {
    var qs = QS.filter(function (q) { return q.topic === id; });
    var learned = qs.filter(function (q) { return isLearned(q.id); }).length;
    var seen = qs.filter(function (q) { return st(q.id); }).length;
    var p = qs.length ? learned / qs.length : 0;
    return { total: qs.length, learned: learned, seen: seen, pct: p, lvl: Math.min(5, Math.floor(p * 5 + 1e-9)) };
  }
  function checkAch() {
    var got = [];
    function give(id) { if (!S.ach[id]) { S.ach[id] = today(); got.push(id); } }
    var answers = S.log.length, sk = streak();
    if (Object.keys(S.days).some(function (k) { return S.days[k].rounds > 0; })) give('first');
    if (sk >= 3) give('streak3'); if (sk >= 7) give('streak7'); if (sk >= 30) give('streak30');
    if (S.perfect >= 1) give('perfect1'); if (S.perfect >= 5) give('perfect5');
    if (answers >= 100) give('answers100'); if (answers >= 500) give('answers500');
    if (S.found >= 10) give('detective'); if (S.weakRounds >= 5) give('fixer');
    var mq = QS.filter(function (q) { return q.topic === 'metrics' || q.topic === 'marketing'; });
    if (mq.length && mq.every(function (q) { return isLearned(q.id); })) give('metricsAll');
    WEEKS.forEach(function (w) {
      var ws = S.week[w.id]; if (!ws) return;
      if (w.min && w.min.length && w.min.every(function (_, i) { return ws.min && ws.min[i]; })) give('weekMin');
      if (w.max && w.max.length && w.max.every(function (_, i) { return ws.max && ws.max[i]; })) give('weekMax');
    });
    if (got.length) save();
    return got;
  }
  function achName(id) { for (var i = 0; i < ACH.length; i++) if (ACH[i].id === id) return ACH[i].t; return id; }

  // =====================================================================
  // Типы вопросов. Каждый тип: render(q, ui) → HTML и act: { действие(q, ui, el) }.
  // Чтобы добавить формат — добавь запись сюда и опиши поля в docs/CONTENT.md.
  // =====================================================================
  function answerBox(text, label, extra) { return '<div class="ans' + (extra || '') + '"><div class="lbl">' + (label || 'Ответ') + '</div>' + fmt(text) + '</div>'; }
  function mineBox(text, label) { return text ? '<div class="ans"><div class="lbl">' + label + '</div><div class="mine">' + esc(text) + '</div></div>' : ''; }
  function nextBtn() { return '<button class="btn full" data-act="next">' + (R.i + 1 < R.items.length ? 'Дальше' : 'Завершить') + '</button>'; }
  function readText() { var ta = $('#answer'); return ta ? ta.value : (R.ui.text || ''); }

  var TYPES = {
    // --- ввод ответа: check = "self" (самооценка) или "auto" (сверка с accept) ---
    input: {
      render: function (q, ui) {
        var auto = q.check === 'auto', h = '';
        if (!ui.revealed) {
          return '<textarea id="answer" rows="' + (auto ? 2 : 4) + '" placeholder="' + (auto ? 'Твой ответ' : 'Напиши, как вспомнишь') + '"></textarea>' +
            '<div class="actions"><button class="btn full" data-act="reveal">' + (auto ? 'Проверить' : 'Показать ответ') + '</button></div>';
        }
        h += mineBox(ui.text, 'Твой ответ') + answerBox(q.a, 'Эталон');
        if (q.blocks && ui.showBlocks) h += blocksHtml(q, ui);
        h += '<div class="actions">';
        if (!ui.g) {
          h += '<div class="grades"><button class="btn g-ok" data-act="grade" data-g="r">Верно</button><button class="btn g-mid" data-act="grade" data-g="p">Частично</button><button class="btn g-bad" data-act="grade" data-g="w">Не вспомнила</button></div>';
        } else {
          if (auto && ui.g === 'w' && !ui.overridden) h += '<button class="btn ghost full" data-act="override">Засчитать как верно</button>';
          if (q.blocks && ui.g !== 'r' && !ui.showBlocks) h += '<button class="btn ghost full" data-act="blocks">Подсказка: собрать из блоков</button>';
          h += nextBtn();
        }
        return h + '</div>';
      },
      act: {
        reveal: function (q, ui) { ui.text = readText(); ui.revealed = true; if (q.check === 'auto') finishQ(autoMatch(ui.text, q.accept) ? 'r' : 'w'); },
        grade: function (q, ui, el) { finishQ(el.getAttribute('data-g')); if (q.blocks && ui.g !== 'r') ui.showBlocks = true; },
        override: function (q, ui) {
          // отменить автооценку «неверно» и засчитать как верно
          S.log.pop(); S.xp -= CFG.xp.w; dayRec().answers--;
          var s = st(q.id); s.wrong = Math.max(0, s.wrong - 1);
          if (ui.prev) { s.box = ui.prev.box; s.due = ui.prev.due; } else { s.box = 0; s.due = today(); }
          ui.overridden = true; finishQ('r');
        },
        blocks: function (q, ui) { ui.showBlocks = true; },
        blk: function (q, ui, el) { ui.bl.line.push(+el.getAttribute('data-b')); },
        unblk: function (q, ui, el) { ui.bl.line.splice(+el.getAttribute('data-pos'), 1); }
      }
    },

    // --- расставь по порядку: items в правильном порядке ---
    order: {
      render: function (q, ui) {
        if (!ui.ord) { var idx = q.items.map(function (_, i) { return i; }), sh; do { sh = shuffle(idx); } while (q.items.length > 1 && sh.join() === idx.join()); ui.ord = { view: sh, pick: [] }; }
        var h = '';
        ui.ord.view.forEach(function (ii) {
          var p = ui.ord.pick.indexOf(ii), cls = p >= 0 ? ' on' : '';
          if (ui.g) cls += (p === ii ? ' ok' : ' bad');
          h += '<button class="ord' + cls + '" data-act="ord" data-i="' + ii + '"><span class="num">' + (p >= 0 ? p + 1 : '') + '</span><span>' + esc(q.items[ii]) + '</span>' +
            (ui.g && p !== ii ? '<span class="fix">→ ' + (ii + 1) + '</span>' : '') + '</button>';
        });
        h += '<div class="actions">';
        if (!ui.g) h += '<button class="btn full" data-act="checkord"' + (ui.ord.pick.length < q.items.length ? ' disabled' : '') + '>Проверить</button>';
        else { if (q.a) h += answerBox(q.a, 'Пояснение'); h += nextBtn(); }
        return h + '</div>';
      },
      act: {
        ord: function (q, ui, el) { if (ui.g) return; var ii = +el.getAttribute('data-i'), p = ui.ord.pick.indexOf(ii); if (p >= 0) ui.ord.pick.splice(p, 1); else ui.ord.pick.push(ii); },
        checkord: function (q, ui) { finishQ(ui.ord.pick.every(function (v, i) { return v === i; }) ? 'r' : 'w'); }
      }
    },

    // --- найди ошибку: code — строки из элементов, err — [[строка, элемент], …] ---
    find: {
      render: function (q, ui) {
        var h = '<div class="code find">';
        q.code.forEach(function (line, li) {
          h += '<span class="ln"><span class="no">' + (li + 1) + '</span><span class="toks">';
          line.forEach(function (tok, ti) {
            var key = li + ':' + ti, cls = 'tok', isErr = q.err.some(function (e) { return e[0] === li && e[1] === ti; });
            if (ui.revealed) { if (isErr) cls += ' right'; else if (ui.sel === key) cls += ' wrong'; } else if (ui.sel === key) cls += ' sel';
            h += '<button class="' + cls + '" data-act="tok" data-k="' + key + '">' + esc(tok) + '</button> ';
          });
          h += '</span></span>';
        });
        h += '</div>';
        if (!ui.revealed) {
          return h + '<p class="muted small mt">Нажми на проблемный элемент и напиши, что с ним не так.</p><textarea id="answer" rows="3" placeholder="Что не так"></textarea>' +
            '<div class="actions"><button class="btn full" data-act="checkfind"' + (ui.sel ? '' : ' disabled') + '>Проверить</button></div>';
        }
        h += mineBox(ui.text, 'Твоё объяснение') + answerBox(q.a, ui.hit ? 'Элемент найден верно · Разбор' : 'Ошибка в зелёном элементе · Разбор') + '<div class="actions">';
        if (!ui.g) h += '<div class="grades two"><button class="btn g-ok" data-act="grade" data-g="r">Объяснила верно</button><button class="btn g-mid" data-act="grade" data-g="p">Объяснила частично</button></div>';
        else h += nextBtn();
        return h + '</div>';
      },
      act: {
        tok: function (q, ui, el) { if (ui.revealed) return; ui.text = readText(); var k = el.getAttribute('data-k'); ui.sel = ui.sel === k ? null : k; },
        checkfind: function (q, ui) {
          ui.text = readText(); ui.revealed = true; var sp = ui.sel.split(':');
          ui.hit = q.err.some(function (e) { return e[0] === +sp[0] && e[1] === +sp[1]; });
          if (!ui.hit) finishQ('w');
        },
        grade: function (q, ui, el) { finishQ(el.getAttribute('data-g')); }
      }
    },

    // --- какой вариант неправильный: options, wrong — индекс неверного, plain — текст вместо кода ---
    pick: {
      render: function (q, ui) {
        var h = '', L = 'ABCDEF';
        q.options.forEach(function (o, i) {
          var cls = 'opt'; if (ui.g) { if (i === q.wrong) cls += ' ok'; else if (i === ui.pick) cls += ' bad'; }
          h += '<button class="' + cls + '" data-act="pick" data-i="' + i + '"' + (ui.g ? ' disabled' : '') + '><span class="k">' + L[i] + '</span>' +
            (q.plain ? '<div>' + esc(o) + '</div>' : '<div class="code">' + esc(o) + '</div>') + '</button>';
        });
        if (ui.g) h += answerBox(q.a, ui.g === 'r' ? 'Верно · Разбор' : 'Неправильный — ' + L[q.wrong] + ' · Разбор') + '<div class="actions">' + nextBtn() + '</div>';
        return h;
      },
      act: { pick: function (q, ui, el) { if (ui.g) return; ui.pick = +el.getAttribute('data-i'); finishQ(ui.pick === q.wrong ? 'r' : 'w'); } }
    }
  };

  function blocksHtml(q, ui) {
    if (!ui.bl) ui.bl = { pool: shuffle(q.blocks.map(function (b, i) { return i; })), line: [] };
    var h = '<div class="ans neutral"><div class="lbl">Собери из блоков</div><div class="assembled">';
    ui.bl.line.forEach(function (bi, pos) { h += '<button class="blk" data-act="unblk" data-pos="' + pos + '">' + esc(q.blocks[bi]) + '</button>'; });
    h += '</div><div class="blocks">';
    ui.bl.pool.forEach(function (bi) { if (ui.bl.line.indexOf(bi) < 0) h += '<button class="blk" data-act="blk" data-b="' + bi + '">' + esc(q.blocks[bi]) + '</button>'; });
    h += '</div>';
    if (ui.bl.line.length === q.blocks.length) {
      var ok = ui.bl.line.map(function (bi) { return q.blocks[bi]; }).join('|') === q.blocks.join('|');
      h += '<div class="small" style="font-weight:700;color:' + (ok ? 'var(--ok)' : 'var(--bad)') + '">' + (ok ? 'Собрано верно' : 'Порядок не тот, попробуй ещё') + '</div>';
    }
    return h + '</div>';
  }

  // =====================================================================
  // Код доступа: спрашивается один раз на устройстве (хэш кода — в data/config.json → pin)
  // =====================================================================
  function sha256(str) {
    function rr(v, n) { return (v >>> n) | (v << (32 - n)); }
    var K = [], H = [], i, j, isP = {}, c = 0;
    for (var cand = 2; c < 64; cand++) {
      if (!isP[cand]) { for (i = 0; i < 313; i += cand) isP[i] = cand; if (c < 8) H[c] = (Math.pow(cand, .5) * 4294967296) | 0; K[c++] = (Math.pow(cand, 1 / 3) * 4294967296) | 0; }
    }
    str = unescape(encodeURIComponent(str));
    var bytes = [], bitLen = str.length * 8;
    for (i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
    bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bitLen >>> (i * 8)) & 255);
    for (j = 0; j < bytes.length; j += 64) {
      var w = [], a = H.slice(0);
      for (i = 0; i < 64; i++) {
        if (i < 16) w[i] = (bytes[j + i * 4] << 24) | (bytes[j + i * 4 + 1] << 16) | (bytes[j + i * 4 + 2] << 8) | bytes[j + i * 4 + 3];
        else { var w15 = w[i - 15], w2 = w[i - 2]; w[i] = (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0; }
        var t1 = (a[7] + (rr(a[4], 6) ^ rr(a[4], 11) ^ rr(a[4], 25)) + ((a[4] & a[5]) ^ (~a[4] & a[6])) + K[i] + w[i]) | 0;
        var t2 = ((rr(a[0], 2) ^ rr(a[0], 13) ^ rr(a[0], 22)) + ((a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2]))) | 0;
        a = [(t1 + t2) | 0].concat(a); a[4] = (a[4] + t1) | 0; a.pop();
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + a[i]) | 0;
    }
    var hex = ''; for (i = 0; i < 8; i++) for (j = 3; j >= 0; j--) { var b = (H[i] >>> (j * 8)) & 255; hex += (b < 16 ? '0' : '') + b.toString(16); }
    return hex;
  }
  var LOCKED = false, PIN = { v: '', err: false };
  function needPin() { return !!(CFG.pin && CFG.pin.hash && S.settings.unlocked !== CFG.pin.hash); }
  function renderLock() {
    document.body.classList.add('locked');
    var dots = ''; for (var i = 0; i < 4; i++) dots += '<span class="pd' + (i < PIN.v.length ? ' on' : '') + '"></span>';
    var keys = ''; ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach(function (k) {
      keys += k === '' ? '<span></span>' : '<button class="pk" data-act="' + (k === '⌫' ? 'pinback' : 'pin') + '" data-d="' + k + '" aria-label="' + (k === '⌫' ? 'Стереть' : k) + '">' + k + '</button>';
    });
    $('#view').innerHTML = '<div class="lock"><div class="lock-t">Введите код</div><div class="pdots' + (PIN.err ? ' err' : '') + '">' + dots + '</div>' +
      '<div class="lock-m">' + (PIN.err ? 'Неверный код' : '&nbsp;') + '</div><div class="pkeys">' + keys + '</div></div>';
  }
  function pinInput(d) {
    if (PIN.v.length >= 4) return;
    PIN.v += d; PIN.err = false;
    if (PIN.v.length < 4) return renderLock();
    var h = sha256(CFG.pin.salt + ':' + PIN.v);
    if (h === CFG.pin.hash) {
      S.settings.unlocked = h; save(); LOCKED = false; PIN = { v: '', err: false };
      document.body.classList.remove('locked'); checkAch(); render();
    } else { PIN = { v: '', err: true }; renderLock(); }
  }

  // =====================================================================
  // Навигация
  // =====================================================================
  var tab = 'home', R = null, sub = null; // sub — экран внутри вкладки (report)
  function setTab(t) {
    tab = t; R = null; sub = null; document.body.classList.remove('in-round');
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
    render(); window.scrollTo(0, 0);
  }
  function render() {
    if (LOCKED) return renderLock();
    if (R) return renderRound();
    if (sub === 'report') return renderReport();
    if (tab === 'home') renderHome(); else if (tab === 'week') renderWeek(); else renderProgress();
  }

  // =====================================================================
  // Главная
  // =====================================================================
  var BLOB = '<svg class="blob" viewBox="0 0 200 200" aria-hidden="true"><path d="M100 18c14 0 22 16 26 30 10-12 28-20 40-10s6 30-4 42c16 2 32 12 30 28s-22 22-38 20c6 14 8 34-6 42s-30-4-38-16c-8 12-24 24-38 16s-12-28-6-42c-16 2-36-4-38-20s14-26 30-28C48 68 42 48 54 38s30-2 40 10c4-14 12-30 26-30z" transform="translate(-10 0)"/></svg>';

  function weekDays() {
    var m = monday(today()), t = today(), out = '';
    for (var i = 0; i < 7; i++) {
      var d = addDays(m, i), done = S.days[d] && S.days[d].rounds > 0;
      out += '<div class="day' + (done ? ' on' : '') + (d === t ? ' today' : '') + '"><span class="st">' + (done ? '★' : '') + '</span>' + WD_SHORT[i] + '<b>' + parse(d).getDate() + '</b></div>';
    }
    return '<div class="days">' + out + '</div>';
  }
  function allTags() {
    var c = {}; QS.forEach(function (q) { (q.tags || []).forEach(function (t) { c[t] = (c[t] || 0) + 1; }); });
    return Object.keys(c).sort().map(function (t) { return { t: t, n: c[t] }; });
  }

  function renderHome() {
    var t = today(), d = parse(t), due = dueList().length, nl = Math.min(newLeft(), newList(weekScope()).length), sk = streak(), weak = weakList().length;
    var html = '<div class="top"><div><h1>Тренажёр</h1><div class="date">' + WD[d.getDay()] + ', ' + human(t) + '</div></div>' +
      '<div class="chips"><span class="chip">🔥 ' + sk + '</span><span class="chip">' + S.xp + ' XP</span></div></div>';
    html += '<div class="hero">' + BLOB + '<h1>Раунд дня</h1>';
    if (!QS.length) html += '<p>Вопросы не загрузились. Подключись к интернету один раз и открой приложение снова.</p></div>';
    else if (due + nl > 0) html += '<p>К повторению: <b>' + due + '</b> · Новых: <b>' + nl + '</b></p><button class="btn light" data-act="start">Начать раунд</button></div>';
    else html += '<p>На сегодня всё: повторы сделаны, новые вопросы дня открыты.</p><button class="btn light" data-act="free">Свободная тренировка</button></div>';
    html += weekDays();
    if (weak) html += '<button class="card row weak" data-act="weak" style="width:100%;text-align:left"><div><h3>Работа над ошибками</h3><div class="muted small">' + weak + ' ' + plural(weak, 'вопрос', 'вопроса', 'вопросов') + ', где ты ошибалась</div></div><span class="link">Начать</span></button>';
    var focus = weekFocus();
    if (focus.length) {
      html += '<h2>Темы недели</h2><div class="grid">';
      focus.forEach(function (b, bi) {
        var f = blockScope(b), ts = scopeStats(f); if (!ts.total) return;
        var dk = dueList(f).length;
        html += '<button class="tile s-' + esc(b.style || 'outline') + (focus.length % 2 && bi === focus.length - 1 ? ' wide' : '') + '" data-act="block" data-b="' + bi + '"><div><div class="lvl">Уровень ' + ts.lvl + ' из 5</div><h3>' + esc(b.name) + '</h3></div>' +
          '<div><div class="bar"><i style="width:' + Math.round(ts.pct * 100) + '%"></i></div><div class="meta">' + ts.learned + ' из ' + ts.total + ' выучено' + (dk ? ' · повторить ' + dk : '') + '</div></div></button>';
      });
      html += '</div>';
    } else {
    html += '<h2>Темы</h2><div class="grid">';
    TOPICS.forEach(function (tp) {
      var ts = topicStats(tp.id); if (!ts.total) return;
      var dk = dueList({ topic: tp.id }).length;
      html += '<button class="tile s-' + esc(tp.style || 'outline') + (tp.wide ? ' wide' : '') + '" data-act="topic" data-topic="' + esc(tp.id) + '"><div><div class="lvl">Уровень ' + ts.lvl + ' из 5</div><h3>' + esc(tp.name) + '</h3></div>' +
        '<div><div class="bar"><i style="width:' + Math.round(ts.pct * 100) + '%"></i></div><div class="meta">' + ts.learned + ' из ' + ts.total + ' выучено' + (dk ? ' · повторить ' + dk : '') + '</div></div></button>';
    });
    html += '</div>';
    }
    var tags = allTags();
    if (tags.length) {
      html += '<h2>Подборки</h2><div class="seg">';
      tags.forEach(function (x) { html += '<button data-act="tag" data-tag="' + esc(x.t) + '">' + esc(x.t) + ' · ' + x.n + '</button>'; });
      html += '</div>';
    }
    var w = currentWeek();
    if (w) {
      var ws = S.week[w.id] || {}, done = (w.min || []).filter(function (_, i) { return ws.min && ws.min[i]; }).length;
      html += '<h2>Неделя</h2><button class="card row" style="width:100%;text-align:left" data-act="gotoweek"><div><h3>' + esc(w.title) + '</h3><div class="muted small">Минимум: ' + done + ' из ' + (w.min || []).length + '</div></div><span class="link">Открыть</span></button>';
    }
    $('#view').innerHTML = html;
  }

  // =====================================================================
  // Раунд
  // =====================================================================
  function startRound(mode, f) {
    f = f || null; var N = CFG.roundSize, items;
    if (mode === 'weak') items = weakList(f).slice(0, N);
    else if (mode === 'free' || mode === 'tag') {
      var pool = QS.filter(function (q) { return inScope(q, f); });
      if (mode === 'tag') { var dueT = dueList(f), freshT = shuffle(newList(f)); items = dueT.concat(freshT).slice(0, N); if (items.length < N) items = items.concat(shuffle(pool.filter(function (q) { return items.indexOf(q) < 0; })).slice(0, N - items.length)); }
      else { var seen = pool.filter(function (q) { return st(q.id); }); items = shuffle(seen.length >= 5 ? seen : pool).slice(0, N); }
    } else {
      var due = dueList(f), fresh = shuffle(newList(f || weekScope())).slice(0, newLeft());
      items = due.slice(0, N); fresh.forEach(function (q) { if (items.length < N) items.push(q); });
      if (!items.length) return QS.some(function (q) { return inScope(q, f); }) ? startRound('free', f) : toast('Здесь пока нет вопросов');
    }
    if (!items.length) return toast('Здесь пока нет вопросов');
    R = { mode: mode, f: f, items: shuffle(items), i: 0, res: [], xp0: S.xp, lv0: level(S.xp).n, ui: {} };
    document.body.classList.add('in-round'); renderRound(); window.scrollTo(0, 0);
  }
  function scopeName(f, mode) {
    if (mode === 'weak') return 'Работа над ошибками';
    if (f && f.topic) return TOPIC[f.topic] ? TOPIC[f.topic].name : '';
    if (f && f.tag) return f.tag;
    if (f && f.name) return f.name;
    return mode === 'free' ? 'Свободная тренировка' : 'Все темы';
  }
  function storyHtml(q) {
    var h = '<div class="story"><div class="lbl">Кейс</div><h3>' + esc(q.case || '') + '</h3><p>' + esc(q.story) + '</p>';
    if (q.src && /^https:\/\//.test(q.src.url || '')) h += '<a class="src" href="' + esc(q.src.url) + '" target="_blank" rel="noopener">' + esc(q.src.title || 'Источник') + ' ↗</a>';
    return h + '</div>';
  }
  function tableHtml(t) {
    var h = '<div class="tbl"><table class="mini"><tr><th class="rn"></th>';
    t.cols.forEach(function (c) { h += '<th>' + esc(c) + '</th>'; });
    h += '</tr>';
    if (t.labels) { h += '<tr class="lab"><td class="rn">1</td>'; t.labels.forEach(function (c) { h += '<td>' + esc(c) + '</td>'; }); h += '</tr>'; }
    t.rows.forEach(function (r, i) { h += '<tr><td class="rn">' + (i + (t.start || 2)) + '</td>'; r.forEach(function (c) { h += '<td>' + esc(c) + '</td>'; }); h += '</tr>'; });
    return h + '</table></div>';
  }
  function noteHtml(q, ui) {
    if (!ui.noteOpen) return '';
    var cur = S.notes[q.id] ? S.notes[q.id].text : '';
    return '<div class="card notebox"><h3>Заметка к вопросу</h3><p class="small muted">Например: вопрос непонятный, ответ спорный, хочу больше таких задач. Попадёт в отчёт для Claude.</p>' +
      '<textarea id="note" rows="3" placeholder="Что не так или что добавить">' + esc(cur) + '</textarea>' +
      '<div class="actions"><button class="btn full" data-act="savenote">Сохранить заметку</button>' + (cur ? '<button class="btn ghost full" data-act="delnote">Удалить заметку</button>' : '') + '</div></div>';
  }

  function renderRound() {
    if (R.done) return renderFinish();
    var q = R.items[R.i], ui = R.ui, n = R.items.length, T = TYPES[q.type];
    var cls = ui.g === 'r' ? 'state-ok' : ui.g === 'w' ? 'state-bad' : ui.g === 'p' ? 'state-mid' : '';
    var tp = TOPIC[q.topic] || {};
    var html = '<div class="rtop"><button class="x" data-act="quit" aria-label="Закрыть">×</button><div class="bar"><i style="width:' + Math.round(R.i / n * 100) + '%"></i></div><div class="n">' + (R.i + 1) + ' / ' + n + '</div>' +
      '<button class="x flag' + (S.notes[q.id] ? ' on' : '') + '" data-act="note" aria-label="Заметка">⚑</button></div>';
    html += noteHtml(q, ui);
    html += '<div class="qbox ' + cls + '"><span class="pill" style="background:' + (STYLE_PILL[tp.style] || 'var(--pill-outline)') + '">' + esc(tp.name || '') + '</span>';
    if (q.story) html += storyHtml(q);
    html += '<p class="q">' + esc(q.q) + '</p>';
    if (q.table) html += tableHtml(q.table);
    html += T.render(q, ui) + '</div>';
    $('#view').innerHTML = html;
    var ta = $('#answer'); if (ta && ui.text) ta.value = ui.text;
  }

  function finishQ(g) {
    var q = R.items[R.i], s = st(q.id);
    R.ui.prev = s ? { box: s.box, due: s.due } : null; // для «Засчитать как верно»
    R.ui.g = g; grade(q, g, R.mode); R.res[R.i] = g;
  }

  function endRound() {
    var n = R.res.filter(Boolean).length;
    if (n) {
      dayRec().rounds++;
      if (n >= CFG.roundSize && R.res.every(function (g) { return g === 'r'; })) S.perfect++;
      if (R.mode === 'weak') S.weakRounds++;
      save(); R.newAch = checkAch();
    }
    R.done = true; renderRound(); window.scrollTo(0, 0);
  }

  function renderFinish() {
    var res = R.res.filter(Boolean), n = res.length, ok = res.filter(function (g) { return g === 'r'; }).length, gained = S.xp - R.xp0, lv = level(S.xp), sk = streak();
    var html = '<div class="top"><div><h1>Раунд завершён</h1><div class="date">' + esc(scopeName(R.f, R.mode)) + '</div></div></div>';
    html += '<div class="big">' + ok + ' / ' + n + '</div><p class="muted">верных ответов</p>';
    html += '<div class="stats3"><div class="stat" style="background:var(--lav)"><b>+' + gained + '</b><span>XP</span></div><div class="stat" style="background:var(--peri)"><b>🔥 ' + sk + '</b><span>' + plural(sk, 'день', 'дня', 'дней') + ' подряд</span></div><div class="stat" style="background:var(--pink)"><b>' + lv.n + '</b><span>уровень</span></div></div>';
    if (lv.n > R.lv0) html += '<div class="card"><h3>Новый уровень: ' + esc(lv.name) + '</h3></div>';
    if (R.newAch && R.newAch.length) html += '<div class="card"><h3>Достижения</h3><ul>' + R.newAch.map(function (a) { return '<li>' + esc(achName(a)) + '</li>'; }).join('') + '</ul></div>';
    var wrong = R.items.filter(function (_, i) { return R.res[i] === 'w'; });
    if (wrong.length) html += '<div class="card"><h3>Вернутся завтра</h3><ul>' + wrong.map(function (q) { return '<li>' + esc(q.t) + '</li>'; }).join('') + '</ul></div>';
    html += '<div class="actions"><button class="btn full" data-act="again">Ещё раунд</button><button class="btn ghost full" data-act="home">На главную</button></div>';
    $('#view').innerHTML = html;
  }

  // =====================================================================
  // Неделя
  // =====================================================================
  var weekIdx = null;
  function currentWeekIndex() {
    var t = today(), i;
    for (i = 0; i < WEEKS.length; i++) if (WEEKS[i].start <= t && t <= WEEKS[i].end) return i;
    for (i = 0; i < WEEKS.length; i++) if (WEEKS[i].start > t) return i;
    return WEEKS.length - 1;
  }
  function currentWeek() { var i = currentWeekIndex(); return i >= 0 ? WEEKS[i] : null; }
  function weekResult(w) {
    var logs = S.log.filter(function (l) { return l.d >= w.start && l.d <= w.end; });
    var ok = logs.filter(function (l) { return l.g === 'r'; }).length, rounds = 0, d = w.start;
    while (d <= w.end) { if (S.days[d]) rounds += S.days[d].rounds; d = addDays(d, 1); }
    var learned = QS.filter(function (q) { var s = st(q.id); return s && s.learnedAt && s.learnedAt >= w.start && s.learnedAt <= w.end && s.box >= CFG.learnedBox; });
    var xp = logs.reduce(function (a, l) { return a + (CFG.xp[l.g] || 0); }, 0);
    return { answers: logs.length, ok: ok, acc: pct(ok, logs.length), rounds: rounds, learned: learned, xp: xp };
  }
  function checklist(w, kind) {
    var ws = S.week[w.id] || {}, h = '';
    (w[kind] || []).forEach(function (t, i) {
      var on = ws[kind] && ws[kind][i];
      h += '<button class="chk' + (on ? ' on' : '') + '" data-act="chk" data-kind="' + kind + '" data-i="' + i + '"><span class="box">' + (on ? '✓' : '') + '</span><span class="t">' + fmt(t) + '</span></button>';
    });
    return h;
  }
  function countDone(w, kind) { var ws = S.week[w.id] || {}; return (w[kind] || []).filter(function (_, i) { return ws[kind] && ws[kind][i]; }).length; }

  function renderWeek() {
    if (!WEEKS.length) { $('#view').innerHTML = '<h1>Неделя</h1><div class="empty muted">План недели не загрузился. Подключись к интернету один раз и открой приложение снова.</div>'; return; }
    if (weekIdx == null) weekIdx = currentWeekIndex();
    var w = WEEKS[weekIdx], t = today();
    var html = '<div class="wnav"><button class="x" data-act="wprev"' + (weekIdx > 0 ? '' : ' disabled style="opacity:.3"') + '>‹</button><div class="muted small">Неделя ' + (weekIdx + 1) + ' · ' + shortD(w.start) + ' – ' + shortD(w.end) + '</div><button class="x" data-act="wnext"' + (weekIdx < WEEKS.length - 1 ? '' : ' disabled style="opacity:.3"') + '>›</button></div>';
    html += '<h1>' + esc(w.title) + '</h1>';
    if (w.status) html += '<div class="tag mt">' + esc(w.status) + '</div>';
    if (w.goal) html += '<p class="mt">' + fmt(w.goal) + '</p>';
    html += '<div class="sec min mt"><div class="row"><h3>Минимум</h3><span class="small">' + countDone(w, 'min') + ' из ' + (w.min || []).length + '</span></div>' + checklist(w, 'min') + '</div>';
    if (w.max && w.max.length) html += '<div class="sec max"><div class="row"><h3>Максимум</h3><span class="small">если останется время</span></div>' + checklist(w, 'max') + '</div>';
    if (w.check && w.check.length) html += '<div class="sec chkd"><h3>Самопроверка в конце недели</h3>' + checklist(w, 'check') + '</div>';
    if (w.focus && w.focus.length) html += '<div class="card"><h3>Темы недели в тренажёре</h3><ul>' + w.focus.map(function (b) { return '<li>' + esc(b.name) + ' — ' + b.ids.length + ' ' + plural(b.ids.length, 'вопрос', 'вопроса', 'вопросов') + '</li>'; }).join('') + '</ul></div>';
    if (w.start <= t) {
      var r = weekResult(w);
      html += '<h2>Итог недели</h2><div class="stats3"><div class="stat" style="background:var(--lav)"><b>' + r.rounds + '</b><span>' + plural(r.rounds, 'раунд', 'раунда', 'раундов') + '</span></div><div class="stat" style="background:var(--peri)"><b>' + r.acc + '%</b><span>верных</span></div><div class="stat" style="background:var(--pink)"><b>+' + r.xp + '</b><span>XP</span></div></div>';
      if (r.learned.length) {
        html += '<div class="card"><h3>Выучено за неделю: ' + r.learned.length + '</h3>';
        TOPICS.forEach(function (tp) {
          var items = r.learned.filter(function (q) { return q.topic === tp.id; });
          if (items.length) html += '<div class="small muted mt">' + esc(tp.name) + '</div><ul class="learned">' + items.map(function (q) { return '<li>' + esc(q.t) + '</li>'; }).join('') + '</ul>';
        });
        html += '</div>';
      } else html += '<div class="card muted">Здесь появятся вопросы, выученные за неделю. Вопрос считается выученным после двух верных ответов в разные дни.</div>';
    }
    if (w.links && w.links.length) {
      html += '<h2>Источники недели</h2><div class="links">';
      w.links.forEach(function (l) {
        if (!/^https:\/\//.test(l.url || '')) return;
        html += '<a class="lnk" href="' + esc(l.url) + '" target="_blank" rel="noopener"><span class="lt">' + esc(l.title) + ' ↗</span>' + (l.note ? '<span class="ln2">' + esc(l.note) + '</span>' : '') + '</a>';
      });
      html += '</div>';
    }
    $('#view').innerHTML = html;
  }

  // =====================================================================
  // Прогресс и отчёт для Claude
  // =====================================================================
  function renderProgress() {
    var lv = level(S.xp), sk = streak(), p = lv.to ? pct(S.xp - lv.from, lv.to - lv.from) : 100;
    var html = '<div class="top"><div><h1>Прогресс</h1></div><div class="chips"><span class="chip">🔥 ' + sk + '</span></div></div>';
    html += '<div class="lvlcard"><div class="small">Уровень ' + lv.n + ' из ' + lv.total + '</div><h1 style="font-size:28px;margin-top:4px">' + esc(lv.name) + '</h1>' +
      '<div class="bar"><i style="width:' + p + '%"></i></div><div class="small mt">' + S.xp + ' XP' + (lv.to ? ' · до уровня «' + esc(lv.next) + '» ' + (lv.to - S.xp) + ' XP' : '') + '</div></div>';
    html += '<button class="card row mt2" data-act="report" style="width:100%;text-align:left;background:var(--ink);color:var(--on-ink)"><div><h3>Отчёт для Claude</h3><div class="small" style="opacity:.7">Слабые места и заметки одним текстом — скопируй и отправь в чат</div></div><span class="link">Открыть</span></button>';
    var freq = QS.filter(function (q) { var s = st(q.id); return s && s.wrong > 0; })
      .sort(function (a, b) { return st(b.id).wrong - st(a.id).wrong || weakness(b) - weakness(a); });
    html += '<h2>Работа над ошибками</h2>';
    if (!freq.length) html += '<div class="card muted">Здесь появятся вопросы, в которых ты ошибаешься чаще всего.</div>';
    else {
      html += '<div class="card"><p class="small muted">Чаще всего ошибаешься здесь:</p><ol class="errs">' + freq.slice(0, 10).map(function (q) {
        var s = st(q.id); return '<li><span>' + esc(q.t) + '</span><b>' + s.wrong + ' ' + plural(s.wrong, 'ошибка', 'ошибки', 'ошибок') + '</b></li>';
      }).join('') + '</ol>' + (weakList().length ? '<button class="btn full mt" data-act="weak">Начать раунд по ошибкам</button>' : '') + '</div>';
    }
    html += '<h2>Вся программа</h2><p class="small muted" style="margin-top:-4px">Темы до весны. Процент появляется, когда в тему добавлены вопросы.</p>';
    TOPICS.forEach(function (tp) {
      var ts = topicStats(tp.id);
      if (!ts.total) { html += '<div class="card"><div class="row"><h3>' + esc(tp.name) + '</h3><span class="small muted">уточняется</span></div></div>'; return; }
      html += '<div class="card"><div class="row"><h3>' + esc(tp.name) + '</h3><span class="small">' + Math.round(ts.pct * 100) + '%</span></div><div class="bar"><i style="width:' + Math.round(ts.pct * 100) + '%"></i></div><div class="small muted mt">Выучено ' + ts.learned + ' из ' + ts.total + ' · начато ' + ts.seen + ' · уровень ' + ts.lvl + ' из 5</div></div>';
    });
    html += '<h2>Достижения</h2><div class="achs">';
    ACH.forEach(function (a) { var got = S.ach[a.id]; html += '<div class="ach' + (got ? ' got' : '') + '"><span class="ic">' + a.ic + '</span><h3>' + esc(a.t) + '</h3><div class="small">' + (got ? 'Получено ' + shortD(got) : esc(a.d)) + '</div></div>'; });
    html += '</div>';
    if (CHANGES.length) {
      html += '<h2>Что нового</h2>';
      CHANGES.slice(0, 3).forEach(function (c) { html += '<div class="card"><div class="small muted">' + esc(c.date ? human(c.date) : '') + ' · версия ' + esc(c.version) + '</div><ul>' + (c.items || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>'; });
    }
    html += '<h2>Настройки</h2><div class="card"><h3>Оформление</h3><div class="seg mt">';
    SKINS.forEach(function (k) { html += '<button data-act="skin" data-k="' + k[0] + '" class="' + ((S.settings.skin || 'accent') === k[0] ? 'on' : '') + '">' + k[1] + '</button>'; });
    html += '</div></div><div class="card"><h3>Новых вопросов в день</h3><div class="seg mt">';
    [5, 10, 15, 20].forEach(function (n) { html += '<button data-act="daily" data-n="' + n + '" class="' + (dailyNew() === n ? 'on' : '') + '">' + n + '</button>'; });
    html += '</div></div>';
    html += '<div class="card"><h3>Копия прогресса</h3><p class="small muted">Прогресс хранится в памяти телефона. Если очистить данные браузера, он пропадёт. Раз в неделю сохраняй копию в файл.</p>' +
      '<div class="actions"><button class="btn full" data-act="export">Сохранить копию прогресса</button><button class="btn ghost full" data-act="import">Загрузить копию</button></div><input type="file" id="importFile" accept="application/json,.json" hidden></div>';
    html += '<div class="card"><h3>Вопросы</h3><p class="small muted">В банке ' + QS.length + ' ' + plural(QS.length, 'вопрос', 'вопроса', 'вопросов') + (VERSION ? ' · версия ' + esc(VERSION) : '') + '. С интернетом обновляется при каждом открытии.</p><button class="btn ghost full mt" data-act="update">Проверить обновления</button></div>';
    $('#view').innerHTML = html;
  }

  function reportText() {
    var t = today(), lv = level(S.xp), from7 = addDays(t, -6), L = [];
    var logs7 = S.log.filter(function (l) { return l.d >= from7; }), ok7 = logs7.filter(function (l) { return l.g === 'r'; }).length;
    var rounds = 0; Object.keys(S.days).forEach(function (k) { rounds += S.days[k].rounds; });
    L.push('ОТЧЁТ ТРЕНАЖЁРА · ' + t + ' · версия ' + VERSION);
    L.push('Всего: ответов ' + S.log.length + ', раундов ' + rounds + ', серия ' + streak() + ' дн., уровень «' + lv.name + '» (' + S.xp + ' XP)');
    L.push('За 7 дней: ответов ' + logs7.length + ', верно ' + pct(ok7, logs7.length) + '%');
    L.push(''); L.push('ПО ТЕМАМ (выучено / начато / всего · точность за всё время):');
    TOPICS.forEach(function (tp) {
      var ts = topicStats(tp.id); if (!ts.total) return;
      var lg = S.log.filter(function (l) { return BY_ID[l.id] && BY_ID[l.id].topic === tp.id; });
      L.push('- ' + tp.name + ': ' + ts.learned + ' / ' + ts.seen + ' / ' + ts.total + (lg.length ? ' · ' + pct(lg.filter(function (l) { return l.g === 'r'; }).length, lg.length) + '%' : ' · ещё не начато'));
    });
    var weak = weakList().slice(0, 20);
    L.push(''); L.push('СЛАБЫЕ МЕСТА (до 20):');
    if (!weak.length) L.push('- пока нет');
    weak.forEach(function (q) { var s = st(q.id); L.push('- [' + q.id + '] ' + q.t + ': верно ' + s.right + ', частично ' + (s.partial || 0) + ', ошибок ' + s.wrong); });
    var nk = Object.keys(S.notes);
    L.push(''); L.push('ЗАМЕТКИ К ВОПРОСАМ:');
    if (!nk.length) L.push('- нет');
    nk.forEach(function (id) { L.push('- [' + id + '] ' + (BY_ID[id] ? BY_ID[id].t : '(вопрос удалён)') + ': ' + S.notes[id].text); });
    var w = currentWeek();
    if (w) { L.push(''); L.push('НЕДЕЛЯ «' + w.title + '» (' + w.start + ' – ' + w.end + '): минимум ' + countDone(w, 'min') + '/' + (w.min || []).length + ', максимум ' + countDone(w, 'max') + '/' + (w.max || []).length + ', самопроверка ' + countDone(w, 'check') + '/' + (w.check || []).length); }
    return L.join('\n');
  }
  function renderReport() {
    var html = '<div class="rtop"><button class="x" data-act="closereport" aria-label="Назад">‹</button><div style="font-weight:700">Отчёт для Claude</div></div>';
    html += '<p class="muted small">Нажми «Скопировать» и вставь текст в чат. По нему я найду слабые места и поправлю программу и вопросы.</p>';
    html += '<textarea id="reportText" rows="18" readonly class="report">' + esc(reportText()) + '</textarea>';
    html += '<div class="actions"><button class="btn full" data-act="copyreport">Скопировать</button></div>';
    $('#view').innerHTML = html;
  }

  // =====================================================================
  // События
  // =====================================================================
  document.addEventListener('input', function (e) { if (e.target.id === 'answer' && R) R.ui.text = e.target.value; });

  var COMMON = {
    pin: function (el) { pinInput(el.getAttribute('data-d')); },
    pinback: function () { PIN.v = PIN.v.slice(0, -1); PIN.err = false; renderLock(); },
    start: function () { startRound('plan'); },
    free: function () { startRound('free'); },
    weak: function () { startRound('weak'); },
    topic: function (el) { startRound('plan', { topic: el.getAttribute('data-topic') }); },
    tag: function (el) { startRound('tag', { tag: el.getAttribute('data-tag') }); },
    block: function (el) { var b = weekFocus()[+el.getAttribute('data-b')]; if (b) startRound('plan', blockScope(b)); },
    gotoweek: function () { weekIdx = null; setTab('week'); },
    quit: function () { if (R.res.filter(Boolean).length) return endRound(); R = null; document.body.classList.remove('in-round'); render(); },
    again: function () { var m = R.mode, f = R.f; R = null; startRound(m === 'free' ? 'plan' : m, f); },
    home: function () { setTab('home'); },
    next: function () { R.i++; R.ui = {}; if (R.i >= R.items.length) return endRound(); renderRound(); window.scrollTo(0, 0); },
    note: function () { R.ui.text = readText(); R.ui.noteOpen = !R.ui.noteOpen; renderRound(); },
    savenote: function () {
      var q = R.items[R.i], v = ($('#note') || {}).value || '';
      if (v.trim()) { S.notes[q.id] = { d: today(), text: v.trim() }; toast('Заметка сохранена'); } else delete S.notes[q.id];
      save(); R.ui.noteOpen = false; renderRound();
    },
    delnote: function () { delete S.notes[R.items[R.i].id]; save(); R.ui.noteOpen = false; renderRound(); },
    chk: function (el) {
      var w = WEEKS[weekIdx], kind = el.getAttribute('data-kind'), i = +el.getAttribute('data-i');
      var ws = S.week[w.id] || (S.week[w.id] = {}); ws[kind] = ws[kind] || []; ws[kind][i] = !ws[kind][i]; save();
      var got = checkAch(); renderWeek(); if (got.length) toast('Достижение: ' + achName(got[0]));
    },
    wprev: function () { if (weekIdx > 0) { weekIdx--; renderWeek(); } },
    wnext: function () { if (weekIdx < WEEKS.length - 1) { weekIdx++; renderWeek(); } },
    skin: function (el) { S.settings.skin = el.getAttribute('data-k'); save(); applySkin(); renderProgress(); },
    daily: function (el) { S.settings.dailyNew = +el.getAttribute('data-n'); save(); renderProgress(); },
    export: function () { exportProgress(); },
    import: function () { $('#importFile').click(); },
    update: function () {
      loadData().then(function () { renderProgress(); toast('Проверено: ' + QS.length + ' ' + plural(QS.length, 'вопрос', 'вопроса', 'вопросов')); })
        .catch(function () { toast('Нет интернета — работаю с сохранённой версией'); });
    },
    report: function () { sub = 'report'; render(); window.scrollTo(0, 0); },
    closereport: function () { sub = null; render(); },
    copyreport: function () {
      var ta = $('#reportText'), txt = ta.value;
      function fallback() { ta.removeAttribute('readonly'); ta.focus(); ta.select(); try { document.execCommand('copy'); toast('Скопировано'); } catch (e) { toast('Выдели текст и скопируй вручную'); } ta.setAttribute('readonly', ''); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast('Скопировано'); }, fallback); else fallback();
    }
  };

  document.addEventListener('click', function (e) {
    if (LOCKED) { var k = e.target.closest('[data-act=pin],[data-act=pinback]'); if (k) COMMON[k.getAttribute('data-act')](k); return; }
    var tb = e.target.closest('.tab'); if (tb) return setTab(tb.getAttribute('data-tab'));
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.getAttribute('data-act');
    if (COMMON[act]) return COMMON[act](el);
    if (R && !R.done) {
      var q = R.items[R.i], T = TYPES[q.type];
      if (T.act[act]) { T.act[act](q, R.ui, el); renderRound(); }
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id !== 'importFile' || !e.target.files[0]) return;
    var fr = new FileReader();
    fr.onload = function () {
      try { var d = JSON.parse(fr.result); if (!d || !d.q) throw new Error('bad'); localStorage.setItem(KEY, JSON.stringify(d)); S = load(); toast('Прогресс загружен'); renderProgress(); }
      catch (err) { toast('Не получилось прочитать файл'); }
    };
    fr.readAsText(e.target.files[0]);
  });

  function exportProgress() {
    var blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'progress-' + today() + '.json';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // =====================================================================
  // Запуск
  // =====================================================================
  if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) { /* превью без офлайна */ } }
  $('#view').innerHTML = '<div class="empty muted">Загрузка…</div>';
  loadData().then(function () { LOCKED = needPin(); if (!LOCKED) checkAch(); render(); }, function () { render(); });
  // в списке открытых приложений содержимое скрыто
  document.addEventListener('visibilitychange', function () {
    document.body.classList.toggle('veil', document.hidden);
    if (!document.hidden && !R && !sub) render();
  });
})();
