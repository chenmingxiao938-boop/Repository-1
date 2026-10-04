import test from "node:test";
import assert from "node:assert/strict";
import { ROLES, createGame, act, tick, view } from "../src/game.mjs";

test("captain chooses station first, then passengers independently choose two groups", () => {
  const g = createGame({
    code: "GROUP",
    hostId: "p0",
    rng: () => 0.73,
    timing: { transition: 0 },
    players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
  });
  act(g, "p0", { type: "start" }, 0);
  for (const p of g.players) act(g, p.id, { type: "vote", targetId: "p0" }, 1);
  assert.equal(g.phase, "station");
  assert.ok(view(g, "p0").actions.some((a) => a.type === "chooseStation"));
  assert.ok(!view(g, "p1").actions.some((a) => a.type === "chooseGroup"));
  assert.ok(g.players.every((p) => p.records.every((r) => r.category !== "任务")));
  act(g, "p0", { type: "chooseStation", station: "hospital", phaseId: g.phaseId }, 2);
  assert.equal(g.phase, "planning");
  assert.equal(view(g, "p1").station, "医院");
  assert.ok(!view(g, "p0").actions.some((a) => a.type === "chooseGroup"));
  assert.throws(() => act(g, "p0", { type: "chooseGroup", group: "away", phaseId: g.phaseId }, 3), /车长必须留车/);
  for (const p of g.players.slice(1))
    act(g, p.id, { type: "chooseGroup", group: p.id === "p1" ? "away" : "train", phaseId: g.phaseId }, 3);
  assert.equal(g.phase, "search");
  assert.equal(g.players[0].group, "train");
  assert.equal(g.players[1].group, "away");
  assert.equal(g.players[1].solo, true);
  for (const p of g.players) assert.equal(p.ap, ROLES[p.role][1]);
  assert.deepEqual(Object.fromEntries(Object.entries(ROLES).map(([id, role]) => [id, role[1]])), {
    engineer: 4, medic: 4, investigator: 4, tracker: 4,
    guard: 3, searcher: 5, sheriff: 3, gunner: 3, bystander: 6,
  });
});

test("players who do not choose before the deadline remain aboard", () => {
  const g = game();
  g.phase = "station";
  g.round = 1;
  for (const p of g.players) p.groupChoice = null;
  act(g, "p0", { type: "chooseStation", station: "workshop", phaseId: g.phaseId }, 3);
  act(g, "p1", { type: "chooseGroup", group: "away", phaseId: g.phaseId }, 4);
  tick(g, g.deadline);
  assert.equal(g.phase, "search");
  assert.equal(g.players[1].group, "away");
  assert.ok(g.players.filter((p) => p.id !== "p1").every((p) => p.group === "train"));
});

test("group choice ends early if the last undecided passenger leaves", () => {
  const g = game();
  g.phase = "planning";
  g.deadline = 120000;
  for (const p of g.players) p.done = true;
  g.players[1].done = false;
  act(g, g.players[1].id, { type: "leave" }, 3);
  tick(g, 4);
  assert.equal(g.phase, "search");
});

test("weapon emergency is private, lasts ten seconds and consumes both weapons", () => {
  const g = game(),
    attacker = g.players[0],
    defender = g.players[1];
  item(attacker, "gun");
  item(defender, "knife");
  act(
    g,
    attacker.id,
    { type: "attack", targetId: defender.id, itemId: "gun" },
    10,
  );
  assert.equal(attacker.busy, true);
  assert.equal(defender.busy, true);
  assert.equal(attacker.bag.length, 0);
  assert.equal(view(g, defender.id).me.emergency.deadline, 10010);
  assert.equal(view(g, "p2").me.emergency, null);
  g.rng = () => 0;
  act(g, defender.id, { type: "defend", itemId: "knife" }, 11);
  assert.equal(defender.alive, true);
  assert.equal(defender.bag.length, 0);
  assert.equal(attacker.busy, false);
  assert.equal(defender.busy, false);
  assert.equal(view(g, defender.id).me.emergency, null);
});

