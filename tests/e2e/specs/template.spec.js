// 复现脚本模板：复制为 xxx.spec.js 后改成本次 bug 的复现
// 运行：node tests/e2e/specs/xxx.spec.js
const path = require('path');
const { runSpec, assert } = require(path.resolve(__dirname, '../runner.js'));

runSpec('示例：新建便签后应出现在列表', async ({ page, tap, $$, shot, assert }) => {
  const titles0 = await $$('.note-item .title', els => els.map(e => e.textContent.trim()));
  console.log('  初始列表:', titles0);
  assert.ok(Array.isArray(titles0), '应该能读到列表');
});
