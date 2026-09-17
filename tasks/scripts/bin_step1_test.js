// Step 1 单元测试：软删除 + 过滤 + 通知跳过（从实际 index.html 抽取真实函数体）
// 运行：node tasks/fix/bin_step1_test.js
'use strict';
const fs = require('fs');
const src = fs.readFileSync('/root/workspace/notes-app/index.html', 'utf8');

// ---- 花括号配平抽取：给定函数签名起始行，取出完整函数体 ----
const FUNCS = ['markNoteDeleted', 'noteById', 'isTodo', 'isDone', 'isBinNote',
  'binNotes', 'isPinned', 'compareNotesBySort', 'sortedNotesFor', 'resyncAllTodoNotifications'];
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

// ---- 依赖桩 ----
let dbPuts = [];
function dbPut(n) { dbPuts.push(JSON.parse(JSON.stringify(n))); return Promise.resolve(); }
let cancelled = [];
function cancelNoteNotification(id) { cancelled.push(id); }
let scheduled = [];
function scheduleNoteNotification(n) { scheduled.push(n && n.id); }
function getLocalNotifications() { return { schedule: function () {} }; }

let notes = [];
function setNotes(arr) { notes.length = 0; notes.push.apply(notes, arr); } // 复用同一数组：命中的函数参数绑定不失联
let assertions = 0;
function assert(cond, msg) { assertions++; if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; } else console.log('ok: ' + msg); }

// 组装可执行片段：函数体内声明局部 sortBy，参数注入依赖桩与共享 notes
const code = FUNCS.map(extract).join('\n');
const api = new Function(
  'dbPut', 'cancelNoteNotification', 'scheduleNoteNotification', 'getLocalNotifications', 'notes',
  'var sortBy = "updated";\n' + code +
  '\nreturn { noteById: noteById, markNoteDeleted: markNoteDeleted, isBinNote: isBinNote,' +
  ' binNotes: binNotes, sortedNotesFor: sortedNotesFor, resyncAllTodoNotifications: resyncAllTodoNotifications };'
)(dbPut, cancelNoteNotification, scheduleNoteNotification, getLocalNotifications, notes);

// ---- 测试数据：3 条正常 + 2 条已删除 ----
function mk(id, extra) {
  return Object.assign({ id: id, type: 'note', content: 'c', createdAt: 100, updatedAt: 100,
    dueAt: null, doneAt: null, pinnedAt: null, color: null, starred: false, order: null,
    deletedAt: null, deletedFrom: null }, extra || {});
}
setNotes([mk('n1'), mk('t1', { type: 'todo', updatedAt: 300 }), mk('t2', { type: 'todo', updatedAt: 200 })]);
const bin1 = mk('b1', { deletedAt: 500, deletedFrom: 'manual' });
const bin2 = mk('b2', { deletedAt: 900, deletedFrom: 'auto' });
notes.push(bin1, bin2);

// 1. noteById 跳过回收箱
assert(api.noteById('n1') && api.noteById('n1').id === 'n1', 'noteById 正常返回未删除');
assert(api.noteById('b1') === null, 'noteById 跳过已删除');

// 2. isBinNote / binNotes 倒序
assert(api.isBinNote(bin1) && !api.isBinNote(mk('x')), 'isBinNote 判定');
assert(api.binNotes().map(function (n) { return n.id; }).join(',') === 'b2,b1', 'binNotes 按 deletedAt 倒序');

// 3. sortedNotesFor 排除回收箱；todo 分段同样排除
let visible = api.sortedNotesFor('all').map(function (n) { return n.id; });
assert(visible.indexOf('b1') === -1 && visible.indexOf('b2') === -1, '全部列表不含回收箱条目');
let todoVisible = api.sortedNotesFor('todo').map(function (n) { return n.id; });
assert(todoVisible.join(',') === 't1,t2', 'todo 分段不含回收箱（按 updatedAt 倒序）');

// 4. markNoteDeleted：打标记 + 写库 + 取消通知 + 不再可见
setNotes([mk('d1'), mk('d2')]);
api.markNoteDeleted('d1', 'manual');
assert(notes[0].deletedAt != null && notes[0].deletedFrom === 'manual', 'markNoteDeleted 打标记');
assert(dbPuts.length === 1 && dbPuts[0].deletedAt != null && dbPuts[0].deletedFrom === 'manual', 'dbPut 持久化标记');
assert(cancelled.join(',') === 'd1', '取消 d1 系统通知');
assert(api.noteById('d1') === null, '删除后不可查');
assert(api.sortedNotesFor('all').length === 1, '删除后列表只剩 d2');
api.markNoteDeleted('d2', 'auto');
assert(notes[1].deletedFrom === 'auto', '自动清理路径同样可标记');

// 5. resyncAllTodoNotifications 跳过已删除
setNotes([mk('t3', { type: 'todo' }), mk('t4', { type: 'todo', deletedAt: 100, deletedFrom: 'auto' })]);
scheduled = [];
api.resyncAllTodoNotifications();
assert(scheduled.join(',') === 't3', '通知恢复只调度未删除的待办');

console.log('\n' + assertions + ' assertions, ' + (process.exitCode ? 'FAILURES' : 'ALL PASS'));