test("ordinary investigation selects category and consumes optional lens for one extra true record", () => {
  const g = game(),
    p = g.players[0],
    t = g.players[1];
  p.node = 1;
  t.records = [
    { id: "old", owner: t.id, round: 1, category: "用药", text: "第一针" },
    { id: "new", owner: t.id, round: 1, category: "用药", text: "第二针" },
    { id: "task", owner: t.id, round: 1, category: "任务", text: "收集物资" },
  ];
  item(p, "lens");
  const ap = p.ap;
  act(
    g,
    p.id,
    {
      type: "search",
      round: g.round,
      step: p.node,
      choice: "room",
      targetId: t.id,
      category: "用药",
      lensId: "lens",
    },
    10,
  );
  assert.equal(p.ap, ap - 1);
  assert.equal(p.bag.length, 0);
  assert.deepEqual(
    p.evidence.map((e) => e.id),
    ["old", "new"],
  );
  assert.ok(
    p.evidence.every((e) => e.observedRound === 1 && e.observedAt === 10),
  );
});
test("professional deep investigation with lens yields four records at two AP", () => {
  const g = game(),
    p = g.players[0],
    t = g.players[1];
  p.role = "investigator";
  item(p, "lens");
  t.records = Array.from({ length: 5 }, (_, i) => ({
    id: "r" + i,
    owner: t.id,
    round: 1,
    category: "用药",
    text: "记录" + i,
  }));
  act(g, p.id, { type: "skill", targetId: t.id, lensId: "lens" }, 10);
  assert.equal(p.ap, 5);
  assert.equal(p.evidence.length, 4);
  assert.equal(p.bag.length, 0);
});
test("investigator can inspect outside rooms without revealing task text", () => {
  const g = game(), investigator = g.players[0], away = g.players[1];
  investigator.role = "investigator";
  away.group = "away";
  away.records.push({
    id: "away-record",
    owner: away.id,
    round: 1,
    category: "痕迹",
    text: "房间里留有反复修补的器材痕迹。",
  }, {
    id: "private-task",
    owner: away.id,
    round: 1,
    category: "任务",
    text: "私人任务：收集6燃料",
  });
  const before = investigator.ap;
  act(g, investigator.id, { type: "skill", targetId: away.id }, 10);
  assert.equal(investigator.ap, before - 2);
  assert.ok(investigator.evidence.some((entry) => entry.id === "away-record"));
  assert.ok(!investigator.evidence.some((entry) => entry.id === "private-task"));
});
test("invalid lens or category does not charge AP or advance story", () => {
  const g = game(),
    p = g.players[0];
  p.node = 1;
  for (const extra of [{ lensId: "missing" }, { category: "阵营" }, { category: "任务" }]) {
    const before = snapshot(g);
    assert.throws(() =>
      act(
        g,
        p.id,
        { type: "search", round: g.round, step: p.node, choice: "room", targetId: "p1", ...extra },
        10,
      ),
    );
    assert.equal(snapshot(g), before);
  }
});
test("bag observations retain historical round after transfer and never expose faction", () => {
  const g = game(),
    p = g.players[0],
    t = g.players[1];
  p.node = 1;
  item(t, "knife");
  act(
    g,
    p.id,
    { type: "search", round: g.round, step: p.node, choice: "room", targetId: t.id, category: "物品" },
    10,
  );
  const evidence = structuredClone(p.evidence[0]);
  act(g, t.id, { type: "give", targetId: "p2", itemId: "knife" }, 11);
  g.round = 2;
  assert.deepEqual(p.evidence[0], evidence);
  assert.match(evidence.text, /第1轮观察时背包持有knife/);
  assert.equal(evidence.faction, undefined);
});
test("timed overflow can replace old item with no duplication and no AP cost", () => {
  const g = game(),
    p = g.players[0];
  for (let i = 0; i < 6; i++) item(p, "ration", "old" + i);
  p.pending.push({ id: "new", type: "gun", label: "枪械", expires: 20 });
  const ap = p.ap;
  assert.ok(view(g, p.id).actions.some((a) => a.type === "claim"));
  act(g, p.id, { type: "claim", itemId: "new", replaceId: "old0" }, 10);
  assert.equal(p.ap, ap);
  assert.equal(p.bag.length, 6);
  assert.ok(p.bag.some((x) => x.id === "new"));
  assert.equal(p.pending.length, 0);
  assert.deepEqual(
    g.warehouse.map((x) => x.id),
    ["old0"],
  );
});
test("expired overflow and private task rewards cannot bypass required space", () => {
  for (const expires of [5, Infinity]) {
    const g = game(),
      p = g.players[0];
    for (let i = 0; i < 6; i++) item(p, "ration", "old" + i);
    p.pending.push({ id: "new", type: "gun", label: "枪械", expires });
    const before = snapshot(g);
    assert.throws(() =>
      act(g, p.id, { type: "claim", itemId: "new", replaceId: "old0" }, 10),
    );
    assert.equal(snapshot(g), before);
  }
});

