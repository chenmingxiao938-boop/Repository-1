import assert from "node:assert/strict";
import { WebSocket } from "ws";

const origin = process.env.TEST_URL;
assert.ok(
  origin?.startsWith("https://"),
  "TEST_URL must be an explicit HTTPS game URL",
);
const response = await fetch(`${origin}/health`);
assert.equal(response.status, 200);
assert.equal((await response.json()).ok, true);
async function connect(initial) {
  const socket = new WebSocket(`${origin.replace(/^https:/, "wss:")}/ws`, {
    origin,
  });
  const messages = [],
    waiting = new Set();
  socket.on("message", (raw) => {
    messages.push(JSON.parse(raw));
    for (const wake of waiting) wake();
  });
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  socket.send(JSON.stringify(initial));
  return {
    socket,
    take(type, predicate = () => true) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.delete(check);
          reject(Error(`Public ${type} timed out`));
        }, 15000);
        function check() {
          const index = messages.findIndex(
            (m) => m.type === type && predicate(m),
          );
          if (index < 0) return;
          clearTimeout(timer);
          waiting.delete(check);
          resolve(messages.splice(index, 1)[0]);
        }
        waiting.add(check);
        check();
      });
    },
  };
}
const clients = [];
try {
  const host = await connect({ type: "create", name: "外网验证甲" });
  clients.push(host);
  const session = await host.take("session");
  const guest = await connect({
    type: "join",
    code: session.code,
    name: "外网验证乙",
  });
  clients.push(guest);
  const guestSession = await guest.take("session");
  const joined = await host.take(
    "state",
    (message) => message.state.players.length === 2,
  );
  assert.equal(joined.state.players[1].name, "外网验证乙");
  assert.notEqual(session.ticket, guestSession.ticket);
  for (const client of [...clients].reverse()) {
    client.socket.send(
      JSON.stringify({ type: "action", action: { type: "leave" } }),
    );
    await client.take("ack");
  }
  console.log(
    "Public HTTPS + two independent WebSocket clients: 1 passed, 0 failed.",
  );
} finally {
  for (const client of clients) client.socket.close();
}
