// 自动清理 + 超期清理 单元测试（从实际 index.html 抽取真实函数体；不依赖任何临时文件）
// 运行：node tasks/fix/clean_test.js
'use strict';
const fs = require('fs');
const src = fs.readFileSync('/root/workspace/notes-app/index.html', 'utf8');

const FUNCS = ['runAutoClean', 'showCleanResult', 'isOverdue', 'isBinNote', 'purgeExpiredBinItems'];
function extract(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  const open = src.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

// ---- 最小 DOM / storage 桩 ----
function el() {
  const children = [];
  const classList = { _open: null, add(n) { this._open = n; }, remove() { this._open = null; } };
  let _innerHTML = '', _text = '';
  return {
    className: '', dataset: {}, children, classList,
    get textContent() { return _text; },  set textContent(t) { _text = t; },
    get innerHTML() { return _innerHTML; }, set innerHTML(h) { _innerHTML = h; children.length = 0; },
    appendChild(c) { children.push(c); }
  };
}
const fakeDoc = { createElement: function () { return el(); } };
const cleanResultMask = el(), cleanResultList = el(), cleanResultTitle = el();

function LS(init) {
  const m = Object.assign({}, init);
  return { getItem(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem(k, v) { m[k] = String(v); }, dump: () => m };
}

let notes = [];
function setNotes(arr) { notes.length = 0; notes.push.apply(notes, arr); }
const DAY = 24 * 60 * 60 * 1000;
const BASE = new Date(2026, 0, 10, 21, 0).getTime();

function mk(id, o) {
  return Object.assign({ id, type: 'note', content: 'c', createdAt: 100, updatedAt: 100, dueAt: null,
    doneAt: null, pinnedAt: null, color: null, starred: false, order: null,
    deletedAt: null, deletedFrom: null }, o || {});
}

let failed = 0;
const assert = (c, m) => { if (!c) { failed = 1; console.error('FAIL: ' + m); } else console.log('ok  - ' + m); };

function makeCleanApi(store, clock) {
  const at = new Date(clock.y || 2026, (clock.m || 1) - 1, clock.d || 10, clock.h || 21, clock.min || 0);
  const FakeDate = Object.assign(function () { return new Date(at.getTime()); }, { now: () => at.getTime() });
  const calls = { marked: [], rendered: 0, last: null };
  const code = FUNCS.slice(0, 4).map(extract).join('\n');
  const api = new Function(
    'localStorage', 'notes', 'Date', 'pad', 'isTodo', 'isDone', 'markNoteDeleted',
    'setCleanLastDate', 'renderList', 'document', 'titleOf',
    'cleanResultMask', 'cleanResultList', 'cleanResultTitle',
    'var CLEAN_DONE_KEY="auto_clean_done", CLEAN_EXPIRED_KEY="auto_clean_expired", CLEAN_LAST_KEY="auto_clean_last_date";\n' +
    'function cleanPref(k){ return localStorage.getItem(k)==="1"; }\n' + code +
    '\nreturn { runAutoClean: runAutoClean, showCleanResult: showCleanResult };'
  )(store, notes, FakeDate, n => (n < 10 ? '0' + n : '' + n),
    n => n.type === 'todo', n => n.doneAt != null,
    (id, from) => { calls.marked.push(id); },
    y => { calls.last = y; },
    () => { calls.rendered++; }, fakeDoc, () => '标题',
    cleanResultMask, cleanResultList, cleanResultTitle);
  return { api, calls };
}

const { api: { showCleanResult } } = makeCleanApi(LS({}), {});

// ============ runAutoClean ============
{
  let r;

  r = makeCleanApi(LS({}), {});
  r.api.runAutoClean();
  assert(r.calls.marked.length === 0 && r.calls.last === null && r.calls.rendered === 0,
    '1. 开关全关：不执行、不记录日期');

  r = makeCleanApi(LS({ auto_clean_done: '1' }), {});
  setNotes([mk('done2', { type: 'todo', doneAt: 200 }), mk('done1', { type: 'todo', doneAt: 100 }),
    mk('exp1', { type: 'todo', dueAt: BASE - 5e3 }), mk('exp2', { type: 'todo', dueAt: BASE - 9e3 }),
    mk('future', { type: 'todo', dueAt: BASE + 9e3 }), mk('plain')]);
  r.api.runAutoClean();
  assert(JSON.stringify(r.calls.marked.sort()) === JSON.stringify(['done1', 'done2']),
    '2. 只开已完成：标记 done 两条');
  assert(cleanResultTitle.textContent === '已自动清理 2 条事项' && cleanResultMask.classList._open === 'open',
    '2. 结果弹窗：标题 2 条 + 打开');
  assert(r.calls.last === '2026-01-10' && r.calls.rendered === 1, '2. 记录 last_date + 渲染列表');
  cleanResultMask.classList._open = null; // 清理共享 stub，避免影响后续断言

  r = makeCleanApi(LS({ auto_clean_expired: '1' }), {});
  setNotes([mk('exp1', { type: 'todo', dueAt: BASE - 5e3 }), mk('exp2', { type: 'todo', dueAt: BASE - 9e3 })]);
  r.api.runAutoClean();
  assert(JSON.stringify(r.calls.marked.sort()) === JSON.stringify(['exp1', 'exp2']),
    '3. 只开已过期：标记过期两条');

  r = makeCleanApi(LS({ auto_clean_done: '1', auto_clean_expired: '1' }), {});
  setNotes([mk('done2', { type: 'todo', doneAt: 200 }), mk('done1', { type: 'todo', doneAt: 100 }),
    mk('exp1', { type: 'todo', dueAt: BASE - 5e3 }), mk('exp2', { type: 'todo', dueAt: BASE - 9e3 })]);
  r.api.runAutoClean();
  assert(JSON.stringify(r.calls.marked.sort()) === JSON.stringify(['done1', 'done2', 'exp1', 'exp2']),
    '4. 都开：合并标记 4 条');
  assert(cleanResultTitle.textContent === '已自动清理 4 条事项', '4. 弹窗标题合计 4 条');
  cleanResultMask.classList._open = null;

  r = makeCleanApi(LS({ auto_clean_done: '1', auto_clean_last_date: '2026-01-10' }), {});
  setNotes([mk('x', { type: 'todo', doneAt: 1 })]);
  r.api.runAutoClean();
  assert(r.calls.marked.length === 0, '5. 今天已清理过：跳过');

  r = makeCleanApi(LS({ auto_clean_done: '1' }), {});
  setNotes([mk('future', { type: 'todo', dueAt: BASE + 9e3 }), mk('plain')]);
  r.api.runAutoClean();
  assert(r.calls.marked.length === 0 && r.calls.last !== null && r.calls.rendered === 0,
    '6. 无可清理：只记日期，不渲染不弹窗');

  r = makeCleanApi(LS({ auto_clean_done: '1', auto_clean_expired: '1' }), {});
  setNotes([mk('both', { type: 'todo', doneAt: 100, dueAt: BASE - 9e3 })]);
  r.api.runAutoClean();
  assert(JSON.stringify(r.calls.marked) === JSON.stringify(['both']) && cleanResultTitle.textContent === '已自动清理 1 条事项',
    '7. 已完成优先：done+过期只算一次');
  cleanResultMask.classList._open = null;

  r = makeCleanApi(LS({ auto_clean_done: '1' }), { h: 10 });
  r.api.runAutoClean();
  assert(r.calls.marked.length === 0, '8. 早上 10:00：未到 20:00，跳过');

  r = makeCleanApi(LS({ auto_clean_done: '1', auto_clean_last_date: '2026-01-09' }), { h: 23 });
  setNotes([mk('doneX', { type: 'todo', doneAt: 1 }), mk('plain')]);
  r.api.runAutoClean();
  assert(r.calls.marked.length === 1, '8. 深夜 23:00 且昨天已清理：今天照常执行');

  r = makeCleanApi(LS({ auto_clean_done: '1' }), {});
  setNotes([mk('doneBin', { type: 'todo', doneAt: 100, deletedAt: BASE - DAY, deletedFrom: 'manual' }),
    mk('doneLive', { type: 'todo', doneAt: 200 })]);
  r.api.runAutoClean();
  assert(JSON.stringify(r.calls.marked) === JSON.stringify(['doneLive']),
    '9. 回收箱里的已完成待办：跳过自动清理');

// ============ showCleanResult：上限 10 条 + 折叠行 ============
  const many = [];
  for (let i = 1; i <= 12; i++) many.push(mk('n' + i, { type: 'todo', doneAt: i }));
  showCleanResult(many, []);
  assert(cleanResultList.children.length === 11, '10. 12条→10条+1行折叠。实际=' + cleanResultList.children.length);
  assert(cleanResultList.children[0].textContent === '已完成：标题', '10. 条目格式正确');
  assert(cleanResultList.children[10].className.indexOf('clean-result-more') >= 0 &&
    cleanResultList.children[10].textContent === '…还有 2 条', '10. 折叠文案正确');
}

// ============ purgeExpiredBinItems ============
(async () => {
  const imgUrlCache = { i1: 'blob:1', i2: 'blob:2', i3: 'blob:3' };
  const delIds = [];
  const purgeCode = extract('purgeExpiredBinItems');
  // notes 直接嵌入函数体（var notes=[...]）：purge 内 `notes = notes.filter(...)` 重新赋值到此 var，
  // 函数返回 { purge, notes } 供外部观察物理删除后的数组。
  const notesData = [
    { id: 'aged', deletedAt: BASE - 4 * DAY },
    { id: 'fresh', deletedAt: BASE - 2 * DAY },
    { id: 'live', deletedAt: null }
  ];
  const body =
    'var BIN_KEEP_MS = ' + (3 * DAY) + ';\n' +
    'var notes = ' + JSON.stringify(notesData) + ';\n' +
    purgeCode + '\n' +
    'var _ret = { purge: purgeExpiredBinItems };\n' +
    'Object.defineProperty(_ret, "notes", { get: function() { return notes; }, enumerable: true });\n' +
    'return _ret;';
  const fn = new Function('Date', 'isBinNote', 'dbDeleteNotesWithImages', 'imgUrlCache', body)(
    { now: () => BASE }, n => !!(n && n.deletedAt != null),
    ids => { delIds.push(ids.slice()); return Promise.resolve(['i1']); }, imgUrlCache);
  fn.purge();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert(JSON.stringify(delIds[0]) === JSON.stringify(['aged']),
    '11. 超期清理：只删 4 天前那条');
  assert(imgUrlCache.i1 === undefined && imgUrlCache.i2 === 'blob:2' && imgUrlCache.i3 === 'blob:3',
    '11. 图片URL只revoke被删条目');
  assert(fn.notes.length === 2 && fn.notes[0].id === 'fresh' && fn.notes[1].id === 'live',
    '11. 内存缓存同步移除：只剩 fresh + live');
})().then(() => { console.log('\n' + (failed ? 'FAILURES' : 'ALL PASS')); process.exit(failed); });
