// Step 2 单元测试：回收箱恢复 / 渲染 / 空态 / 超期过滤（从实际 index.html 抽取真实函数体）
// 运行：node tasks/fix/bin_step2_test.js
'use strict';
const fs = require('fs');
const src = fs.readFileSync('/root/workspace/notes-app/index.html', 'utf8');

const FUNCS = ['restoreNote', 'renderBin', 'relativeTime', 'isTodo', 'isBinNote', 'binNotes'];
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

// ---- 最小 DOM 桩 ----
function el() {
  return { className: '', dataset: {}, children: [], textContent: '', innerHTML: '', classList: { add() {}, remove() {} },
    appendChild(c) { this.children.push(c); } };
}
const fakeDoc = { createElement: function () { return el(); } };
const binListEl = el();

// ---- 依赖桩 ----
let dbPuts = [], scheduled = [], closed = 0;
function dbPut(n) { dbPuts.push(JSON.parse(JSON.stringify(n))); return Promise.resolve(); }
function scheduleNoteNotification(n) { scheduled.push(n && n.id); }
function titleOf() { return '笔记标题'; }

let notes = [];
function setNotes(arr) { notes.length = 0; notes.push.apply(notes, arr); }
let assertions = 0;
function assert(cond, msg) { assertions++; if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else console.log('ok: ' + msg); }

function makeApi(sortByVal) {
  const code = FUNCS.map(extract).join('\n');
  return new Function(
    'dbPut', 'scheduleNoteNotification', 'notes', 'document', 'binListEl', 'titleOf',
    'var sortBy = ' + JSON.stringify(sortByVal) + ';\n' +
    'var binDirty = false;\n' +
    'var BIN_KEEP_MS = ' + (3 * 24 * 60 * 60 * 1000) + ';\n' +
    'function closeBin() { closedCount++; }\n' +
    'var closedCount = 0;\n' + code +
    '\nreturn { restoreNote: restoreNote, renderBin: renderBin, relativeTime: relativeTime, getClosed: function(){ return closedCount; } };'
  )(dbPut, scheduleNoteNotification, notes, fakeDoc, binListEl, titleOf);
}

const DAY = 24 * 60 * 60 * 1000;
const now0 = Date.now();
function mk(id, extra) {
  return Object.assign({ id: id, type: 'note', content: 'c', createdAt: 100, updatedAt: 100,
    dueAt: null, doneAt: null, pinnedAt: null, color: null, starred: false, order: null,
    deletedAt: null, deletedFrom: null }, extra || {});
}

// ---- 恢复（默认排序 updated） ----
const apiU = makeApi('updated');
setNotes([mk('b1', { deletedAt: now0 - 1.5 * DAY, deletedFrom: 'manual' }), mk('n1')]);
apiU.restoreNote('b1');
assert(notes[0].deletedAt === null && notes[0].deletedFrom === null, '恢复：清掉 deletedAt/deletedFrom');
assert(notes[0].updatedAt > now0 - 1000, '恢复：updatedAt 提到现在（默认排序下置顶之下最前）');
assert(apiU.getClosed() === 1, '恢复后关闭回收箱视图');
assert(dbPuts.length === 1 && dbPuts[0].deletedAt === null, '恢复：dbPut 落库');

// ---- 恢复（自定义排序 → order=-1） ----
const apiC = makeApi('custom');
setNotes([mk('b2', { deletedAt: now0 - DAY, deletedFrom: 'auto' })]);
apiC.restoreNote('b2');
assert(notes[0].order === -1, '自定义排序下恢复 order=-1（普通区最前，下次拖拽重写无残留）');

// ---- 恢复待办 → 重新调度通知 ----
const apiT = makeApi('updated');
scheduled = [];
setNotes([mk('b3', { type: 'todo', deletedAt: now0 - DAY, deletedFrom: 'manual' })]);
apiT.restoreNote('b3');
assert(scheduled.join(',') === 'b3', '恢复待办：重新调度系统通知');

// ---- 不存在/非回收箱 id → 无操作 ----
const apiN = makeApi('updated');
const dbPutsBefore = dbPuts.length;
apiN.restoreNote('nope');
assert(apiN.getClosed() === 0 && dbPuts.length === dbPutsBefore, '无效 id：不动');

// ---- renderBin：两条（手动/自动）+ 空态 + 超期过滤 ----
const apiR = makeApi('updated');
setNotes([
  mk('m1', { deletedAt: now0 - 1.5 * DAY, deletedFrom: 'manual' }),
  mk('m2', { deletedAt: now0 - 3 * 60 * 60 * 1000, deletedFrom: 'auto' }),
  mk('m3', { deletedAt: now0 - 4 * DAY, deletedFrom: 'manual' }), // 超期：不展示
  mk('live')
]);
apiR.renderBin();
assert(binListEl.children.length === 2, '回收箱渲染 2 条（超期与未删除不计入）');
assert(binListEl.children[0].dataset.id === 'm2', 'deletedAt 倒序：最新删除的在前');
assert(binListEl.children[1].children[1].textContent === '恢复', '行内含「恢复」按钮');
const meta0 = binListEl.children[0].children[0].children[1].textContent;
assert(meta0.indexOf('自动清理于') === 0 && meta0.indexOf('还剩 3 天') > 0, '自动条目文案：自动清理于 3 小时前 · 还剩 3 天');
const meta1 = binListEl.children[1].children[0].children[1].textContent;
assert(meta1.indexOf('手动删除于') === 0 && meta1.indexOf('还剩 2 天') > 0, '手动条目文案：手动删除于 1 天前 · 还剩 2 天');
// 空态
setNotes([mk('live')]);
binListEl.children.length = 0;
apiR.renderBin();
assert(binListEl.children.length === 1 && binListEl.children[0].className === 'bin-empty', '空态：回收箱是空的');

console.log('\n' + assertions + ' assertions, ' + (process.exitCode ? 'FAILURES' : 'ALL PASS'));