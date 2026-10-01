# E2E 测试（Playwright + Chromium）

## 用途
让 AI 改代码前先写复现脚本，改完跑脚本验证，而不是靠盲改 + 人肉测试。

## 运行
    node tests/e2e/specs/xxx.spec.js

## 写新测试
1. 复制 tests/e2e/specs/template.spec.js 为 xxx.spec.js
2. 改操作和断言
3. 运行

## 辅助函数（runner.js 提供）
- tap(selector, opts) — 单击
- longPress(selector, holdMs, opts) — 长按
- drag(fromSelector, deltaY, opts) — 拖动
- waitFor(fn, {timeout}) — 等条件
- $$(selector, mapper) — 抓元素列表
- shot(name) — 截图到 /tmp
- assert.ok / eq / deepEq — 断言

## 局限
- 不是真 Android WebView，触摸/渲染相关的真机 bug 抓不到
- 但 JS 逻辑 bug（排序、数据结构、DOM 顺序、事件绑定）能抓
