import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { WebSocket } from "ws";
import { createServer } from "../src/server.mjs";

async function client(url, initial) {
  const ws = new WebSocket(url);
  const messages = [];
  const waiters = new Set();
  ws.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    messages.push(message);
    for (const wake of waiters) wake();
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const api = {
    ws,
    messages,
    send(value) {
      ws.send(JSON.stringify(value));
    },
    async take(predicate, timeout = 3000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(new Error("等待消息超时"));
        }, timeout);
        function check() {
          const index = messages.findIndex(predicate);
          if (index < 0) return;
          clearTimeout(timer);
          waiters.delete(check);
          resolve(messages.splice(index, 1)[0]);
        }
        waiters.add(check);
        check();
      });
    },
  };
  if (initial) api.send(initial);
  return api;
}

async function setup(t) {
  const app = createServer({ timing: { transition: 0 } });
  const address = await app.listen(0);
  t.after(() => app.close());
  return {
    app,
    url: `ws://127.0.0.1:${address.port}/ws`,
    http: `http://127.0.0.1:${address.port}`,
  };
}

test("独立连接建房、加入、身份凭证重连，不允许冒用", async (t) => {
  const { url } = await setup(t);
  const host = await client(url, { type: "create", name: "车长候选" });
  const session = await host.take((m) => m.type === "session");
  const second = await client(url, {
    type: "join",
    code: session.code,
    name: "旅客二",
  });
  const secondSession = await second.take((m) => m.type === "session");
  assert.notEqual(session.ticket, secondSession.ticket);
  const state = await host.take(
    (m) => m.type === "state" && m.state.players.length === 2,
  );
  assert.equal(state.state.players[1].name, "旅客二");
  assert.ok(!JSON.stringify(state).includes(secondSession.ticket));
  host.ws.close();
  await new Promise((resolve) => host.ws.once("close", resolve));
  const resumed = await client(url, {
    type: "resume",
    code: session.code,
    ticket: session.ticket,
  });
  assert.equal(
    (await resumed.take((m) => m.type === "session")).playerId,
    session.playerId,
  );
  const bad = await client(url, {
    type: "resume",
    code: session.code,
    ticket: "forged",
  });
  assert.match((await bad.take((m) => m.type === "error")).message, /身份凭证/);
});

test("六人开始后逐人发身份，拒绝中途加入和不足六人启动", async (t) => {
  const { url } = await setup(t);
  const host = await client(url, { type: "create", name: "旅客一" });
  const session = await host.take((m) => m.type === "session");
  host.send({ type: "action", action: { type: "start" } });
  await host.take((m) => m.type === "error");
  const peers = [host];
  for (let n = 2; n <= 6; n++) {
    const peer = await client(url, {
      type: "join",
      code: session.code,
      name: `旅客${n}`,
    });
    await peer.take((m) => m.type === "session");
    peers.push(peer);
  }
  host.send({ type: "action", action: { type: "start" } });
  for (const peer of peers) {
    const { state } = await peer.take(
      (m) => m.type === "state" && m.state.phase !== "lobby",
    );
    assert.ok(state.me.roleLabel);
    assert.ok(state.me.factionLabel);
    for (const other of state.players.filter((p) => p.id !== state.me.id)) {
      assert.equal(other.faction, undefined);
      assert.equal(other.status, undefined);
      assert.equal(other.bag, undefined);
    }
  }
  const late = await client(url, {
    type: "join",
    code: session.code,
    name: "迟到者",
  });
  assert.match((await late.take((m) => m.type === "error")).message, /已开始/);
});

