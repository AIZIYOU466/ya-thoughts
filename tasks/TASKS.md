# Ya thoughts 任务索引

本目录下所有任务文件都服务于便签项目（Ya thoughts）。

## 项目位置
- **源码**：/root/workspace/notes-app/
- **主文件**：index.html（纯 HTML/CSS/JS 单文件）
- **构建**：Capacitor 8 + Android APK
- **版本文件**：version.json

## 目录结构
- archive/   已完成任务（当前为空）
- feature/   新功能开发
- fix/       修 bug
- ui/        UI、动画、视觉、图标

## 命名规范
新任务文件名：`n-<编号三位数>-<简述>.txt`
- 编号从 001 起，与浏览器项目 b-XXX 平行但绝不混用
- 简述用英文，小写，连字符分隔
- 同一任务的多轮文件共用编号，用不同后缀区分：
  - n-016-fix-transition-lag.txt          第一轮
  - n-016-fix-transition-lag.confirm.txt  第二轮（方案确认）
  - n-016-fix-transition-lag.step2.txt    中间步骤
- 不出现：-v2 / -nuclear / -final / -new 这类含义不明的后缀

示例：
- n-042-搜索结果高亮.txt
- n-043-列表长按菜单.txt

## 活跃任务
（每次新任务在此追加一行：`[状态] 文件名 —— 一句话描述`）

- [进行中] fix/n-038-recycle-auto-clean-todo.txt —— 回收箱返回键 + 自动清理时机 + 待办状态标记

## 已完成任务（archive/）
暂无。完成后从 fix/feature/ui 移入 archive/。

## 新任务流程
1. 复制 TEMPLATE.txt 到对应类别子目录
2. 按命名规范改名（n-042-xxx.txt）
3. 填写任务内容
4. 在本文件「活跃任务」区追加一行
5. 让 AI 读取该文件执行
6. 完成后移到 archive/，并更新本文件

## 给 AI 的指令模板
读取 /root/workspace/notes-app/tasks/<类别>/n-xxx-xxx.txt，严格按文件执行。
源码在 /root/workspace/notes-app/。
修改代码用精准 edit（不要全量重写 index.html）。
完成后汇报，不要执行其他任务。
