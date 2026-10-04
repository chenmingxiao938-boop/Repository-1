# 最后一班：联机试验版

本目录是实际游戏程序。正式规则见上级 `RULES.md`；搜索奖励采用 `SEARCH-EVENTS-V02.md` 试验配置，不代表平衡已经完成。

## 本机启动

需要 Node.js 24 或更新版本。在本目录运行：

```powershell
npm ci --cache .cache/npm
npm start
```

浏览器打开 http://127.0.0.1:3000 。一人建房，将邀请链接或六位房间号分享给其他人。需要六至八个独立玩家身份开始；同一标签页刷新会恢复身份。

默认仅监听本机。跨设备试玩须使用公开 HTTPS 地址，或自行明确配置 `HOST`。公开地址下服务器仍须运行；关闭服务器会清空当前内存房间。房间凭证仅保存在玩家当前标签页，不包含在分享链接中。

Windows x64 可在本目录运行 `npm run share`，启动游戏并取得临时 HTTPS 分享地址。启动器将下载固定版本的官方 Cloudflare 工具并核对校验值；全部文件留在项目目录。保持电脑和该程序运行，按 Ctrl+C 会同时关闭分享与游戏。临时地址用于试玩，不是永久托管。

## 固定网址部署

仓库根目录的 `render.yaml` 定义了一个 Render Web Service：只安装运行依赖，使用 Node 24、平台提供的端口，监听公开网络接口，以 `/health` 检查服务状态。先完成仓库要求的人工差异检查，再提交并推送本项目文件和 `render.yaml`。在 Render 控制台选择 **New > Blueprint**，连接该 GitHub 仓库并部署根目录的 `render.yaml`。创建完成后，以实际分配的 `https://...onrender.com` 地址为准，运行：

```powershell
$env:TEST_URL = 'https://实际分配的网址.onrender.com'
node test/public-smoke.mjs
```

上述检查验证两个独立连接可以创建并加入房间；随后仍须用不同设备打开网页，完整试玩一局。配置关闭了应用代码提交触发的自动部署；`render.yaml` 变更仍可能触发 Blueprint 自动同步。正式试玩前须在 Render 控制台将该 Blueprint 的 **Auto Sync** 设为 **No**。Render 免费服务闲置后会休眠，首次唤醒可能较慢；服务重启或重新部署会清空目前存于内存的房间，玩家需要重新建房。

## 验证

```powershell
npm test
npm run check
```

`src/game.mjs` 决定所有行动、资源、投票和结局。`src/server.mjs` 管理真实连接、身份凭证与定时推进。网页只呈现该玩家获准知道的信息。死亡旁观按规则有更广视野。

语音使用浏览器 WebRTC，首次启用需麦克风授权；HTTPS 或 localhost 才能使用麦克风。尚未配置 TURN 中继，某些网络的语音连接可能失败，页面会明确显示失败。文字频道与语音频道同样按阶段、分组和死亡状态限制。

车长先选择下一站，5秒提示后每名乘客自行选择留车或下车；只有这两个队伍，车长固定留车。全员选好即可开始搜索，未选者在倒计时结束时留车。频道聊天和发送框都在“车厢与广播”页。深入调查只显示行为、物品和模糊职业痕迹，不展示任务原文；所有职业每轮基础行动点较前一版减少1点。

## 数据与运行文件

不要求注册，不保存账号。当前房间存放在服务进程内；两小时无人连接会清理房间。不要关闭含身份凭证的标签页后期待重新获得原身份。永久退出与临时掉线是不同操作。

依赖目录、浏览器测试缓存、临时隧道工具及运行日志均留在本目录的忽略目录，不加入版本记录。程序未接入支付、广告或分析服务。

## 实现参考（2026-09-28）

- [ws 官方仓库](https://github.com/websockets/ws)：连接、心跳、消息大小限制。
- [MDN WebRTC 协商](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation)：双端同时协商。
- [MDN 麦克风要求](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)：安全上下文与授权。
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)：临时分享地址；因此使用 WebSocket，不使用该服务不支持的 SSE。

本版不将自动化操作验证等同于真人平衡测试。

## 界面语言
页面默认使用 English，顶部可切换为中文。设置保存在当前浏览器，各玩家可以各自选择，不影响同局其他玩家；刷新后会保留。游戏聊天内容保留发送者原文。

最近一次双语功能更新已通过43项规则/服务/语音/语言测试与六浏览器混合语言整局验证。英语设置在浏览器保存；聊天与玩家姓名保持原文。

隐私复核已覆盖死讯公开前的跨组语音旁听，以及与界面词同名的玩家显示。最新验证为45项自动化测试与六浏览器完整对局通过。
