const fs = require('fs');
const html = fs.readFileSync('/root/workspace/notes-app/index.html','utf8');
const grab = (start, end) => html.slice(html.indexOf(start), html.indexOf(end));
let failed = 0;
const assert = (cond, msg) => { if (!cond) { failed = 1; console.error('FAIL: ' + msg); } else console.log('ok  - ' + msg); };

// 提取真实函数源码
const overdueSrc  = grab('function isOverdue(note)', '  // 切换待办完成状态').match(/function isOverdue[\s\S]*?\n  \}/)[0];
const sortedSrc   = grab('function sortedNotesFor(filter)', '  function setSeg(filter)').match(/function sortedNotesFor[\s\S]*?\n  \}/)[0];
const todoSrc = overdueSrc + '\n' + sortedSrc;

// 用 new Function 构建隔离环境：注入依赖，注出 sortedNotesFor / isOverdue
const mk = new Function('notes', 'isTodo', 'isDone', 'isPinned', 'compareNotesBySort', 'Date', `
  ${todoSrc}
  return { sortedNotesFor, isOverdue };
`);

const notes = [];
const isTodo = n => n.type === 'todo';
const isDone = n => n.doneAt != null;
const isPinned = n => !!n.pinnedAt;
const cmp = (a,b) => b.updatedAt - a.updatedAt;
const fixedNow = new Date('2026-01-10T12:00:00');
const FakeDate = Object.assign(function(){ return fixedNow; }, { now: function(){ return fixedNow.getTime(); } });
const F = mk(notes, isTodo, isDone, isPinned, cmp, FakeDate);

const N = (id, o) => notes.push(Object.assign({ id, type:'note', content:'', createdAt:1, updatedAt:1, doneAt:null, dueAt:null }, o));
N('n1');
N('t-todo-future', { type:'todo', dueAt: fixedNow.getTime()+3600e3, updatedAt: 100 });
N('t-done-old',   { type:'todo', dueAt: fixedNow.getTime()-3600e3, doneAt: 100, updatedAt: 90 });
N('t-done-new',   { type:'todo', dueAt: fixedNow.getTime()+3600e3, doneAt: 200, updatedAt: 80 });
N('t-overdue1',   { type:'todo', dueAt: fixedNow.getTime()-7200e3, updatedAt: 70 });
N('t-overdue2',   { type:'todo', dueAt: fixedNow.getTime()-3600e3, updatedAt: 60 });
N('t-nodue',      { type:'todo', dueAt: null, updatedAt: 50 });

// isOverdue
assert(F.isOverdue(notes[2]) === false, '已过期状态函数：已完成但过期 → 非过期(已完成优先)');
assert(F.isOverdue(notes[5]) === true,  '已过期状态函数：未完成+dueAt<now → 过期');
assert(F.isOverdue(notes[6]) === false, '已过期状态函数：未完成+无dueAt → 非过期');

// 分段过滤 + 排序
const order = ids => F.sortedNotesFor('all').map(n=>n.id);
const all = order('all');
assert(JSON.stringify(all) === JSON.stringify(['t-todo-future','t-nodue','t-overdue1','t-overdue2','n1','t-done-new','t-done-old']),
  '全部视图：进行中→已过期→普通笔记→已完成(doneAt倒序)。实际=' + all.join(','));

const todoV = F.sortedNotesFor('todo').map(n=>n.id);
assert(JSON.stringify(todoV) === JSON.stringify(['t-todo-future','t-nodue','t-overdue1','t-overdue2','t-done-new','t-done-old']),
  '待办视图：全部待办都在（已完成不消失、沉底）。实际=' + todoV.join(','));

const doneV = F.sortedNotesFor('done').map(n=>n.id);
assert(JSON.stringify(doneV) === JSON.stringify(['t-done-new','t-done-old']), '已完成视图：仅已完成，doneAt 倒序');

process.exit(failed);