function game() {
  const g = createGame({
    code: "TEST",
    hostId: "p0",
    rng: () => 0.99,
    timing: { transition: 0 },
    players: Array.from({ length: 6 }, (_, i) => ({
      id: "p" + i,
      name: "玩家" + i,
    })),
  });
  act(g, "p0", { type: "start" }, 0);
  for (const p of g.players) act(g, p.id, { type: "vote", targetId: "p0" }, 1);
  act(g, "p0", { type: "chooseStation", station: "hospital", phaseId: g.phaseId }, 2);
  for (const p of g.players.slice(1))
    act(g, p.id, { type: "chooseGroup", group: "train", phaseId: g.phaseId }, 2);
  g.players.forEach((p, i) => {
    p.role = "engineer";
    p.faction = i === 5 ? "infected" : "safe";
    p.status = i === 5 ? "infected" : "healthy";
    p.mother = i === 5;
    p.ap = 7;
  });
  return g;
}
function item(p, type, id = type) {
  p.bag.push({ id, type, label: type });
  return id;
}
function endSearch(g) {
  tick(g, g.deadline);
  assert.equal(g.phase, "therapy");
}
function snapshot(g) {
  return JSON.stringify(g);
}

test("single infection can be cured in therapy; original profession stays", () => {
  const g = game();
  act(g, "p5", { type: "infect", targetId: "p1" }, 3);
  endSearch(g);
  assert.equal(g.players[1].status, "latent");
  item(g.players[1], "serum");
  act(
    g,
    "p1",
    { type: "inject", targetId: "p1", itemId: "serum" },
    g.deadline - 1,
  );
  assert.equal(g.players[1].status, "healthy");
  assert.equal(g.players[1].doses, 1);
});
test("same round serum before infection works; two hits remain lethal", () => {
  for (const double of [false, true]) {
    const g = game();
    item(g.players[1], "serum");
    act(g, "p1", { type: "inject", targetId: "p1", itemId: "serum" }, 3);
    act(g, "p5", { type: "infect", targetId: "p1" }, 4);
    if (double) {
      g.players[4].status = "infected";
      act(g, "p4", { type: "infect", targetId: "p1" }, 5);
    }
    endSearch(g);
    assert.equal(g.players[1].alive, !double);
    if (!double) assert.equal(g.players[1].status, "healthy");
  }
});
test("third serum dose kills healthy and converted people", () => {
  for (const status of ["healthy", "infected"]) {
    const g = game(),
      p = g.players[1];
    p.status = status;
    p.doses = 2;
    item(p, "serum");
    act(g, p.id, { type: "inject", targetId: p.id, itemId: "serum" }, 3);
    assert.equal(p.alive, false);
    assert.equal(p.doses, 3);
  }
});
test("bystander can block only one infection even with repeated lucky rolls", () => {
  const g = game(),
    p = g.players[1];
  p.role = "bystander";
  g.rng = () => 0;
  g.infections = [
    { actor: "p5", target: p.id },
    { actor: "p4", target: p.id },
  ];
  endSearch(g);
  assert.equal(p.status, "latent");
  assert.equal(p.alive, true);
  assert.equal(p.used.immunity, true);
  assert.ok(p.notes.some((x) => x.includes("免疫")));
});
test("submitted protocol survives activator death and locks dead seal members", () => {
  const g = game(),
    p = g.players[1];
  g.round = 4;
  g.station = ["isolation", "隔离站", "parts", "device", 0.02];
  g.device = { id: "installed", round: 3 };
  p.sealAbility = true;
  p.faction = "seal";
  item(p, "key");
  act(g, p.id, { type: "activate" }, 3);
  item(g.players[2], "gun");
  act(g, "p2", { type: "attack", targetId: p.id, itemId: "gun" }, 4);
  assert.equal(p.alive, false);
  endSearch(g);
  assert.equal(g.sealComplete, true);
  assert.equal(p.sealWon, true);
  g.phase = "ration";
  act(g, "p0", { type: "next" }, g.deadline - 1);
  assert.equal(g.result.players.find((x) => x.id === p.id).won, true);
  assert.equal(g.result.players.find((x) => x.id === "p5").won, false);
});
test("dismantled device cannot fulfill already submitted protocol", () => {
  const g = game(),
    p = g.players[1];
  g.round = 4;
  g.station = ["isolation"];
  g.device = { id: "installed", round: 3 };
  p.sealAbility = true;
  p.faction = "seal";
  item(p, "key");
  act(g, p.id, { type: "activate" }, 3);
  const q = g.players[2];
  q.knowsDevice = "installed";
  item(q, "toolkit");
  act(g, q.id, { type: "dismantle" }, 4);
  endSearch(g);
  assert.equal(g.sealComplete, false);
  assert.equal(g.device, null);
});
test("unpaid parts debt destroys train at next departure and overrides locks", () => {
  const g = game();
  g.phase = "station";
  g.round = 1;
  for (const p of g.players) p.groupChoice = null;
  g.resources.parts = 2;
  g.resources.fuel = 20;
  act(g, "p0", { type: "chooseStation", station: "workshop", phaseId: g.phaseId }, 3);
  for (const p of g.players.slice(1))
    act(g, p.id, { type: "chooseGroup", group: "train", phaseId: g.phaseId }, 3);
  assert.equal(g.resources.debt, 4);
  g.players[1].sealWon = true;
  g.phase = "station";
  for (const p of g.players) p.groupChoice = null;
  g.resources.parts = 9;
  act(g, "p0", { type: "chooseStation", station: "research", phaseId: g.phaseId }, 4);
  for (const p of g.players.slice(1))
    act(g, p.id, { type: "chooseGroup", group: "train", phaseId: g.phaseId }, 4);
  assert.equal(g.phase, "ended");
  assert.ok(g.result.players.every((p) => !p.won));
});
test("no living converted infection is not extinction while latent remains", () => {
  const g = game();
  g.players[5].alive = false;
  g.players[1].status = "latent";
  endSearch(g);
  tick(g, g.deadline);
  assert.equal(g.phase, "discussion");
});
test("terminal cures latent without serum dose; healthy safe and infected can both win", () => {
  const g = game();
  g.phase = "ration";
  g.round = 4;
  g.players[1].status = "latent";
  g.players[1].doses = 2;
  act(g, "p0", { type: "next" }, 3);
  assert.equal(g.players[1].status, "healthy");
  assert.equal(g.players[1].doses, 2);
  assert.equal(g.result.players.find((p) => p.id === "p1").won, true);
  assert.equal(g.result.players.find((p) => p.id === "p5").won, true);
});
test("invalid operations preserve resources, inventory and all player state", () => {
  const g = game();
  item(g.players[1], "serum");
  item(g.players[1], "gun");
  g.players[1].ap = 0;
  for (const action of [
    { type: "inject", targetId: "p2", itemId: "serum" },
    { type: "attack", targetId: "p2", itemId: "gun" },
    { type: "search", round: g.round, step: 0, choice: "parts" },
    { type: "give", targetId: "missing", itemId: "gun" },
    { type: "skill", targetId: "p2" },
    { type: "dismantle" },
  ]) {
    const before = snapshot(g);
    assert.throws(() => act(g, "p1", action, 3));
    assert.equal(snapshot(g), before);
  }
});
test("captain reelection during ration preserves prior allocations and outside food requirement", () => {
  const g = game();
  g.phase = "ration";
  g.players[0].online = false;
  const p = g.players[1];
  p.group = "1";
  p.ration = 1;
  p.hungry = true;
  g.resources.food = 10;
  tick(g, 3);
  assert.equal(g.phase, "election");
  for (const q of g.players) act(g, q.id, { type: "vote", targetId: p.id }, 4);
  assert.equal(g.phase, "ration");
  assert.equal(p.group, "1");
  assert.equal(p.ration, 1);
  act(g, p.id, { type: "allocate", targetId: p.id, amount: 2 }, 5);
  assert.equal(g.resources.food, 9);
  assert.equal(p.hungry, false);
});
test("dead players have no voice peers and cannot speak or listen", () => {
  const g = game();
  g.players[1].alive = false;
  g.players[1].spectating = true;
  g.players[2].group = "2";
  assert.ok(!view(g, "p0").voicePeers.some((p) => p.id === "p1"));
  assert.deepEqual(view(g, "p1").voicePeers, []);
  assert.ok(!view(g, "p0").voicePeers.some((p) => p.id === "p2"));
});
test("an unannounced death keeps leftover items out of shared storage", () => {
  const g = game();
  const attacker = g.players[0];
  const victim = g.players[1];
  item(attacker, "gun");
  for (const type of ["serum", "lens", "key", "armor"])
    item(attacker, type);
  victim.bag = [
    { id: "loot-1", type: "serum", label: "血清" },
    { id: "loot-2", type: "lens", label: "调查镜" },
    { id: "loot-3", type: "key", label: "隔离密钥" },
    { id: "loot-4", type: "fuelcan", label: "燃料罐" },
  ];
  act(g, attacker.id, { type: "attack", targetId: victim.id, itemId: "gun" }, 3);
  tick(g, 10003);
  assert.equal(victim.alive, false);
  assert.equal(victim.deathPublic, false);
  assert.ok(!g.warehouse.some((entry) => entry.id === "loot-4"));
  assert.ok(!view(g, "p2").warehouse.some((entry) => entry.id === "loot-4"));
  assert.ok(!g.warehouse.some((entry) => entry.id === "loot-3"));
  assert.ok(!view(g, "p2").warehouse.some((entry) => entry.id === "loot-3"));

  for (const player of g.players.filter((player) => player.alive))
    act(g, player.id, { type: "done", phaseId: g.phaseId }, 10004);
  assert.equal(victim.deathPublic, false);
  tick(g, g.deadline);
  assert.equal(victim.deathPublic, true);
  assert.ok(g.warehouse.some((entry) => entry.id === "loot-4"));
  assert.ok(g.warehouse.some((entry) => entry.id === "loot-3"));
});
test("public activity log remains bounded and invalid giveaway checks own item first", () => {
  const g = game();
  g.phase = "ration";
  g.captainId = "p0";
  g.resources.food = 1000;
  for (let i = 0; i < 200; i++)
    act(g, "p0", { type: "allocate", targetId: "p1", amount: 0 }, i);
  assert.equal(g.log.length, 80);
  assert.equal(view(g, "p0").log.length, 60);

  g.phase = "therapy";
  const p = g.players[0];
  for (let i = 0; i < 40; i++) {
    p.doses = 0;
    p.bag.push({ id: `serum-${i}`, type: "serum", label: "血清" });
    act(g, p.id, { type: "inject", targetId: p.id, itemId: `serum-${i}` }, i);
  }
  assert.equal(p.notes.length, 30);

  g.phase = "discussion";
  g.players[1].busy = true;
  assert.throws(
    () => act(g, "p0", { type: "give", targetId: "p1", itemId: "missing" }, 300),
    /道具不在背包/,
  );
});
test("infection attempts do not reveal hidden death or emergency state", () => {
  const g = game();
  const mother = g.players[5];
  g.players[1].alive = false;
  g.players[1].deathPublic = false;
  g.players[2].busy = true;

  assert.doesNotThrow(() =>
    act(g, mother.id, { type: "infect", targetId: "p1" }, 3),
  );
  assert.equal(g.infections.at(-1).target, "p1");
  assert.equal(mother.ap, 6);

  mother.roundUsed.infect = false;
  assert.doesNotThrow(() =>
    act(g, mother.id, { type: "infect", targetId: "p2" }, 4),
  );
  assert.equal(g.infections.at(-1).target, "p2");
  assert.equal(mother.ap, 5);
});
test("invalid skill roles are checked before hidden target state", () => {
  const g = game();
  g.players[1].busy = true;
  assert.throws(
    () => act(g, "p0", { type: "skill", targetId: "p1" }, 3),
    /职业没有主动技能/,
  );
});
test("valid medical skill accepts busy or unannounced-dead targets uniformly", () => {
  const g = game();
  const medic = g.players[0];
  medic.role = "medic";
  g.players[1].alive = false;
  g.players[1].deathPublic = false;
  g.players[2].busy = true;
  assert.doesNotThrow(() =>
    act(g, medic.id, { type: "skill", targetId: "p1" }, 3),
  );
  assert.equal(medic.ap, 6);
  medic.roundUsed.skill = false;
  assert.doesNotThrow(() =>
    act(g, medic.id, { type: "skill", targetId: "p2" }, 4),
  );
  assert.equal(medic.ap, 5);
});
test("search advances immediately when the last unfinished player dies", () => {
  const g = game();
  for (const p of g.players) p.done = true;
  const attacker = g.players[0];
  const target = g.players[5];
  attacker.busy = true;
  target.busy = true;
  target.done = false;
  g.emergencies.push({ actor: attacker.id, target: target.id, deadline: 4 });

  tick(g, 4);
  assert.equal(target.alive, false);
  assert.equal(g.phase, "therapy");
});
test("same-group target lists do not expose a private weapon emergency", () => {
  const g = game();
  g.players[1].busy = true;
  item(g.players[0], "serum");
  const inject = view(g, "p0").actions.find((action) => action.type === "inject");
  assert.ok(
    inject.fields
      .find((field) => field.name === "targetId")
      .options.some((option) => option.value === "p1"),
  );
});
test("search disconnects eliminated players from voice before and after announcement", () => {
  const g = game();
  g.phase = "search";
  g.players[0].group = "1";
  g.players[1].group = "2";
  g.players[1].alive = false;
  g.players[1].deathPublic = false;
  assert.ok(!view(g, "p0").voicePeers.some((p) => p.id === "p1"));
  assert.ok(!view(g, "p1").voicePeers.some((p) => p.id === "p0"));
  g.players[1].deathPublic = true;
  assert.ok(!view(g, "p0").voicePeers.some((p) => p.id === "p1"));
  assert.ok(!view(g, "p1").voicePeers.some((p) => p.id === "p0"));
});
test("offline players are omitted from voice negotiation", () => {
  const g = game();
  g.players[1].online = false;
  assert.ok(!view(g, "p0").voicePeers.some((p) => p.id === "p1"));
  g.players[1].online = true;
  assert.ok(view(g, "p0").voicePeers.some((p) => p.id === "p1"));
});
test("votes from dead players cannot help reach the execution threshold", () => {
  const g = game();
  g.phase = "vote";
  g.deadline = 1;
  g.players[0].alive = false;
  g.votes = {
    p0: "p5",
    p1: "p5",
    p2: "p5",
    p3: null,
    p4: null,
    p5: null,
  };
  tick(g, 2);
  assert.equal(g.players[5].alive, true);
});
test("living view hides others identities and offers investigation of all rooms", () => {
  const g = game();
  g.players[0].role = "investigator";
  g.players[1].group = "2";
  g.players[2].alive = false;
  const v = view(g, "p0");
  for (const p of v.players) {
    assert.equal(p.factionLabel, undefined);
    assert.equal(p.bag, undefined);
  }
  assert.equal(
    v.actions.find((a) => a.type === "skill").fields[0].options.length,
    6,
  );
  assert.ok(v.actions.some((a) => a.type === "chat"));
  assert.ok(v.hint);
  assert.ok(v.me.tasks.every((t) => t.text.includes("/")));
});

