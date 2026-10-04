# 最后一班联机原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 让 6–8 人从独立浏览器建房加入，完成身份、会议、分组、四轮搜索和结局。
**Architecture:** Node 权威规则引擎、WebSocket 房间与定时器、独立静态网页；服务端逐人生成可见状态，客户端只提交动作。
**Tech Stack:** Node 24、ws、原生 HTML/CSS/JavaScript、node:test、浏览器验证。

## Global Constraints

- 全部新增文件在 D:/workspace/last-train；不创建分支或 worktree，不提交或覆盖历史文档。
- RULES.md v0.4 为规则依据，SEARCH-EVENTS-V02.md 为明确标注的试验奖励配置。
- 不增加物品种类，不把随机样本或纸面推演当作已完成的游戏测试。
- 用户此前无上下文的 A/B 选项不另行猜测，使用已有完整规则记录。

## Tasks

- [x] 1. `app/src/game.mjs` 实现规则引擎及 `app/test/game.test.mjs`。接口：createGame({code,hostId,players,now,rng,timing})、act(game,playerId,{type,...},now)、tick(game,now)、view(game,playerId)。players 为 {id,name,online}；初始 lobby；所有函数同步，非法动作抛 Error，随机源服务器提供。游戏字段 players（数组）、phase、round、deadline、captainId。act/tick 原地更新。
- [x] 2. `app/src/server.mjs` 提供 HTTP 静态文件与 /ws；首条消息 create{name} / join{code,name} / resume{code,token}，返回 session{code,token,playerId}；后续 action{action}，服务端广播 state{state}，失败 error{message}。重连保持身份，断开更新 online，房间启动最低六人。信令 signal{targetId,data} 受服务端群组限制。
- [x] 3. `app/public/index.html`, `style.css`, `app.js` 制作手机/电脑可用的书页界面、建房加入、规则提示、阶段动作、私有结果、公开会议、倒计时及连接错误。界面依照 view 返回的 actions 自动呈现，不在客户端推算秘密。
- [x] 4. 联机测试两个以上独立连接，规则测试覆盖权限、资源、感染治疗、阵营结算；浏览器走完建房加入与首轮操作并检查报错。修复后复测。
- [x] 5. 检查完整变更、暂存仅本次文件、执行仓库 review。更新 CONTEXT/README/踩坑日志；尝试可达公开临时地址，明确地址有效条件与未验证限制。

## Client state contract

view 返回 {code,phase,phaseLabel,round,deadline,hostId,captainId,players:[{id,name,online,alive,captain,group}],resources:{fuel,parts,food,debt},me:{id,role,roleLabel,faction,factionLabel,ap,bag:[{id,type,label}],status,notes:[],tasks:[]},actions:[{type,label,fields?:[{name,label,kind:'select'|'number'|'text',options?:[{value,label}],min?,max?}]}],log:[],chat:[],result?,voicePeers?:[]}。秘密只有 me/死者全局视图；活人列表不泄露他人阵营或潜伏状态。具体补充以引擎 view 为准。

## Verification

`npm test` 运行真实规则与房间联机测试；浏览器独立上下文验证桌面及手机。任何尚未做完的功能写入项目状态，不以文案代替实现。