test("eliminated players can only spectate silently or exit permanently", async (t) => {
  const { app, url } = await setup(t);
  const host = await client(url, { type: "create", name: "旅客一" });
  const hostSession = await host.take((m) => m.type === "session");
  const players = [host];
  const sessions = [hostSession];
  for (let n = 2; n <= 6; n++) {
    const peer = await client(url, {
      type: "join",
      code: hostSession.code,
      name: `旅客${n}`,
    });
    players.push(peer);
    sessions.push(await peer.take((m) => m.type === "session"));
  }
  host.send({ type: "action", action: { type: "start" } });
  for (const peer of players)
    await peer.take((m) => m.type === "state" && m.state.phase !== "lobby");
  const game = app.rooms.get(hostSession.code).game;

  game.players[1].alive = false;
  await players[1].take(
    (m) => m.type === "state" && m.state.me.eliminationPending,
  );
  players[1].send({
    type: "action",
    action: { type: "chat", text: "不能发言" },
  });
  assert.match(
    (await players[1].take((m) => m.type === "error")).message,
    /死者无法操作/,
  );
  players[1].send({
    type: "signal",
    targetId: hostSession.playerId,
    data: { candidate: { candidate: "forbidden" } },
  });
  assert.match(
    (await players[1].take((m) => m.type === "error")).message,
    /出局玩家不能使用语音/,
  );
  players[1].send({ type: "elimination", choice: "spectate" });
  const observed = await players[1].take(
    (m) => m.type === "state" && m.state.me.spectating,
  );
  assert.deepEqual(observed.state.actions, []);
  assert.deepEqual(observed.state.voicePeers, []);
  assert.ok(observed.state.players.every((p) => p.roleLabel));

  game.players[2].alive = false;
  await players[2].take(
    (m) => m.type === "state" && m.state.me.eliminationPending,
  );
  const closed = new Promise((resolve) => players[2].ws.once("close", resolve));
  players[2].send({ type: "elimination", choice: "exit" });
  await players[2].take((m) => m.type === "ack");
  await closed;
  assert.ok(!app.rooms.get(hostSession.code).sessions.has(sessions[2].ticket));
  const resumed = await client(url, {
    type: "resume",
    code: hostSession.code,
    ticket: sessions[2].ticket,
  });
  assert.match((await resumed.take((m) => m.type === "error")).message, /凭证/);
  for (const peer of [host, players[1], players[3], players[4], players[5]])
    peer.ws.close();
});

test("房间隔离、重复昵称及跨房间语音信令被拒绝", async (t) => {
  const { url } = await setup(t);
  const first = await client(url, { type: "create", name: "甲" });
  const a = await first.take((m) => m.type === "session");
  const second = await client(url, { type: "create", name: "乙" });
  const b = await second.take((m) => m.type === "session");
  first.send({
    type: "signal",
    targetId: b.playerId,
    data: { description: { type: "offer", sdp: "test" } },
  });
  const rejectedSignal = await first.take((m) => m.type === "error");
  assert.match(rejectedSignal.message, /频道/);
  assert.equal(rejectedSignal.operation, "signal");
  const duplicate = await client(url, {
    type: "join",
    code: a.code,
    name: "甲",
  });
  assert.match(
    (await duplicate.take((m) => m.type === "error")).message,
    /昵称/,
  );
  assert.notEqual(a.code, b.code);
});

test("语音信令必须同时被发送者与接收者的频道权限允许", async (t) => {
  const { app, url } = await setup(t);
  const host = await client(url, { type: "create", name: "死讯未公开" });
  const session = await host.take((m) => m.type === "session");
  const guest = await client(url, {
    type: "join",
    code: session.code,
    name: "外组乘客",
  });
  const guestSession = await guest.take((m) => m.type === "session");
  const game = app.rooms.get(session.code).game;
  game.phase = "search";
  game.deadline = Date.now() + 60_000;
  game.players[0].group = "train";
  game.players[1].group = "2";

  host.send({
    type: "signal",
    targetId: guestSession.playerId,
    data: { candidate: { candidate: "cross-group" } },
  });
  const denied = await host.take((m) => m.type === "error");
  assert.equal(denied.operation, "signal");

  game.players[1].group = "train";
  host.send({
    type: "signal",
    targetId: game.players[1].id,
    data: { candidate: { candidate: "public-death" } },
  });
  assert.equal(
    (await guest.take((m) => m.type === "signal")).data.candidate.candidate,
    "public-death",
  );
  game.players[0].alive = false;
  host.send({
    type: "signal",
    targetId: guestSession.playerId,
    data: { candidate: { candidate: "dead-sender" } },
  });
  assert.match(
    (await host.take((m) => m.type === "error")).message,
    /出局玩家不能使用语音/,
  );
});

