# 选站与资源平衡实施计划

**Goal:** 全员加权选站、第一/第三轮装置、小幅资源浮动。
**Architecture:** 保持权威服务端，在现有 station 阶段完成投票、一次重投及车长裁决；沿用动作表渲染双语界面。
**Tech Stack:** Node、原生 JavaScript、WebSocket、node:test、Playwright。

用户要求直接实施，不创建分支、不使用子代理、不提交或部署未经人工检查的差异。

- [ ] 修改 app/src/game.mjs：chooseStation 每个存活玩家限一次，车长权重2，其余1；截止结算有效票，平票重投一次，再平票等待车长裁决；换车长重新开始选站，过期阶段请求拒绝。
- [ ] 站点关键道具改为列表，第一轮提供密钥和装置、第三轮提供装置；每种道具独立全组限领一次，领取各2点，各占一次第三/第四情景之外的原关键物品情景选择，单人每轮仍只选一个关键道具。
- [ ] 基础燃料搜索20%多1份，零件/食物20%少1份，深搜同样浮动1份；职业额外零件、道具兑换、私人任务奖励不改。界面显示概率与范围。
- [ ] 更新 app/public/i18n.js、app/public/app.js 的说明及投票动作；更新规则测试和 test/play.browser.mjs 的选站流程。
- [ ] 运行 npm test、npm run check、npm run test:browser；按新规则重跑三局，将旧报告保留。
- [ ] 检查完整差异与 git diff --check，仅暂存此次文件，运行项目 review；更新 CONTEXT.md 和踩坑日志。人工检查前不提交推送。
