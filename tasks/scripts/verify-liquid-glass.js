/* liquid-glass-all 五任务集成验证（jsdom + fake-indexeddb）
   运行：node tasks/design/verify-liquid-glass.js
   覆盖：任务1（主题切换清理）/ 任务2（返回滑出 + freeze-blur）/ 任务3（玻璃结构）/
         任务4（底部胶囊）/ 任务5（创建于/编辑于时间） */
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const fakeIndexedDB = require('fake-indexeddb').indexedDB;
const FDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { fail++; console.log('  \u2717 ' + name + (extra ? '  [' + extra + ']' : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- 静态检查（任务1/3/4/5 的 DOM 与 CSS 痕迹）----
console.log('== 任务1：主题切换已清理（静态） ==');
ok('无 <html data-theme> 初始化脚本', !/<script>[\s\S]*?notes-theme[\s\S]*?<\/script>/.test(html) && !/getItem\('notes-theme'\)/.test(html));
ok('CSS 无 [data-theme=...] 规则', !/\[data-theme=/.test(html));
ok('无 #theme-btn / #theme-ripple 元素', !/id="theme-btn"|id="theme-ripple"/.test(html));
ok('无 .theme-switching 冻结类', !/theme-switching/.test(html));
ok('CSS 用 @media (prefers-color-scheme: dark) 驱动深色', /@media \(prefers-color-scheme: dark\)/.test(html));
ok('深色渐变底色 #1A2030 在媒体查询内', /@media \(prefers-color-scheme: dark\)/.test(html) && html.indexOf('--page-grad-b: #1A2030') > html.indexOf('@media (prefers-color-scheme: dark)'));
ok('无 --shadow-fab（FAB 死 token 移除）', !/--shadow-fab/.test(html));

console.log('== 任务4：#new-bar 替换 FAB（静态） ==');
ok('无 #add-btn / #fab-sheet 元素', !/id="add-btn"|id="fab-sheet"/.test(html));
ok('#new-bar 存在且含两个 .new-cap', /id="new-bar"[\s\S]*?class="new-cap note"[\s\S]*?class="new-cap todo"/.test(html));
ok('列表底部 padding ≥ 100px', /#note-list \{[^}]*padding: 12px 20px calc\(110px/.test(html));
ok('胶囊入场动画 200ms + 淡入', /newbar-in 0\.2s/.test(html));

console.log('== 任务3：玻璃结构（静态） ==');
ok('玻璃 token 已定义', /--glass-bg-strong:/.test(html) && /--glass-blur:/.test(html) && /--glass-highlight:/.test(html));
ok('body 渐变背景', /linear-gradient\(160deg, var\(--page-grad-a\), var\(--page-grad-b\)\)/.test(html));
ok('噪点用内联 SVG 生成', /feTurbulence/.test(html));
ok('卡片无 backdrop-filter 属性（性能约束）', (function () {
    var m = /\.note-item \.swipe-body \{([\s\S]*?)\n  \}/.exec(html);
    return !!m && !/backdrop-filter:/.test(m[1]);
  })());
ok('浮层使用 backdrop-filter（顶栏/胶囊/confirm/toast/面板）', /#list-header \{[\s\S]{0,500}backdrop-filter: var\(--glass-blur\)/.test(html) && /#undo-toast \{[\s\S]{0,500}backdrop-filter: var\(--glass-blur\)/.test(html) && /\.new-cap \{[\s\S]{0,400}backdrop-filter: var\(--glass-blur\)/.test(html) && /\.editor-panel \{[\s\S]{0,400}backdrop-filter: var\(--glass-blur\)/.test(html));
ok('.editor-panel 包裹 #editor', /class="editor-panel"[\s\S]*?id="editor"[\s\S]*?\/\.editor-panel/.test(html));
ok('#editor-view 改为透明 + visibility 隐藏', /#editor-view \{[\s\S]*?background: transparent;[\s\S]*?visibility: hidden;/.test(html));
ok('滑出 260ms cubic-bezier(0.32,0.72,0,1) + opacity', /transition: transform 260ms cubic-bezier\(0\.32, 0\.72, 0, 1\),\s*opacity 260ms/.test(html));
ok('#list-header.freeze-blur 存在（约束3）', /#list-header\.freeze-blur \{[\s\S]*?backdrop-filter: none/.test(html));

console.log('== 任务5：时间显示（静态） ==');
ok('relativeTime / renderNoteTime 已定义', /function relativeTime\(ts\)/.test(html) && /function renderNoteTime\(el, note\)/.test(html));
ok('无旧 formatTime', !/function formatTime/.test(html));
ok('.time 移到 grid 第三行（右下角）', /"title title"[\s\S]*?"excerpt excerpt"[\s\S]*?"time time"/.test(html));
ok('has-due 不再隐藏时间', !/has-due \.time \{ display: none/.test(html));
ok('--time-sub 存在', /--time-sub: #8A8F99/.test(html));

// ---- 运行时验证 ----
const preload = new Promise((resolve, reject) => {
  const req = fakeIndexedDB.open('minimal-notes', 3);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('notes')) {
      const st = db.createObjectStore('notes', { keyPath: 'id' });
      st.createIndex('updatedAt', 'updatedAt');
    }
    if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
  };
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction('notes', 'readwrite');
    const st = tx.objectStore('notes');
    const now = Date.now();
    st.put({ id: 'n1', type: 'note', content: '<div>老笔记标题</div><div>老笔记正文</div>', createdAt: now - 3 * 864e5, updatedAt: now - 5 * 60e3, pinnedAt: null, order: 0 });
    st.put({ id: 'n2', type: 'todo', content: '<div>刚建的待办</div>', createdAt: now - 30e3, updatedAt: now - 10e3, pinnedAt: null, doneAt: null, dueAt: null, order: 1 });
    st.put({ id: 'n3', type: 'note', content: '<div>时钟回拨</div>', createdAt: now - 864e5, updatedAt: now - 5 * 864e5, pinnedAt: null, order: 2 });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = reject;
  };
  req.onerror = () => reject(req.error);
});

preload.then(() => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    beforeParse(window) {
      window.indexedDB = fakeIndexedDB;
      window.IDBKeyRange = FDBKeyRange;
      window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      try { Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: () => Promise.resolve() }, configurable: true }); } catch (e) {}
    }
  });
  const { window } = dom;
  const { document } = window;
  window.addEventListener('error', e => console.log('  [window.error] ' + e.message));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));

  (async function main() {
    console.log('== 初始化 ==');
    await sleep(300);
    ok('列表渲染出 3 张卡片', $$('#note-list .note-item').length === 3);
    ok('<html> 无 data-theme 属性（不再存在）', !document.documentElement.hasAttribute('data-theme'));
    ok('#new-bar 在 #list-view 内', !!$('#list-view') && !!$('#new-bar') && $('#new-bar').parentElement.id === 'list-view');
    ok('.editor-panel 包裹 #editor', $('#editor').parentElement.classList.contains('editor-panel'));

    console.log('== 任务5：卡片时间两行 ==');
    const n1Time = $('#note-list .note-item[data-id="n1"] .time');
    const lines = $$('#note-list .note-item[data-id="n1"] .time span').map(s => s.textContent);
    ok('n1（3天前创建、5分钟前编辑）两行时间', lines.length === 2 && lines[0].indexOf('创建于') === 0 && lines[1].indexOf('编辑于') === 0, lines.join(' / '));
    const n2Time = $('#note-list .note-item[data-id="n2"] .time');
    ok('n2（创建<1分钟）只一行', $$('#note-list .note-item[data-id="n2"] .time span').length === 1, n2Time.textContent);
    ok('n3（updated<created 时钟回拨）不显示负数，一行创建时间', !!$('#note-list .note-item[data-id="n3"] .time') && $$('#note-list .note-item[data-id="n3"] .time span').length === 1, $('#note-list .note-item[data-id="n3"] .time').textContent);

    console.log('== 任务4：胶囊新建 ==');
    $('.new-cap.todo').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(60);
    ok('点「待办」→ 打开编辑页', $('#editor-view').classList.contains('active'));
    ok('新建的是待办类型', !!$('#editor-todo-chk'), 'todo-head 可见');
    // 写内容 → 自动保存 → 返回
    $('#editor').innerHTML = '<div>新待办标题</div><div>内容</div>';
    $('#editor').dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(1100);
    $('#back-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(60);
    ok('返回时 #list-header 临时 freeze-blur（约束3）', $('#list-header').classList.contains('freeze-blur'));
    ok('list 可见、editor 滑出中', $('#list-view').classList.contains('active'));
    await sleep(450); // 260ms 过渡 + 340ms 兜底 → finishEditorAnim
    ok('滑出结束后 freeze-blur 已移除', !$('#list-header').classList.contains('freeze-blur'));
    ok('滑出后 #editor-view 无 .active（visibility 隐藏，非 display:none）', !$('#editor-view').classList.contains('active'));
    const newCard = document.querySelector('#note-list .note-item[data-type]');
    const newCardEl = document.querySelector('#note-list .note-item .title');
    ok('新待办卡片出现且标题已更新', newCardEl && newCardEl.textContent === '新待办标题');
    ok('新待办是 todo（is-todo class）', !!(newCard && newCard.classList.contains('is-todo')) || !!(document.querySelector('.note-item.is-todo .title') && document.querySelector('.note-item.is-todo .title').textContent === '新待办标题'));

    console.log('== 任务2：返回定向更新（不重建列表） ==');
    const beforeCount = $$('#note-list .note-item').length;
    const n3li = document.querySelector('#note-list .note-item[data-id="n3"]');
    n3li.dataset.marker = 'same';
    n3li.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(50);
    $('#editor').innerHTML = '<div>改了标题</div>';
    $('#editor').dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(1100);
    $('#back-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(480);
    const n3After = document.querySelector('#note-list .note-item[data-id="n3"]');
    ok('返回后仍是同一 DOM 节点（原地更新）', n3After === n3li && n3li.dataset.marker === 'same');
    ok('标题已更新', n3After.querySelector('.title').textContent === '改了标题');
    ok('卡片总数不变', $$('#note-list .note-item').length === beforeCount, 'count=' + $$('#note-list .note-item').length);

    console.log('\n========== 结果：' + pass + ' 通过，' + fail + ' 失败 ==========');
    dom.window.close();
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
});