test("HTTP 不暴露规则引擎、凭证、目录；页面设置安全响应头", async (t) => {
  const { http } = await setup(t);
  const health = await fetch(`${http}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, version: "0.1.0" });
  const language = await fetch(`${http}/i18n.js`);
  assert.equal(language.status, 200);
  assert.match(await language.text(), /Last Train/);
  for (const route of ["/src/game.mjs", "/.env", "/package.json", "/rooms"]) {
    assert.equal((await fetch(http + route)).status, 404);
  }
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.match(
    health.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
});

test("拒绝跨来源网页连接", async (t) => {
  const { url } = await setup(t);
  const ws = new WebSocket(url, { origin: "https://unrelated.example" });
  const error = await new Promise((resolve) => ws.once("error", resolve));
  assert.match(error.message, /403/);
});

test("深层非字符串操作类型不会被回显到错误响应", async (t) => {
  const { url } = await setup(t);
  const peer = await client(url);
  const depth = 10000;
  peer.ws.send(`{"type":${"[".repeat(depth)}0${"]".repeat(depth)}}`);
  const error = await peer.take((message) => message.type === "error");
  assert.equal(error.operation, null);
  peer.ws.close();
});

test("binary frames count toward the same per-connection rate limit", async (t) => {
  const { url } = await setup(t);
  const peer = await client(url);
  const closed = new Promise((resolve) => peer.ws.once("close", resolve));
  for (let i = 0; i < 61; i++) peer.ws.send(Buffer.from([0x01]));
  const code = await closed;
  assert.equal(code, 1008);
});

test("非法HTTP地址返回400，不影响其他玩家连接", async (t) => {
  const { http } = await setup(t);
  const port = Number(new URL(http).port);
  const response = await new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () =>
      socket.write(
        "GET //[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
      ),
    );
    let text = "";
    socket.on("data", (chunk) => {
      text += chunk;
    });
    socket.on("end", () => resolve(text));
    socket.on("error", reject);
  });
  assert.match(response, /^HTTP\/1\.1 400/);
  assert.equal((await fetch(`${http}/health`)).status, 200);
});

test("第九人无法加入，重连替换旧连接且保留在线状态", async (t) => {
  const { app, url } = await setup(t);
  const host = await client(url, { type: "create", name: "一" });
  const session = await host.take((m) => m.type === "session");
  for (let n = 2; n <= 8; n++) {
    const peer = await client(url, {
      type: "join",
      code: session.code,
      name: `${n}`,
    });
    await peer.take((m) => m.type === "session");
  }
  const ninth = await client(url, {
    type: "join",
    code: session.code,
    name: "九",
  });
  assert.match((await ninth.take((m) => m.type === "error")).message, /已满/);
  const oldClosed = new Promise((resolve) =>
    host.ws.once("close", (code) => resolve(code)),
  );
  const replacement = await client(url, {
    type: "resume",
    code: session.code,
    ticket: session.ticket,
  });
  await replacement.take((m) => m.type === "session");
  assert.equal(await oldClosed, 4001);
  assert.equal(
    app.rooms
      .get(session.code)
      .game.players.find((p) => p.id === session.playerId).online,
    true,
  );
});

test("候车室主动退出释放座位并使旧凭证失效", async (t) => {
  const { app, url } = await setup(t);
  const host = await client(url, { type: "create", name: "车主" });
  const session = await host.take((m) => m.type === "session");
  const guest = await client(url, {
    type: "join",
    code: session.code,
    name: "旅客",
  });
  const credential = await guest.take((m) => m.type === "session");
  guest.send({ type: "action", action: { type: "leave" } });
  await guest.take((m) => m.type === "ack");
  assert.equal(app.rooms.get(session.code).game.players.length, 1);
  const retry = await client(url, {
    type: "resume",
    code: session.code,
    ticket: credential.ticket,
  });
  assert.match((await retry.take((m) => m.type === "error")).message, /凭证/);
});
