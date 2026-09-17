# Ya thoughts 任务索引

所有便签相关任务文件都在本目录下。

## 项目位置
- 源码：/root/workspace/notes-app/
- 主文件：index.html（纯 HTML/CSS/JS 单文件）
- 构建：Capacitor 8 + Android APK

## 目录结构
- bugfix/  fix/  editor/  design/  motion/  interactions/  notification/  icon/
- feature/      新功能（暂无）
- _archive/     中间产物（.reply / .step）
- scripts/      测试脚本（.js）

## 命名规范
- 任务文件：<动作>-<对象>.txt（如 fix-transition-lag.txt）
- 确认版：<动作>-<对象>.confirm.txt
- **不使用 n- 前缀**（之前文档写错，已更正）

## 活跃任务
- [进行中] fix/recycle-auto-clean-todo.txt —— 回收箱返回键 + 自动清理时机 + 待办状态标记

## 指令模板
读取 /root/workspace/notes-app/tasks/<类别>/<文件名>.txt，严格按文件执行。
源码在 /root/workspace/notes-app/。
完成后汇报，不要执行其他任务。
