import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "../src/server.mjs";

const root = path.resolve(import.meta.dirname, "..");
const temp = path.join(root, ".cache", "browser-tmp");
await mkdir(temp, { recursive: true });
await mkdir(path.join(root, "test-results"), { recursive: true });
process.env.TEMP = temp;
process.env.TMP = temp;
let clock = Date.now();
const app = createServer({ now: () => clock, rng: () => 0.73 });
const address = await app.listen(0);
const origin = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
} catch (error) {
  await app.close();
  throw error;
}
const pages = [],
  errors = [];
const state = (page) => page.evaluate(() => window.__lastState);
async function advanceTransition(page) {
  const current = await state(page);
  if (!current.transitionUntil) return;
  assert.equal(await page.locator("#phase-transition").evaluate((node) => node.open), true);
  clock = current.transitionUntil + 1;
  for (const passenger of pages)
    await passenger.waitForFunction(
      () => window.__lastState?.transitionUntil === null,
    );
  assert.equal(await page.locator("#phase-transition").evaluate((node) => node.open), false);
}
async function submit(page, type, values = {}) {
  const current = await state(page);
  const action = current.actions.find((a) => a.type === type);
  assert.ok(action, `缺少动作 ${type}，当前阶段 ${current.phase}`);
  await page.locator('[data-page="action"]').click();
  const form = page.locator(`form[data-key="${type}:0"]`);
  for (const field of action.fields || []) {
    const input = form.locator(`[name="${field.name}"]`);
    if (values[field.name] !== undefined) {
      if (field.kind === "select")
        await input.selectOption(String(values[field.name]));
      else await input.fill(String(values[field.name]));
    }
  }
  const count = await page.evaluate(() => window.__acks);
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(
    (before) => window.__acks > before || window.__actionError,
    count,
  );
  const error = await page.evaluate(() => window.__actionError);
  assert.equal(error, null, `${type}: ${error}`);
}
try {
  for (let n = 0; n < 6; n++) {
    const context = await browser.newContext({
      viewport:
        n === 1 ? { width: 390, height: 844 } : { width: 1365, height: 900 },
      permissions: ["microphone"],
    });
    await context.addInitScript(() => {
      window.__acks = 0;
      window.__actionError = null;
      window.__peers = [];
      const NativePeer = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends NativePeer {
        constructor(...args) {
          super(...args);
          window.__peers.push(this);
        }
      };
      const NativeSocket = window.WebSocket;
      window.WebSocket = class extends NativeSocket {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", (event) => {
            const packet = JSON.parse(event.data);
            if (packet.type === "state") window.__lastState = packet.state;
            if (packet.type === "ack") window.__acks++;
            if (packet.type === "error" && packet.operation !== "signal")
              window.__actionError = packet.message;
          });
        }
      };
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(origin);
    await page.waitForFunction(
      () => !document.querySelector("#create").disabled,
    ).catch(async (error) => {
      console.error("Browser startup:", await page.locator("#connection").innerText(), await page.locator("#error").innerText(), errors);
      throw error;
    });
    assert.equal(await page.locator("#language").inputValue(), "en");
    assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
    assert.equal(await page.locator("#rules-open").textContent(), "How to play");
    const passengerName = n === 2 ? "Healthy" : n === 3 ? "健康" : `测试乘客${n + 1}`;
    await page.locator("#name").fill(passengerName);
    if (n === 0) await page.locator("#create").click();
    else {
      await page.locator("#code").fill((await state(pages[0])).code);
      await page.locator("#join").click();
    }
    await page.waitForFunction(() => window.__lastState?.phase === "lobby");
    pages.push(page);
  }
  const host = pages[0];
  await host.waitForFunction(() => window.__lastState.players.length === 6);
  await host.locator("#language").selectOption("en");
  assert.equal(await host.locator("#phase").textContent(), "Lobby");
  assert.equal(await host.locator("#rules-open").textContent(), "How to play");
  const code = (await state(host)).code;
  assert.equal(
    await host.locator("#room").textContent(),
    `Room ${code} · One-way ticket`,
  );
  await host.reload();
  await host.waitForFunction(() => window.__lastState?.phase === "lobby");
  assert.equal(await host.evaluate(() => document.documentElement.lang), "en");
  await pages[1].locator("#language").selectOption("en");
  assert.equal(
    await pages[1].evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    "English language control should fit the mobile header",
  );
  await pages[1].locator("#language").selectOption("zh");
  await pages[1].reload();
  await pages[1].waitForFunction(() => window.__lastState?.phase === "lobby");
  assert.equal(await pages[1].locator("#language").inputValue(), "zh");
  await host.locator("#voice-enable").click();
  await pages[1].locator("#voice-enable").click();
  await host.waitForFunction(async () => {
    for (const peer of window.__peers) {
      if (peer.connectionState !== "connected") continue;
      for (const report of (await peer.getStats()).values()) {
        if (
          report.type === "inbound-rtp" &&
          report.kind === "audio" &&
          report.bytesReceived > 0
        )
          return true;
      }
    }
    return false;
  });
  await submit(host, "start");
  for (const page of pages) {
    await page.waitForFunction(() => window.__lastState.phase !== "lobby");
    const current = await state(page);
    assert.ok(current.me.roleLabel);
    assert.ok(current.me.factionLabel);
    assert.ok(
      current.players
        .filter((p) => p.id !== current.me.id)
        .every((p) => p.faction === undefined),
    );
  }
  await advanceTransition(host);
  assert.equal(await host.locator("#phase").textContent(), "Elect a captain");
  assert.equal(
    await host.locator('form[data-key="vote:0"] .action-title').textContent(),
    "Vote for captain",
  );
  const targetNames = await host
    .locator('form[data-key="vote:0"] select[name="targetId"] option')
    .allTextContents();
  assert.ok(targetNames.includes("Healthy"));
  assert.ok(targetNames.includes("健康"));
  const hostId = (await state(host)).me.id;
  for (const page of pages) await submit(page, "vote", { targetId: hostId });
  await host.waitForFunction(
    (id) => window.__lastState.captainId === id,
    hostId,
  );
  const game = [...app.rooms.values()][0].game;
  const originalId = (await state(pages[1])).me.id;
  await pages[1].reload();
  await pages[1].waitForFunction(
    (id) => window.__lastState?.me.id === id,
    originalId,
  );
  assert.equal(
    await pages[1].evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await pages[1].screenshot({
    path: path.join(root, "test-results", "mobile.png"),
    fullPage: true,
  });
  await host.screenshot({
    path: path.join(root, "test-results", "desktop.png"),
    fullPage: true,
  });
  // Exercise real UI operations; only the server clock is accelerated in this test.
  let checkedSkillPage = false;
  let checkedChatPage = false;
  for (let step = 0; step < 90 && !game.result; step++) {
    const current = await state(host);
    if (current.transitionUntil) {
      await advanceTransition(host);
      continue;
    }
    if (current.actions.some((a) => a.type === "chooseStation")) {
      if (!checkedChatPage) {
        await host.locator('[data-page="public"]').click();
        assert.equal(await host.locator('#page-public form[data-key="chat:0"]').count(), 1);
        assert.equal(await host.locator('#page-action form[data-key="chat:0"]').count(), 0);
        checkedChatPage = true;
      }
      await submit(host, "chooseStation");
      assert.match(await host.locator("#phase-transition-label").textContent(), /^Next stop:/);
    } else if (current.phase === "planning") {
      assert.ok(!current.actions.some((a) => a.type === "chooseStation"));
      for (let n = 0; n < pages.length; n++)
        if ((await state(pages[n])).actions.some((a) => a.type === "chooseGroup"))
          await submit(pages[n], "chooseGroup", { group: n >= 1 && n <= 3 ? "away" : "train" });
    } else if (current.phase === "search") {
      if (!checkedSkillPage) {
        const owner = await (async () => {
          for (const page of pages)
            if ((await state(page)).actions.some((a) => a.type === "skill"))
              return page;
          return null;
        })();
        assert.ok(owner, "至少一位乘客应有可用的职业技能");
        await owner.locator('[data-page="skill"]').click();
        assert.equal(await owner.locator('#page-skill form[data-key="skill:0"]').count(), 1);
        assert.equal(await owner.locator('#page-action form[data-key="skill:0"]').count(), 0);
        assert.ok((await owner.locator('#skill-description').textContent()).length > 0);
        checkedSkillPage = true;
        await owner.locator('[data-page="action"]').click();
      }
      for (let n = 0; n < pages.length; n++) {
        const page = pages[n];
        for (let node = 0; node < 5; node++) {
          const me = await state(page),
            action = me.actions.find((a) => a.type === "search");
          if (!action) break;
          const options = action.fields.find(
            (f) => f.name === "choice",
          ).options;
          const resource =
            node === 0 ? (n >= 1 && n <= 3 ? /燃料/ : /零件/) : /食物/;
          const option =
            options.find(
              (o) => resource.test(o.label) && !/深入|深搜/.test(o.label),
            ) || options.find((o) => /跳过|放弃|离开/.test(o.label));
          assert.ok(option, `无法选择搜索题 ${node}`);
          await submit(page, "search", { choice: option.value });
        }
        if ((await state(page)).actions.some((a) => a.type === "done"))
          await submit(page, "done");
      }
    } else if (current.actions.some((a) => a.type === "vote")) {
      for (const page of pages) {
        const action = (await state(page)).actions.find(
          (a) => a.type === "vote",
        );
        if (!action) continue;
        const skip = action.fields[0].options.find((o) => /弃票/.test(o.label));
        await submit(page, "vote", { targetId: skip?.value ?? hostId });
      }
    } else if (current.actions.some((a) => a.type === "next")) {
      for (const p of current.players.filter((p) => p.alive))
        await submit(host, "allocate", {
          targetId: p.id,
          amount: p.group === "train" ? 1 : 2,
        });
      await submit(host, "next");
    } else {
      assert.ok(game.deadline, `无法推进阶段 ${game.phase}`);
      clock = game.deadline + 1;
      await host.waitForFunction(
        (phase) => window.__lastState.phase !== phase,
        current.phase,
      );
    }
  }
  assert.ok(game.result, `四轮之后必须结算：第${game.round}轮 ${game.phase}，乘客 ${game.players.map((p) => `${p.id}:${p.alive}:${p.done}:${p.groupChoice}`).join(",")}`);
  assert.equal(game.round, 4, "合作补给应能完成四轮");

  const watchingId = (await state(pages[0])).me.id;
  const watchingPlayer = game.players.find((player) => player.id === watchingId);
  watchingPlayer.alive = false;
  watchingPlayer.deathPublic = true;
  await pages[0].locator("#elimination-choice").waitFor({ state: "visible" });
  await pages[0].locator("#spectate").click();
  await pages[0].waitForFunction(() => window.__lastState.me.spectating);
  assert.equal(await pages[0].locator("#elimination-choice").isVisible(), false);
  assert.equal(await pages[0].locator("#voice-enable").isDisabled(), true);
  assert.equal((await state(pages[0])).actions.length, 0);

  const exitingId = (await state(pages[1])).me.id;
  const exitingPlayer = game.players.find((player) => player.id === exitingId);
  exitingPlayer.alive = false;
  exitingPlayer.deathPublic = true;
  await pages[1].locator("#elimination-choice").waitFor({ state: "visible" });
  await pages[1].locator("#elimination-exit").click();
  await pages[1].waitForFunction(
    () => !document.querySelector("#entry").hidden,
  );
  const watchingSocket = [...app.rooms.values()][0].sockets.get(watchingId);
  watchingSocket.close(4000, "连接中断");
  await pages[0].locator("#abandon-identity").waitFor({ state: "visible" });
  pages[0].once("dialog", (dialog) => dialog.accept());
  await pages[0].locator("#abandon-identity").click();
  await pages[0].waitForFunction(() => !document.querySelector("#entry").hidden);
  assert.deepEqual(errors, []);
  console.log(
    "Browser verification: 1 passed, 0 failed (six independent players, mobile, reconnect, four-round match).",
  );
} finally {
  await browser.close();
  await app.close();
}
