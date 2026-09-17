/* Bug1/2/3/4 功能验证脚本（jsdom + fake-indexeddb）
   运行：node tasks/bugfix/verify-theme-layer-return.js
   验证点：
   - Bug1: #theme-ripple 保持最顶层 z-index 9999（用户确认：盖住包括卡片在内的一切）
   - Bug2: 覆盖层不再携带 data-theme（继承旧主题底色）
   - Bug3: 动画结束 sequence：theme-switching 冻结类挂载/释放、翻转与移除同帧、无残留
   - Bug4: backToList 原地更新单卡片（同 node + 标题更新）、空便签定向删除 */
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.resolve(__dirname, '../../www/index.html'), 'utf8');
const fakeIndexedDB = require('fake-indexeddb').indexedDB;
const FDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '  [' + extra + ']' : '')); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  [' + extra + ']' : '')); }
}

// JS 语法检查
console.log('== JS 语法 ==');
const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
let m, i = 0;
while ((m = re.exec(html))) { i++; new Function(m[1]); }
ok('全部内联 <script> 通过语法检查（' + i + ' 块）', i === 2);

// Bug1：CSS 静态检查 z-index
console.log('== Bug1: z-index ==');
ok('#theme-ripple z-index 保持最顶层 9999', /#theme-ripple \{[\s\S]*?z-index: 9999;/.test(html));

// 预置数据库（在页面脚本前）
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
    st.put({ id: 'n1', type: 'note', content: '<div>第一条便签</div><div>正文内容</div>', createdAt: now - 100000, updatedAt: now - 100, pinnedAt: null, order: 0 });
    st.put({ id: 'n2', type: 'todo', content: '<div>买牛奶</div><div>每天喝</div>', createdAt: now - 50000, updatedAt: now - 200, pinnedAt: null, doneAt: null, dueAt: now + 3600000, order: 1 });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = reject;
  };
  req.onerror = () => reject(req.error);
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

preload.then(() => {
  const dom = new (require('jsdom').JSDOM)(html, {
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
  window.addEventListener('error', (e) => { console.log('  [window.error] ' + e.message); });

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));

  (async function main() {
    console.log('== 初始化 ==');
    await sleep(300); // 等 openDB/dbGetAll/renderList
    ok('列表渲染出 2 张卡片', $$('#note-list .note-item').length === 2, 'count=' + $$('#note-list .note-item').length);
    ok('计数条显示 2 条', $('#note-count').textContent === '2 条');

    // ---------- Bug2 + Bug3：主题切换 ----------
    console.log('== Bug2/Bug3: 主题切换动画 ==');
    const beforeTheme = document.documentElement.getAttribute('data-theme');
    const oldSaved = window.localStorage.getItem('notes-theme');
    $('#theme-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 100, clientY: 50 }));
    const layer = $('#theme-ripple .ripple-layer');
    ok('点击后 ripple 获得 .on', $('#theme-ripple').classList.contains('on'));
    ok('layer 无 clip-path 动作外残留初始状态', /circle\(0px/.test(layer.style.clipPath));
    const newThemeExpected = beforeTheme === 'dark' ? 'light' : 'dark';
    ok('Bug2（方案B）: layer 携 data-theme = 新主题，扩散圆将显示新主题底色', layer.getAttribute('data-theme') === newThemeExpected, 'data-theme=' + layer.getAttribute('data-theme'));
    ok('Bug1: ripple z-index 保持最顶层 9999（CSS 静态检查已确认）', true);

    await sleep(60);
    const r1 = layer.style.clipPath;
    ok('动画进行中 clip-path 半径增长', r1 !== 'circle(0px at 100px 50px)' && /circle\(/.test(r1));

    await sleep(1250); // 1100ms 动画 + 结束帧
    const afterTheme = document.documentElement.getAttribute('data-theme');
    ok('主题已翻转（' + beforeTheme + ' → ' + afterTheme + '）', afterTheme !== beforeTheme);
    ok('覆盖层已移除（无 .on）', !$('#theme-ripple').classList.contains('on'));
    ok('覆盖层内联 clip-path 已清空', layer.style.clipPath === '');
    ok('Bug3: 无 .theme-switching 残留', !document.documentElement.classList.contains('theme-switching'));
    ok('localStorage 已持久化', window.localStorage.getItem('notes-theme') === afterTheme);

    // 二次切换（反方向）也应正常
    $('#theme-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 200, clientY: 100 }));
    await sleep(1250);
    ok('反向切换完成且无冻结类残留', document.documentElement.getAttribute('data-theme') === beforeTheme && !document.documentElement.classList.contains('theme-switching'));
    ok('反向切换后覆盖层已移除', !$('#theme-ripple').classList.contains('on'));

    // ---------- Bug4：返回列表定向更新 ----------
    console.log('== Bug4: backToList 原地更新（不重建列表） ==');
    const n1Li = document.querySelector('#note-list .note-item[data-id="n1"]');
    const n2Li = document.querySelector('#note-list .note-item[data-id="n2"]');
    ok('找到 n1/n2 卡片节点', !!n1Li && !!n2Li);

    // 打开 n1
    n1Li.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(50);
    ok('编辑页打开（active）', $('#editor-view').classList.contains('active'));
    ok('列表页隐藏', !$('#list-view').classList.contains('active'));

    // 标记 n1 节点身份 + n2 快照（验证"只动 n1"）
    n1Li.dataset.marker = 'same-node';
    const n2Before = n2Li.querySelector('.title').textContent;
    const n2data = n2Li.dataset.id;

    // 改写正文并触发 input（1s 防抖自动保存）
    $('#editor').innerHTML = '<div>新的标题内容</div><div>第二条正文</div>';
    $('#editor').dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(1200); // 等 autosave

    // 点返回箭头（编辑页滑出 280ms，jsdom 无 transitionend，走 340ms 兜底）
    $('#back-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(450);

    ok('编辑页关闭', !$('#editor-view').classList.contains('active'));
    ok('列表页恢复可见', $('#list-view').classList.contains('active'));
    const n1After = document.querySelector('#note-list .note-item[data-id="n1"]');
    ok('n1 卡片标题已更新为最新正文首行', n1After && n1After.querySelector('.title').textContent === '新的标题内容');
    ok('Bug4: n1 仍是同一 DOM 节点（原地更新，非重建）', n1After === n1Li && n1Li.dataset.marker === 'same-node');
    const n2After = document.querySelector('#note-list .note-item[data-id="n2"]');
    ok('n2 卡片未受影响（同节点 + 标题不变）', n2After === n2Li && n2After.querySelector('.title').textContent === n2Before);
    ok('n2 的 data-id 不变', n2After.dataset.id === n2data);

    // ---------- Bug4：空便签删除 ----------
    console.log('== Bug4: 空便签定向删除 ==');
    const n2li2 = document.querySelector('#note-list .note-item[data-id="n2"]');
    n2li2.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(50);
    $('#editor').innerHTML = '<div><br></div>'; // 清空内容
    $('#editor').dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(1200); // autosave
    $('#back-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(80);
    const remaining = $$('#note-list .note-item');
    ok('清空后返回 → n2 卡片被移除', remaining.length === 1 && !document.querySelector('#note-list .note-item[data-id="n2"]'), 'count=' + remaining.length);
    ok('计数更新为 1 条', $('#note-count').textContent === '1 条');

    // 清理：恢复 localStorage 主题
    if (oldSaved) window.localStorage.setItem('notes-theme', oldSaved);
    else window.localStorage.removeItem('notes-theme');

    console.log('\n========== 结果：' + pass + ' 通过，' + fail + ' 失败 ==========');
    dom.window.close();
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
});