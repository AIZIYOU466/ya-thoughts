// E2E 通用启动器：起 HTTP 服务器 + 启动 Chromium + 辅助函数
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

function startServer(rootDir, port = 8801) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const full = path.join(rootDir, p);
      if (!full.startsWith(rootDir)) { res.writeHead(403); res.end(); return; }
      fs.readFile(full, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        const ext = path.extname(full).slice(1);
        const mime = { html: 'text/html', js: 'text/javascript', css: 'text/css',
                       json: 'application/json', png: 'image/png', svg: 'image/svg+xml' }[ext] || 'text/plain';
        res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' });
        res.end(data);
      });
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function makeHelpers(page, logs) {
  return {
    async tap(selector, opts = {}) {
      const el = await page.$(selector);
      if (!el) throw new Error('tap: 找不到元素 ' + selector);
      const box = await el.boundingBox();
      if (!box) throw new Error('tap: 元素不可见 ' + selector);
      const x = box.x + (opts.x != null ? opts.x : box.width / 2);
      const y = box.y + (opts.y != null ? opts.y : box.height / 2);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.waitForTimeout(opts.holdMs || 30);
      await page.mouse.up();
    },
    async longPress(selector, holdMs = 600, opts = {}) {
      const el = await page.$(selector);
      if (!el) throw new Error('longPress: 找不到 ' + selector);
      const box = await el.boundingBox();
      const x = box.x + (opts.x != null ? opts.x : box.width / 2);
      const y = box.y + (opts.y != null ? opts.y : box.height / 2);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.waitForTimeout(holdMs);
      await page.waitForTimeout(100);
      if (opts.release !== false) await page.mouse.up();
      return { x, y };
    },
    async drag(fromSel, toDeltaY, opts = {}) {
      const el = await page.$(fromSel);
      const box = await el.boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.waitForTimeout(opts.holdMs || 600);
      const steps = opts.steps || 15;
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(x, y + (toDeltaY * i) / steps);
        await page.waitForTimeout(16);
      }
      if (opts.release !== false) await page.mouse.up();
    },
    async waitFor(fn, opts = {}) {
      const timeout = opts.timeout || 5000;
      const interval = opts.interval || 100;
      const msg = opts.msg || '条件超时';
      const start = Date.now();
      while (Date.now() - start < timeout) {
        if (await fn()) return true;
        await page.waitForTimeout(interval);
      }
      throw new Error('waitFor: ' + msg);
    },
    async $$(selector, mapFn) {
      return page.$$eval(selector, (els, fnStr) => {
        return eval('(' + fnStr + ')')(els);
      }, mapFn.toString());
    },
    async shot(name) {
      const p = '/tmp/e2e-' + name + '-' + Date.now() + '.png';
      await page.screenshot({ path: p });
      console.log('  📷 截图: ' + p);
      return p;
    },
    log: function () { return logs.slice(); },
  };
}

const assert = {
  ok(cond, msg) { if (!cond) throw new Error('断言失败: ' + msg); },
  eq(a, b, msg) {
    if (a !== b) throw new Error('断言失败: ' + msg + '\n  期望: ' + JSON.stringify(b) + '\n  实际: ' + JSON.stringify(a));
  },
  deepEq(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) throw new Error('断言失败: ' + msg + '\n  期望: ' + sb + '\n  实际: ' + sa);
  },
};

async function runSpec(name, fn) {
  console.log('\n════ 测试: ' + name + ' ════');
  const rootDir = path.resolve(__dirname, '../..');
  const server = await startServer(rootDir, 8801);
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--single-process'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 400, height: 800 },
    hasTouch: true,
  });
  const page = await ctx.newPage();

  const logs = [];
  page.on('console', m => { logs.push('[log] ' + m.text()); });
  page.on('pageerror', e => { logs.push('[err] ' + e.message); });

  const H = makeHelpers(page, () => logs);

  let passed = false, err = null;
  try {
    await page.goto('http://127.0.0.1:8801/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await fn(Object.assign({ page, assert, logs }, H));
    passed = true;
  } catch (e) {
    err = e;
  }

  if (logs.length) {
    console.log('\n--- 页面日志 ---');
    logs.forEach(l => console.log('  ' + l));
  }

  await browser.close();
  server.close();

  if (passed) {
    console.log('✅ 通过: ' + name + '\n');
    return true;
  } else {
    console.log('❌ 失败: ' + name);
    console.log('  错误: ' + (err && err.message));
    if (err && err.stack) console.log('  ' + err.stack.split('\n').slice(1, 4).join('\n  '));
    process.exitCode = 1;
    return false;
  }
}

module.exports = { runSpec, assert };