test("disconnected empty election pauses and restarts when a player returns", () => {
  const g = game();
  g.phase = "discussion";
  g.captainId = "p5";
  for (const p of g.players) p.online = false;

  tick(g, 10);
  assert.equal(g.phase, "election");
  tick(g, 1000);
  assert.equal(g.candidates.length, 0);
  assert.equal(g.deadline, null);

  g.players[2].online = true;
  tick(g, 1001);
  assert.deepEqual(g.candidates, ["p2"]);
  assert.ok(g.deadline > 1001);
  act(g, "p2", { type: "vote", targetId: "p2" }, 1002);
  tick(g, g.deadline + 1);
  assert.equal(g.captainId, "p2");
  assert.equal(g.phase, "discussion");
});

test("search closure returns temporary overflow but preserves private task rewards", () => {
  const g = game();
  g.players[1].pending = [
    { id: "private", type: "toolkit", label: "工具包", expires: Infinity },
    { id: "overflow", type: "gun", label: "枪械", expires: g.deadline },
  ];
  endSearch(g);
  assert.equal(g.players[1].pending.length, 1);
  assert.equal(g.players[1].pending[0].id, "private");
  assert.equal(g.warehouse.at(-1).id, "overflow");
  assert.ok(view(g, "p1").actions.find((action) => action.type === "claim"));
});

