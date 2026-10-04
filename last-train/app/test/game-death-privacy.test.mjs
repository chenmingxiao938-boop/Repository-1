import test from "node:test";
import assert from "node:assert/strict";
import { act, createGame, view } from "../src/game.mjs";

test("living players see deaths only after the public announcement", () => {
  const g = createGame({
    code: "SECRET",
    hostId: "p0",
    timing: { transition: 0 },
    players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
  });
  act(g, "p0", { type: "start" }, 0);
  const dead = g.players[1];
  dead.alive = false;
  dead.deathPublic = false;
  dead.group = "train";
  g.phase = "search";
  g.players[0].bag.push({ id: "serum-test", type: "serum", label: "血清" });

  assert.equal(view(g, "p0").players.find((p) => p.id === dead.id).alive, true);
  const observerView = view(g, "p0");
  const serumTarget = observerView.actions
    .find((action) => action.type === "inject")
    ?.fields.find((field) => field.name === "targetId");
  assert.ok(serumTarget?.options.some((option) => option.value === dead.id));
  assert.ok(!observerView.voicePeers.some((peer) => peer.id === dead.id));
  assert.equal(view(g, dead.id).players.find((p) => p.id === dead.id).alive, false);
  const pending = view(g, dead.id);
  assert.equal(pending.me.eliminationPending, true);
  assert.equal(pending.me.spectating, false);
  assert.equal(pending.players.find((p) => p.id === "p0").roleLabel, undefined);
  assert.deepEqual(pending.voicePeers, []);

  dead.spectating = true;
  const watching = view(g, dead.id);
  assert.equal(watching.me.eliminationPending, false);
  assert.equal(watching.me.spectating, true);
  assert.ok(watching.players.find((p) => p.id === "p0").roleLabel);
  assert.deepEqual(watching.actions, []);
  assert.deepEqual(watching.voicePeers, []);

  dead.deathPublic = true;
  assert.equal(view(g, "p0").players.find((p) => p.id === dead.id).alive, false);
  const announced = view(g, "p0");
  assert.ok(
    !announced.actions
      .find((action) => action.type === "inject")
      ?.fields.find((field) => field.name === "targetId")
      ?.options.some((option) => option.value === dead.id),
  );
  assert.ok(!announced.voicePeers.some((peer) => peer.id === dead.id));
});
