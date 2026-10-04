import test from "node:test";
import assert from "node:assert/strict";
import { Voice } from "../public/voice.js";

test("重复启用只申请一次麦克风，关闭停止所有音轨", async () => {
  let requests = 0,
    resolveMedia,
    stopped = 0;
  globalThis.window = { isSecureContext: true };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia() {
          requests++;
          return new Promise((resolve) => {
            resolveMedia = resolve;
          });
        },
      },
    },
  });
  const track = {
    stop() {
      stopped++;
    },
  };
  const voice = new Voice(
    () => {},
    () => {},
  );
  const first = voice.enable(),
    second = voice.enable();
  assert.equal(first, second);
  resolveMedia({ getTracks: () => [track], getAudioTracks: () => [track] });
  assert.equal(await first, true);
  voice.stop();
  assert.equal(requests, 1);
  assert.equal(stopped, 1);
  assert.equal(voice.enabled, false);
});

test("授权等待期间掉线，迟到音轨立即停止", async () => {
  let resolveMedia,
    stopped = 0;
  globalThis.window = { isSecureContext: true };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia() {
          return new Promise((resolve) => {
            resolveMedia = resolve;
          });
        },
      },
    },
  });
  const voice = new Voice(
    () => {},
    () => {},
  );
  const pending = voice.enable();
  voice.disconnect();
  resolveMedia({
    getTracks: () => [
      {
        stop() {
          stopped++;
        },
      },
    ],
  });
  assert.equal(await pending, false);
  assert.equal(stopped, 1);
  assert.equal(voice.stream, null);
  assert.equal(voice.enabled, false);
});

test("未协商的语音候选超出上限时断开并释放缓存", async () => {
  const statuses = [];
  const voice = new Voice(() => {}, (message) => statuses.push(message));
  let closed = false;
  const peer = {
    pc: {
      remoteDescription: null,
      close() { closed = true; },
    },
    audio: { remove() {} },
    candidates: [],
    pendingTimer: null,
    ignoreOffer: false,
  };
  voice.allowed.set("sender", { canReceive: true });
  voice.peers.set("sender", peer);
  for (let i = 0; i < 32; i++)
    await voice.receive("sender", { candidate: { candidate: `candidate-${i}` } });
  assert.equal(peer.candidates.length, 32);
  await voice.receive("sender", { candidate: { candidate: "overflow" } });
  assert.equal(closed, true);
  assert.equal(peer.candidates.length, 0);
  assert.equal(voice.peers.has("sender"), false);
  assert.equal(voice.allowed.has("sender"), false);
  assert.ok(statuses.some((message) => message.includes("异常")));
});