test("publishing stale device evidence does not reveal a replacement device", () => {
  const g = game();
  const p = g.players[0];
  p.evidence.push({
    id: "old-device-proof",
    owner: p.id,
    round: 1,
    category: "设备",
    text: "旧装置",
    deviceId: "old-device",
  });
  g.device = { id: "replacement", round: 1 };
  g.devicePublic = false;

  act(g, p.id, { type: "publish", evidenceId: "old-device-proof" }, 10);
  assert.equal(g.devicePublic, false);

  p.evidence.push({
    id: "current-device-proof",
    owner: p.id,
    round: 1,
    category: "设备",
    text: "当前装置",
    deviceId: "replacement",
  });
  act(g, p.id, { type: "publish", evidenceId: "current-device-proof" }, 11);
  assert.equal(g.devicePublic, true);
});
test("tracker counts active operations once and excludes receiving an injection", () => {
  const g = game();
  g.players[0].role = "tracker";
  g.players[1].role = "investigator";
  act(g, "p0", { type: "skill", targetId: "p1" }, 3);
  item(g.players[2], "serum");
  act(g, "p2", { type: "inject", targetId: "p1", itemId: "serum" }, 4);
  act(g, "p1", { type: "skill", targetId: "p3" }, 5);
  endSearch(g);
  assert.equal(
    g.players[0].notes.find((n) => n.startsWith("追踪结果：")),
    "追踪结果：调查",
  );
});

