import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import * as engine from "./game.mjs";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/i18n.js", ["i18n.js", "text/javascript; charset=utf-8"]],
  ["/voice.js", ["voice.js", "text/javascript; charset=utf-8"]],
]);

function validName(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    [...value.trim()].length > 16 ||
    /[\p{C}]/u.test(value)
  ) {
    throw new Error("昵称须为 1–16 个可见字符");
  }
  return value.trim();
}

function roomCode(value) {
  if (typeof value !== "string" || !/^[A-Z2-9]{6}$/.test(value.toUpperCase()))
    throw new Error("请输入六位房间号");
  return value.toUpperCase();
}

function newCode(rooms) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = [...randomBytes(6)]
      .map((byte) => alphabet[byte % alphabet.length])
      .join("");
  } while (rooms.has(code));
  return code;
}

export function createServer({
  now = Date.now,
  timing,
  rng,
  maxRooms = 100,
} = {}) {
  const rooms = new Map();
  const publicHeaders = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "microphone=(self), camera=()",
    "Cache-Control": "no-store",
  };
  const server = http.createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, publicHeaders).end("Method not allowed");
      return;
    }
    let route;
    try {
      route = new URL(req.url, "http://localhost").pathname;
    } catch {
      res.writeHead(400, publicHeaders).end("Invalid request target");
      return;
    }
    if (route === "/health") {
      res.writeHead(200, {
        ...publicHeaders,
        "Content-Type": "application/json",
      });
      res.end(
        req.method === "HEAD"
          ? undefined
          : JSON.stringify({ ok: true, version: "0.1.0" }),
      );
      return;
    }
    if (route === "/favicon.ico") {
      res.writeHead(204, publicHeaders).end();
      return;
    }
    const file = staticFiles.get(route);
    if (!file) {
      res.writeHead(404, publicHeaders).end("Not found");
      return;
    }
    try {
      const content = await readFile(path.join(publicDir, file[0]));
      res.writeHead(200, { ...publicHeaders, "Content-Type": file[1] });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      console.error("Static file error:", file[0], error.message);
      res.writeHead(500, publicHeaders).end("页面文件无法读取");
    }
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 32768,
    perMessageDeflate: false,
  });
  server.on("upgrade", (req, socket, head) => {
    let allowed = req.url === "/ws";
    if (req.headers.origin) {
      try {
        allowed &&= new URL(req.headers.origin).host === req.headers.host;
      } catch {
        allowed = false;
      }
    }
    if (!allowed || wss.clients.size >= 900) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });

  function send(ws, data) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 1024 * 1024) {
      ws.close(1013, "连接过慢，请重连");
      return;
    }
    ws.send(JSON.stringify(data));
  }
  function broadcast(room) {
    for (const [id, ws] of room.sockets) {
      const state = JSON.stringify(engine.view(room.game, id));
      if (state !== ws.lastState) {
        ws.lastState = state;
        send(ws, { type: "state", state: JSON.parse(state) });
      }
    }
  }
  function bind(ws, room, id, ticket) {
    const previous = room.sockets.get(id);
    if (previous && previous !== ws)
      previous.close(4001, "此身份已在另一连接恢复");
    ws.room = room;
    ws.playerId = id;
    room.sockets.set(id, ws);
    room.game.players.find((p) => p.id === id).online = true;
    room.lastActive = now();
    send(ws, { type: "session", code: room.game.code, ticket, playerId: id });
    broadcast(room);
  }

  wss.on("connection", (ws) => {
    ws.alive = true;
    ws.openedAt = now();
    ws.rateSince = now();
    ws.rateCount = 0;
    ws.on("pong", () => {
      ws.alive = true;
    });
    ws.on("error", (error) => console.error("WebSocket:", error.message));
    ws.on("message", (raw, binary) => {
      let messageType = null;
      try {
        if (now() - ws.rateSince > 1000) {
          ws.rateSince = now();
          ws.rateCount = 0;
        }
        if (++ws.rateCount > 60) {
          ws.close(1008, "操作过快");
          return;
        }
        if (binary) throw new Error("只接受文字消息");
        const message = JSON.parse(raw.toString());
        if (!message || typeof message !== "object" || Array.isArray(message))
          throw new Error("消息格式错误");
        messageType = typeof message.type === "string" ? message.type : null;
        if (
          message.type === "create" ||
          message.type === "join" ||
          message.type === "resume"
        ) {
          if (ws.room) throw new Error("当前连接已加入房间");
          if (message.type === "create") {
            if (rooms.size >= maxRooms)
              throw new Error("当前房间已满，请稍后再试");
            const name = validName(message.name);
            const id = randomUUID();
            const ticket = randomBytes(32).toString("base64url");
            const code = newCode(rooms);
            const game = engine.createGame({
              code,
              hostId: id,
              players: [{ id, name, online: true }],
              now: now(),
              timing,
              rng,
            });
            const room = {
              game,
              sessions: new Map([[ticket, id]]),
              sockets: new Map(),
              lastActive: now(),
            };
            rooms.set(code, room);
            bind(ws, room, id, ticket);
          } else {
            const code = roomCode(message.code);
            const room = rooms.get(code);
            if (!room) throw new Error("房间不存在或已关闭");
            if (message.type === "resume") {
              const id =
                typeof message.ticket === "string" &&
                room.sessions.get(message.ticket);
              const player = room.game.players.find((p) => p.id === id);
              if (!id || !player || player.left)
                throw new Error("身份凭证无效，或已永久退出");
              bind(ws, room, id, message.ticket);
            } else {
              if (room.game.phase !== "lobby")
                throw new Error("游戏已开始，不能中途加入");
              if (room.game.players.length >= 8)
                throw new Error("房间已满，最多八人");
              const name = validName(message.name);
              if (room.game.players.some((p) => p.name === name))
                throw new Error("房间中已有这个昵称");
              const id = randomUUID();
              const ticket = randomBytes(32).toString("base64url");
              const player = { id, name, online: true };
              engine.addPlayer(room.game, player);
              room.sessions.set(ticket, id);
              bind(ws, room, id, ticket);
            }
          }
          return;
        }
        if (!ws.room || ws.room.sockets.get(ws.playerId) !== ws)
          throw new Error("请先加入房间");
        const room = ws.room;
        engine.tick(room.game, now());
        room.lastActive = now();
        if (message.type === "elimination") {
          const player = room.game.players.find((p) => p.id === ws.playerId);
          if (!player || player.alive || player.left)
            throw new Error("当前没有出局选择");
          if (message.choice === "spectate") {
            player.spectating = true;
            broadcast(room);
            send(ws, { type: "ack" });
          } else if (message.choice === "exit") {
            player.online = false;
            player.spectating = false;
            room.sockets.delete(ws.playerId);
            for (const [ticket, owner] of room.sessions)
              if (owner === ws.playerId) room.sessions.delete(ticket);
            broadcast(room);
            send(ws, { type: "ack" });
            ws.close(1000, "已退出观战");
          } else throw new Error("出局选择无效");
        } else if (message.type === "action") {
          if (
            !message.action ||
            typeof message.action.type !== "string" ||
            Array.isArray(message.action)
          )
            throw new Error("操作格式错误");
          engine.act(room.game, ws.playerId, message.action, now());
          if (message.action.type === "leave") {
            room.sockets.delete(ws.playerId);
            for (const [ticket, owner] of room.sessions)
              if (owner === ws.playerId) room.sessions.delete(ticket);
            if (room.game.players.length === 0) rooms.delete(room.game.code);
            broadcast(room);
            send(ws, { type: "ack" });
            ws.close(1000, "已离场");
            return;
          }
          broadcast(room);
          send(ws, { type: "ack" });
        } else if (message.type === "signal") {
          const sender = room.game.players.find((p) => p.id === ws.playerId);
          if (!sender?.alive) throw new Error("出局玩家不能使用语音");
          if (
            typeof message.targetId !== "string" ||
            message.targetId === ws.playerId ||
            !message.data ||
            typeof message.data !== "object"
          )
            throw new Error("语音消息格式错误");
          const target = room.sockets.get(message.targetId);
          const senderPeer = engine
            .view(room.game, ws.playerId)
            .voicePeers?.find((p) => p.id === message.targetId);
          const receiverPeer = target
            ? engine
                .view(room.game, message.targetId)
                .voicePeers?.find((p) => p.id === ws.playerId)
            : null;
          if (
            !senderPeer ||
            (!senderPeer.canSend && !senderPeer.canReceive) ||
            !receiverPeer ||
            (!receiverPeer.canSend && !receiverPeer.canReceive)
          )
            throw new Error("当前不在可通话频道");
          send(target, {
            type: "signal",
            fromId: ws.playerId,
            data: message.data,
          });
        } else throw new Error("未知消息类型");
      } catch (error) {
        send(ws, {
          type: "error",
          operation: messageType,
          message:
            error instanceof SyntaxError ? "消息格式错误" : error.message,
        });
      }
    });
    ws.on("close", () => {
      const room = ws.room;
      if (!room || room.sockets.get(ws.playerId) !== ws) return;
      room.sockets.delete(ws.playerId);
      const player = room.game.players.find((p) => p.id === ws.playerId);
      if (player) player.online = false;
      room.lastActive = now();
      broadcast(room);
    });
  });

  const ticker = setInterval(() => {
    for (const [code, room] of rooms) {
      if (!room.sockets.size && now() - room.lastActive > 2 * 60 * 60 * 1000) {
        rooms.delete(code);
        continue;
      }
      engine.tick(room.game, now());
      broadcast(room);
    }
  }, 250);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive || (!ws.room && now() - ws.openedAt > 30000)) {
        ws.terminate();
        continue;
      }
      ws.alive = false;
      ws.ping();
    }
  }, 15000);
  ticker.unref();
  heartbeat.unref();
  return {
    server,
    rooms,
    listen(port = 3000, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.removeListener("error", reject);
          resolve(server.address());
        });
      });
    },
    async close() {
      clearInterval(ticker);
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      await new Promise((resolve) => wss.close(resolve));
      if (server.listening)
        await new Promise((resolve) => server.close(resolve));
    },
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createServer();
  const address = await app.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
  );
  console.log(`最后一班已启动：http://${address.address}:${address.port}`);
  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