test("a search confirmation belongs to one scenario and cannot spend AP twice", () => {
  const g = game(), p = g.players[0];
  const first = view(g, p.id).actions.find((action) => action.type === "search");
  const command = {
    type: "search",
    round: first.round,
    step: first.step,
    choice: "parts",
  };
  act(g, p.id, command, 3);
  const after = snapshot(g);
  assert.equal(p.node, 1);
  assert.throws(() => act(g, p.id, command, 4), /此情景已处理/);
  assert.equal(snapshot(g), after);
  assert.equal(view(g, p.id).actions.find((action) => action.type === "search").step, 1);
});

test("repeat control-panel inspection and protocol submission do not charge AP", () => {
  const g = game(), p = g.players[0];
  act(g, p.id, { type: "inspect" }, 3);
  const afterInspection = snapshot(g);
  assert.throws(() => act(g, p.id, { type: "inspect" }, 4), /本轮已经检查/);
  assert.equal(snapshot(g), afterInspection);
  assert.ok(!view(g, p.id).actions.some((action) => action.type === "inspect"));
  p.node = 3;
  const beforeStory = snapshot(g);
  assert.throws(() => act(g, p.id, {
    type: "search", round: g.round, step: p.node, choice: "inspect",
  }, 4), /本轮已经检查/);
  assert.equal(snapshot(g), beforeStory);
  assert.ok(!view(g, p.id).actions.find((action) => action.type === "search")
    .fields[0].options.some((option) => option.value === "inspect"));

  const other = game(), seeker = other.players[0];
  seeker.node = 3;
  act(other, seeker.id, {
    type: "search", round: other.round, step: 3, choice: "inspect",
  }, 3);
  const afterStory = snapshot(other);
  assert.throws(() => act(other, seeker.id, { type: "inspect" }, 4), /本轮已经检查/);
  assert.equal(snapshot(other), afterStory);

  g.round = 4;
  g.station = ["isolation", "隔离中继站"];
  g.device = { id: "device", round: 3 };
  p.sealAbility = true;
  item(p, "key");
  act(g, p.id, { type: "activate" }, 5);
  const afterActivation = snapshot(g);
  assert.throws(() => act(g, p.id, { type: "activate" }, 6), /本轮已经提交/);
  assert.equal(snapshot(g), afterActivation);
  assert.ok(!view(g, p.id).actions.some((action) => action.type === "activate"));
});

test("sheriff backlash stays private while the public report says weapon injury", () => {
  const g = game(), sheriff = g.players[0];
  sheriff.role = "sheriff";
  act(g, sheriff.id, { type: "skill", targetId: "p1" }, 3);
  assert.equal(sheriff.cause, "执法反噬");
  assert.ok(sheriff.notes.some((entry) => entry.includes("执法反噬")));
  tick(g, g.deadline);
  tick(g, g.deadline);
  assert.ok(g.log.includes(`${sheriff.name}：武器伤`));
  assert.ok(!g.log.some((entry) => entry.includes("执法反噬")));
});

test("each new phase pauses actions for five seconds and then unlocks", () => {
  const g = createGame({
    code: "PAUSE",
    hostId: "p0",
    players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
  });
  act(g, "p0", { type: "start" }, 0);
  assert.equal(g.phase, "election");
  assert.equal(g.transitionUntil, 5000);
  assert.equal(g.deadline, 95000);
  assert.deepEqual(view(g, "p0").actions, []);
  assert.throws(() => act(g, "p0", { type: "vote", targetId: "p0" }, 4999), /新阶段准备中/);
  tick(g, 5000);
  assert.equal(g.transitionUntil, null);
  assert.ok(view(g, "p0").actions.some((action) => action.type === "vote"));
  for (let i = 0; i < 6; i++)
    act(g, `p${i}`, { type: "vote", targetId: i < 3 ? "p0" : "p1" }, 5001);
  assert.equal(g.phase, "tie");
  assert.equal(g.transitionUntil, 10001);
  assert.equal(g.deadline, 100001);
});

test("longer default windows end early when every player completes tie speeches", () => {
  const g = createGame({
    code: "READY",
    hostId: "p0",
    players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
    timing: { transition: 0 },
  });
  act(g, "p0", { type: "start" }, 0);
  assert.equal(g.deadline, 90000);
  for (let i = 0; i < 6; i++)
    act(g, `p${i}`, { type: "vote", targetId: i < 3 ? "p0" : "p1" }, 1);
  assert.equal(g.phase, "tie");
  assert.equal(g.deadline, 90001);
  assert.ok(view(g, "p0").actions.some((a) => a.type === "done"));
  for (let i = 0; i < 5; i++)
    act(g, `p${i}`, { type: "done", phaseId: g.phaseId }, 2);
  assert.equal(g.phase, "tie");
  assert.throws(() => act(g, "p0", { type: "done", phaseId: g.phaseId }, 2), /本阶段已经完成/);
  act(g, "p5", { type: "done", phaseId: g.phaseId }, 2);
  assert.equal(g.phase, "election");
  assert.equal(g.deadline, 90002);
});

test("a delayed completion cannot close the next private treatment window", () => {
  const g = game();
  const oldPhaseId = g.phaseId;
  tick(g, g.deadline);
  assert.equal(g.phase, "therapy");
  assert.notEqual(g.phaseId, oldPhaseId);
  assert.throws(
    () => act(g, "p0", { type: "done", phaseId: oldPhaseId }, g.deadline - 1),
    /完成请求已过期/,
  );
  assert.equal(g.players[0].done, false);
  assert.ok(view(g, "p0").actions.some((a) => a.type === "done" && a.phaseId === g.phaseId));
});

test("unaware players cannot infer hidden device existence from dismantle errors", () => {
  const g = game();
  const attempt = () => {
    try {
      act(g, "p0", { type: "dismantle" }, 3);
    } catch (error) {
      return error.message;
    }
  };
  const absent = attempt();
  g.device = { id: "hidden", round: g.round };
  assert.equal(attempt(), absent);
  assert.equal(g.players[0].ap, 7);
});

test("tracker reports the sampled activities in their real order", () => {
  const g = game(), tracker = g.players[0], target = g.players[1];
  tracker.role = "tracker";
  act(g, tracker.id, { type: "skill", targetId: target.id }, 3);
  act(g, target.id, { type: "inspect" }, 4);
  item(target, "ration");
  act(g, target.id, { type: "use", itemId: "ration" }, 5);
  g.rng = () => 0;
  endSearch(g);
  assert.ok(tracker.notes.includes("追踪结果：调查、维修"));
});
