export const ROLES = {
  engineer: ["工程师", 4],
  medic: ["医师", 4],
  investigator: ["调查员", 4],
  tracker: ["追踪员", 4],
  guard: ["护卫", 3],
  searcher: ["搜寻员", 5],
  sheriff: ["执法官", 3],
  gunner: ["枪手", 3],
  bystander: ["路人甲", 6],
};
const ROLE_TRACES = {
  engineer: "房间里留有反复修补的器材痕迹。",
  guard: "房间里留有反复修补的器材痕迹。",
  medic: "桌面上有大量整理过的手写记录。",
  investigator: "桌面上有大量整理过的手写记录。",
  tracker: "桌面上有反复修改的路线草图。",
  searcher: "桌面上有反复修改的路线草图。",
  sheriff: "柜中有保养工具留下的痕迹。",
  gunner: "柜中有保养工具留下的痕迹。",
  bystander: "桌面上有反复修改的路线草图。",
};
const ITEMS = {
  serum: "血清",
  toolkit: "工具包",
  ration: "密封口粮",
  fuelcan: "燃料罐",
  lens: "调查镜",
  armor: "防弹衬板",
  key: "隔离密钥",
  device: "旁路装置",
  club: "棍棒",
  knife: "刀具",
  gun: "枪械",
};
const FACTIONS = { safe: "保全派", seal: "封锁派", infected: "感染阵营" };
const STATIONS = [
  [
    ["hospital", "医院", "parts", "key", 0.2],
    ["signal", "铁路信号站", "fuel", "key", 0.02],
  ],
  [
    ["workshop", "维修厂", "parts", "device", 0.02],
    ["warehouse", "物流仓库", "fuel,food", "device", 0.02],
  ],
  [
    ["research", "研究室", "parts", "", 0.2],
    ["school", "学校", "food", "", 0.02],
  ],
  [
    ["isolation", "隔离中继站", "parts", "device", 0.02],
    ["gas", "加油站", "fuel", "", 0.02],
  ],
];
const LABELS = {
  lobby: "候车室",
  election: "选举车长",
  tie: "平票发言",
  station: "选择站点",
  planning: "选择去向",
  search: "分组搜索",
  therapy: "私密治疗",
  discussion: "会议讨论",
  vote: "处决投票",
  ration: "公开分粮",
  ended: "旅程结束",
};
const TIME = {
  transition: 5000,
  election: 90000,
  tie: 45000,
  station: 120000,
  planning: 120000,
  search: 600000,
  therapy: 90000,
  discussion: 180000,
  vote: 90000,
  ration: 120000,
};
const need = (v, m) => {
  if (!v) throw Error(m);
};
const alive = (g) => g.players.filter((p) => p.alive && !p.left);
const who = (g, id) => {
  const p = g.players.find((p) => p.id === id);
  need(p, "玩家不存在");
  return p;
};
const shuffle = (g, a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(g.rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const MAX_LOG_ENTRIES = 80;
const MAX_PRIVATE_NOTES = 30;
const appendBounded = (items, value, limit) => {
  items.push(value);
  if (items.length > limit) items.splice(0, items.length - limit);
};
const note = (p, s) => appendBounded(p.notes, s, MAX_PRIVATE_NOTES);
const log = (g, s) => appendBounded(g.log, s, MAX_LOG_ENTRIES);
const phase = (g, s, n) => {
  const pause = g.phase !== s && !["lobby", "ended"].includes(s)
    ? g.timing.transition
    : 0;
  g.phase = s;
  g.phaseId++;
  g.transitionUntil = pause ? n + pause : null;
  g.deadline = ["lobby", "ended"].includes(s)
    ? null
    : n + pause + g.timing[s];
  for (const p of g.players) p.done = false;
};
const fresh = (p) => ({
  ...p,
  online: p.online !== false,
  alive: true,
  left: false,
  spectating: false,
  role: null,
  faction: null,
  status: "healthy",
  bag: [],
  pending: [],
  notes: [],
  records: [],
  evidence: [],
  tasks: [],
  ap: 0,
  group: "train",
  groupChoice: null,
  node: 0,
  used: {},
  roundUsed: {},
  counts: { fuel: 0, parts: 0, food: 0 },
  sent: [],
  published: [],
  rooms: [],
  doses: 0,
  hungry: false,
});
export function createGame({
  code,
  hostId,
  players = [],
  now = Date.now(),
  rng = Math.random,
  timing = {},
} = {}) {
  return {
    code,
    hostId,
    players: players.map(fresh),
    phase: "lobby",
    phaseId: 0,
    round: 0,
    captainId: null,
    deadline: null,
    transitionUntil: null,
    resources: { fuel: 0, parts: 0, food: 0, debt: 0 },
    rng,
    timing: { ...TIME, ...timing },
    log: [],
    chat: [],
    warehouse: [],
    deathDrops: [],
    infections: [],
    events: [],
    votes: {},
    sequence: 0,
    emergencies: [],
    sealComplete: false,
  };
}
export function addPlayer(g, p) {
  need(g.phase === "lobby" && g.players.length < 8, "无法加入：已开局或已满");
  need(!g.players.some((x) => x.id === p.id), "玩家已存在");
  g.players.push(fresh(p));
}
function gain(g, p, type, n) {
  const x = { id: "i" + ++g.sequence, type, label: ITEMS[type] };
  if (p.bag.length < 6) p.bag.push(x);
  else p.pending.push({ ...x, expires: n + 10000 });
  return x;
}
function take(p, id) {
  const i = p.bag.findIndex((x) => x.id === id);
  need(i >= 0, "道具不在背包");
  return p.bag.splice(i, 1)[0];
}
function pay(p, n) {
  need(p.ap >= n, "行动点不足");
  p.ap -= n;
}
function record(g, p, category, text, active = true) {
  const x = {
    active,
    id: "e" + ++g.sequence,
    round: g.round,
    owner: p.id,
    category,
    text,
  };
  p.records.push(x);
  g.events.push(x);
}
function die(g, p, cause, killer, n) {
  if (!p.alive) return;
  p.alive = false;
  p.cause = cause;
  p.deathPublic = false;
  note(p, "你已死亡：" + cause);
  if (killer && killer !== p)
    record(g, killer, "行踪", `造成${p.name}死亡（${cause}）`, false);
  const goods = shuffle(g, p.bag.splice(0));
  if (killer?.alive && !killer.left && killer !== p)
    for (const x of goods.splice(0, 3)) {
      if (killer.bag.length < 6) killer.bag.push(x);
      else
        killer.pending.push({
          ...x,
          expires: n + 10000,
          deathSourceId: p.id,
        });
    }
  g.deathDrops.push(...goods, ...p.pending.splice(0));
}
function finish(g, reason, destroy = false) {
  g.warehouse.push(...g.deathDrops.splice(0));
  if (g.resources.debt) {
    if (g.resources.parts < g.resources.debt) destroy = true;
    else {
      g.resources.parts -= g.resources.debt;
      g.resources.debt = 0;
    }
  }
  const inf = alive(g).some((p) => p.status === "infected");
  g.result = {
    reason: destroy ? "全车毁灭，三个阵营全部淘汰" : reason,
    players: g.players.map((p) => ({
      id: p.id,
      name: p.name,
      roleLabel: ROLES[p.role]?.[0],
      factionLabel: FACTIONS[p.faction],
      won:
        !destroy &&
        !p.left &&
        !!(
          p.sealWon ||
          (p.faction === "safe" && p.alive && p.status !== "infected") ||
          (p.faction === "seal" && g.sealComplete) ||
          (p.faction === "infected" && !g.sealComplete && inf)
        ),
    })),
  };
  for (const p of alive(g))
    if (p.status === "latent") {
      p.status = "healthy";
      note(p, "终点免费治疗潜伏感染，不增加针数。");
    }
  phase(g, "ended", 0);
  log(g, g.result.reason);
}
function storeExpired(g, item) {
  const source = item.deathSourceId
    ? g.players.find((p) => p.id === item.deathSourceId)
    : null;
  if (source && !source.deathPublic && g.phase !== "ended")
    g.deathDrops.push(item);
  else g.warehouse.push(item);
}
function checkEnd(g) {
  const a = alive(g);
  if (!a.length) {
    finish(g, "无人存活", true);
    return true;
  }
  if (
    !g.infections.length &&
    !a.some((p) => ["infected", "latent"].includes(p.status))
  ) {
    finish(g, "感染威胁消失，自动抵达");
    return true;
  }
  if (!g.infections.length && a.every((p) => p.status === "infected")) {
    finish(g, "全员转化");
    return true;
  }
  return false;
}
function elect(g, n, next) {
  g.electionNext = next;
  g.candidates = alive(g)
    .filter((p) => p.online)
    .map((p) => p.id);
  g.votes = {};
  phase(g, "election", n);
}
function enter(g, s, n) {
  if (
    ["station", "planning", "discussion", "ration"].includes(s) &&
    !alive(g).some((p) => p.id === g.captainId && p.online)
  ) {
    elect(g, n, s);
    return;
  }
  phase(g, s, n);
  if (s === "station") {
    g.station = null;
    for (const p of alive(g)) p.groupChoice = null;
  }
  if (s === "planning") {
    for (const p of alive(g)) {
      if (p.id === g.captainId) p.groupChoice = "train";
      p.group = p.groupChoice;
      p.done = p.groupChoice !== null;
    }
  }
}
function startRound(g, n) {
  for (const p of alive(g)) p.group = p.id === g.captainId ? "train" : p.groupChoice ?? "train";
  g.round++;
  for (const p of alive(g)) {
    if (p.status === "latent") {
      p.status = "infected";
      p.faction = "infected";
      note(p, "你已转化：职业保留，获得整局一次感染。");
    }
    p.ap = Math.max(0, ROLES[p.role][1] - (p.hungry ? 2 : 0));
    p.node = 0;
    p.deep = false;
    p.medUsed = false;
    p.roundUsed = {};
    p.serummed = false;
    p.protected = false;
    p.solo =
      p.group !== "train" &&
      alive(g).filter((x) => x.group === p.group).length === 1;
    p.medReward =
      g.rng() < (p.group === "train" ? 0.02 : (g.station?.[4] ?? 0.02))
        ? "serum"
        : "ration";
  }
  if (checkEnd(g)) return;
  const r = g.resources;
  if (r.fuel < g.N) {
    finish(g, "燃料不足", true);
    return;
  }
  r.fuel -= g.N;
  if (r.debt && r.parts < g.N + r.debt) {
    finish(g, "零件欠账逾期", true);
    return;
  }
  const due = g.N + r.debt;
  r.debt = Math.max(0, due - r.parts);
  r.parts = Math.max(0, r.parts - due);
  g.sourceTaken = false;
  g.events = [];
  phase(g, "search", n);
  log(g, `第${g.round}轮：${g.station?.[1] ?? "留车调查"}`);
}
function announce(g) {
  for (const p of g.players)
    if (!p.alive && !p.deathPublic) {
      const publicCause = p.left
        ? "离场"
        : p.cause === "执法反噬"
          ? "武器伤"
          : p.cause;
      log(g, `${p.name}：${publicCause}`);
      p.deathPublic = true;
    }
  g.warehouse.push(...g.deathDrops.splice(0));
}
function closeVote(g, n) {
  const c = {};
  for (const [voterId, targetId] of Object.entries(g.votes)) {
    const voter = who(g, voterId);
    const target = targetId ? who(g, targetId) : null;
    if (target && voter.alive && !voter.left && target.alive && !target.left)
      c[targetId] = (c[targetId] ?? 0) + 1;
  }
  log(
    g,
    "匿名票数：" +
      Object.entries(c)
        .map(([id, k]) => who(g, id).name + " " + k + "票")
        .join("，"),
  );
  if (g.phase === "election") {
    const m = Math.max(0, ...Object.values(c));
    const top = m ? g.candidates.filter((id) => c[id] === m) : g.candidates;
    if (top.length === 1) {
      g.captainId = top[0];
      if (["station", "planning"].includes(g.electionNext))
        who(g, top[0]).group = "train";
      log(g, who(g, top[0]).name + "当选车长");
      enter(g, g.electionNext, n);
    } else {
      g.candidates = top;
      phase(g, "tie", n);
      g.deadline = (g.transitionUntil ?? n) + g.timing.tie * Math.max(1, top.length);
    }
  } else {
    const eligible = alive(g).filter((p) => !p.left).length;
    const id = Object.keys(c).find((id) => c[id] > eligible / 2);
    if (id) {
      die(g, who(g, id), "会议处决", null, n);
      announce(g);
    }
    if (!checkEnd(g)) {
      for (const p of alive(g)) {
        p.ration = 0;
        p.hungry = true;
      }
      enter(g, "ration", n);
    }
  }
}
function closeSearch(g, n) {
  for (const p of g.players) {
    const expires = p.pending.filter((item) => Number.isFinite(item.expires));
    for (const item of expires) storeExpired(g, item);
    p.pending = p.pending.filter((item) => !Number.isFinite(item.expires));
  }
  for (const p of alive(g))
    if (p.solo && g.rng() < 0.8) {
      const w = bestWeapon(p);
      if (w) {
        take(p, w.id);
        record(g, p, "物品", `外部遇袭损坏${w.label}`, false);
      }
      note(p, "遭到外部感染者袭击" + (w ? "，损坏" + w.label : "，没有武器"));
      if (g.rng() < ({ gun: 0.2, knife: 0.4, club: 0.6 }[w?.type] ?? 0.9))
        g.infections.push({ target: p.id, actor: null });
    }
  for (const p of alive(g)) {
    let hits = g.infections.filter((x) => x.target === p.id);
    if (p.status !== "infected") {
      if (p.role === "bystander" && !p.used.immunity)
        hits = hits.filter(() => {
          if (!p.used.immunity && g.rng() < 0.25) {
            p.used.immunity = true;
            note(p, "本轮免疫了一次感染");
            return false;
          }
          return true;
        });
      if (hits.length >= 2)
        die(
          g,
          p,
          "异常感染反应",
          g.players.find((x) => x.id === hits.at(-1).actor),
          n,
        );
      else if (hits.length === 1 && !p.serummed) p.status = "latent";
    }
    if (p.alive)
      note(
        p,
        p.status === "latent"
          ? "你进入潜伏期，可使用血清自救"
          : p.serummed
            ? "本轮未进入潜伏"
            : "身体状态：" + (p.status === "infected" ? "感染者" : "健康"),
      );
    if (p.track) {
      const hits = g.events.filter(
        (e) =>
          e.owner === p.track.target &&
          e.active !== false &&
          Number(e.id.slice(1)) > p.track.after,
      );
      note(
        p,
        "追踪结果：" +
          (shuffle(g, hits)
            .slice(0, 2)
            .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
            .map((e) => e.category)
            .join("、") || "无记录"),
      );
      p.track = null;
    }
  }
  g.infections = [];
  if (
    g.activation &&
    g.device?.id === g.activation &&
    g.device.round < g.round &&
    g.station?.[0] === "isolation"
  ) {
    g.sealComplete = true;
    for (const p of g.players)
      if (p.faction === "seal" && !p.left) {
        p.sealWon = true;
        note(p, "封锁完成，胜利已锁定");
      }
  }
  g.activation = null;
  phase(g, "therapy", n);
}
function bestWeapon(p) {
  return (
    p.bag.find((x) => x.type === "gun") ??
    p.bag.find((x) => x.type === "knife") ??
    p.bag.find((x) => x.type === "club")
  );
}
function blocked(p) {
  if (p.protected) return true;
  const armor = p.bag.find((x) => x.type === "armor");
  if (armor) {
    take(p, armor.id);
    return true;
  }
  return false;
}
function defend(g, p, itemId, n) {
  const e = g.emergencies.find((x) => x.target === p.id);
  need(e, "没有待防守袭击");
  const w = itemId
    ? p.bag.find(
        (x) => x.id === itemId && ["club", "knife", "gun"].includes(x.type),
      )
    : bestWeapon(p);
  need(!itemId || w, "防守武器无效");
  if (w) take(p, w.id);
  const attacker = who(g, e.actor);
  const escaped = w && g.rng() < { club: 0.1, knife: 0.2, gun: 0.3 }[w.type];
  note(p, `${attacker.name}的袭击：${escaped ? "逃脱成功" : "逃脱失败"}`);
  note(
    attacker,
    `${p.name}${w ? "使用" + w.label : "未持武器"}，${escaped ? "逃脱了" : "未能逃脱"}`,
  );
  if (w) record(g, p, "武器操作", "防守使用" + w.label);
  g.emergencies = g.emergencies.filter((x) => x !== e);
  p.busy = false;
  attacker.busy = false;
  if (!escaped) die(g, p, "武器伤", attacker, n);
}
export function tick(g, n = Date.now()) {
  if (["lobby", "ended"].includes(g.phase)) return;
  for (const p of g.players) {
    for (const item of p.pending.filter((x) => x.expires <= n))
      storeExpired(g, item);
    p.pending = p.pending.filter((x) => x.expires > n);
  }
  for (const e of [...g.emergencies])
    if (e.deadline <= n) defend(g, who(g, e.target), null, n);
  if (!alive(g).length) {
    finish(g, "无人存活", true);
    return;
  }
  if (g.transitionUntil) {
    if (n < g.transitionUntil) return;
    g.transitionUntil = null;
  }
  if (g.phase === "election" || g.phase === "tie") {
    const online = alive(g)
      .filter((p) => p.online)
      .map((p) => p.id);
    const remaining = g.candidates.filter((id) => online.includes(id));
    if (!remaining.length || remaining.length !== g.candidates.length) {
      g.candidates = remaining.length ? remaining : online;
      g.votes = {};
      if (!g.candidates.length) {
        g.deadline = null;
        return;
      }
      phase(g, "election", n);
    }
  }
  if (
    ["station", "planning", "discussion", "ration"].includes(g.phase) &&
    !alive(g).some((p) => p.id === g.captainId && p.online)
  ) {
    elect(g, n, g.phase);
    return;
  }
  if (
    ["tie", "planning", "search", "therapy", "discussion"].includes(g.phase) &&
    !g.emergencies.length &&
    alive(g).every((p) => p.done)
  )
    g.deadline = n;
  if (n < g.deadline) return;
  switch (g.phase) {
    case "vote":
    case "election":
      closeVote(g, n);
      break;
    case "tie":
      g.votes = {};
      phase(g, "election", n);
      break;
    case "station":
      g.station = null;
      startRound(g, n);
      break;
    case "planning":
      startRound(g, n);
      break;
    case "search":
      if (!g.emergencies.length) closeSearch(g, n);
      break;
    case "therapy":
      if (!checkEnd(g)) {
        announce(g);
        enter(g, "discussion", n);
      }
      break;
    case "discussion":
      g.votes = {};
      phase(g, "vote", n);
      break;
    case "ration":
      if (g.round === 4) finish(g, "列车抵达终点");
      else enter(g, "station", n);
      break;
  }
}
function searchOptions(g, p) {
  const a = [{ value: "skip", label: "离开（0点）", cost: 0 }];
  if (p.node >= 5) return [];
  const add = (value, label, cost, type, amount) =>
    a.push({ value, label: label + `（${cost}点）`, cost, item: type, amount });
  if (p.group === "train") {
    if (p.node === 0) add("parts", "取得2零件", 1, "parts", 2);
    if (p.node === 1) {
      add("room", "调查房间", 1);
      add("deepRoom", "深入调查房间", 2);
    }
    if (p.node === 2) add("food", "取得2食物", 1, "food", 2);
    if (p.node === 3 && !p.roundUsed.inspectControl)
      add("inspect", "检查控制柜", 1);
    if (p.node === 4 && p.deep) add("medicine", "搜索药品", 1, p.medReward);
  } else {
    if (p.node === 0)
      for (const t of ["fuel", "parts"]) {
        add(t, "取得2" + (t === "fuel" ? "燃料" : "零件"), 1, t, 2);
        if (g.station?.[2].includes(t))
          add(
            "deep" + t,
            "深入取得4" + (t === "fuel" ? "燃料" : "零件"),
            2,
            t,
            4,
          );
      }
    if (p.node === 1) {
      add("food", "取得2食物", 1, "food", 2);
      if (g.station?.[2].includes("food"))
        add("deepfood", "深入取得4食物", 2, "food", 4);
    }
    if (p.node === 2 || (p.node === 4 && p.deep && !p.medUsed))
      add("medicine", "搜索药品", 1, p.medReward);
    if (p.node === 3) {
      if (g.station?.[3] && !g.sourceTaken)
        add("keyitem", "取得" + ITEMS[g.station[3]], 2, g.station[3]);
      if (p.deep) add("toolkit", "取得工具包", 2, "toolkit");
    }
  }
  return a;
}
function validateInvestigation(p, a) {
  need(
    !a.category || ["物品", "用药", "行踪"].includes(a.category),
    "调查类别无效",
  );
  need(
    !a.lensId || p.bag.some((x) => x.id === a.lensId && x.type === "lens"),
    "调查镜不在背包",
  );
}
function investigate(g, p, target, deep, a = {}, now = Date.now()) {
  for (const item of target.bag) {
    if (
      !target.records.some((r) => r.bagItem === item.id && r.round === g.round)
    ) {
      target.records.push({
        id: "e" + ++g.sequence,
        owner: target.id,
        round: g.round,
        category: "物品",
        active: false,
        bagItem: item.id,
        text: `第${g.round}轮观察时背包持有${item.label}`,
        observedAt: now,
      });
    }
  }
  const categories = {
    物品: ["物品", "维修", "武器操作"],
    用药: ["用药"],
    行踪: ["行踪", "调查", "搜索", "接触操作", "设备操作"],
  };
  const unseen = target.records.filter(
    (r) =>
      !p.evidence.some((e) => e.id === r.id) &&
      r.category !== "任务" &&
      (deep || categories[a.category || "物品"].includes(r.category)),
  );
  let count = deep ? 2 : 1;
  if (deep && p.role === "investigator" && !p.roundUsed.investigate) {
    count++;
    p.roundUsed.investigate = true;
  }
  if (a.lensId) {
    take(p, a.lensId);
    count++;
    record(g, p, "物品", "搜房消耗调查镜", false);
  }
  const chosen = unseen.slice(-count);
  if (!chosen.length) note(p, "未发现该房间尚未取得的真实记录");
  else {
    p.evidence.push(
      ...chosen.map((r) => ({
        ...r,
        observedRound: g.round,
        observedAt: r.observedAt ?? now,
        text: `第${r.round}轮记录；第${g.round}轮取得副本：${r.text}`,
      })),
    );
    note(p, "已获得" + chosen.length + "条真实记录");
  }
  if (!p.rooms.includes(target.id)) p.rooms.push(target.id);
  record(g, p, "调查", "调查了" + target.name + "的房间");
}
function quests(g, p, n) {
  const data = {
    fuel: [p.counts.fuel, 6, "toolkit"],
    food: [p.counts.food, 6, "fuelcan"],
    parts: [p.counts.parts, 6, "ration"],
    evidence: [p.published.length, 2, "lens"],
    rooms: [p.rooms.length, 2, "toolkit"],
    give: [p.sent.length, 2, "armor"],
  };
  for (const t of p.tasks) {
    const [progress, goal, reward] = data[t.id];
    t.progress = progress;
    t.goal = goal;
    if (!t.complete && progress >= goal) {
      t.complete = true;
      p.pending.push({
        ...{ id: "i" + ++g.sequence, type: reward, label: ITEMS[reward] },
        expires: Infinity,
      });
      note(p, "私人任务完成，奖励在待领取栏");
    }
  }
}
const meeting = (g) =>
  ["election", "tie", "station", "planning", "discussion", "vote", "ration"].includes(
    g.phase,
  );
function active(g, p) {
  need(g.phase === "search", "只能在搜索阶段操作");
  need(!p.done && !p.busy, "已完成或处于紧急事件");
}
function target(g, p, id, self = false) {
  const t = who(g, id);
  need(t.alive && !t.left && !t.busy, "目标无法接受操作");
  need(self || t !== p, "不能指定自己");
  need(g.phase !== "search" || t.group === p.group, "必须同组");
  return t;
}
function infectionTarget(g, p, id) {
  const t = who(g, id);
  need(t !== p, "不能指定自己");
  need(g.phase !== "search" || t.group === p.group, "必须同组");
  return t;
}
function skillTarget(g, p, id, self = false) {
  const t = who(g, id);
  need(self || t !== p, "不能指定自己");
  need(g.phase !== "search" || t.group === p.group, "必须同组");
  return t;
}
export function act(g, id, a, n = Date.now()) {
  need(a && typeof a.type === "string", "动作无效");
  const p = who(g, id);
  need(!p.left, "你已离场");
  if (a.type === "leave") {
    if (g.phase === "lobby") {
      g.players = g.players.filter((x) => x !== p);
      if (g.hostId === id)
        g.hostId = g.players.find((x) => x.online)?.id ?? g.players[0]?.id;
      return;
    }
    p.left = true;
    if (g.phase !== "ended") die(g, p, "主动离场", null, n);
    return;
  }
  need(g.phase !== "ended", "对局已结束");
  need(p.alive, "死者无法操作");
  need(!g.transitionUntil || n >= g.transitionUntil, "新阶段准备中");
  if (a.type === "start") {
    need(g.phase === "lobby" && id === g.hostId, "只有房主可以开局");
    need(g.players.length >= 6 && g.players.length <= 8, "需要6–8人");
    g.N = g.players.length;
    g.resources = { fuel: g.N * 2, parts: g.N * 2, food: g.N * 2, debt: 0 };
    const roles = shuffle(g, Object.keys(ROLES));
    const factions = shuffle(g, [
      ...Array(g.N === 6 ? 4 : g.N - 3).fill("safe"),
      ...Array(g.N === 6 ? 1 : 2).fill("seal"),
      "infected",
    ]);
    g.players.forEach((x, i) => {
      x.role = roles[i];
      x.faction = factions[i];
      x.sealAbility = x.faction === "seal";
      x.mother = x.faction === "infected";
      x.status = x.mother ? "infected" : "healthy";
      x.tasks = shuffle(g, [
        "fuel",
        "food",
        "parts",
        "evidence",
        "rooms",
        "give",
      ])
        .slice(0, 3)
        .map((id) => ({
          id,
          label: {
            fuel: "收集6燃料",
            food: "收集6食物",
            parts: "收集6零件",
            evidence: "公开2条证据",
            rooms: "调查2个不同房间",
            give: "赠送2件不同物品",
          }[id],
          progress: 0,
          complete: false,
        }));
      record(g, x, "痕迹", ROLE_TRACES[x.role], false);
    });
    elect(g, n, "station");
    return;
  }
  if (a.type === "chat") {
    need(meeting(g) || g.phase === "search", "当前阶段不能发言");
    need(
      typeof a.text === "string" &&
        a.text.trim().length > 0 &&
        a.text.length <= 500,
      "消息长度应为1–500字",
    );
    g.chat.push({
      id: "c" + ++g.sequence,
      playerId: id,
      name: p.name,
      text: a.text.trim(),
      group: g.phase === "search" ? p.group : "all",
      round: g.round,
      phase: g.phase,
    });
    if (g.chat.length > 200) g.chat.shift();
    return;
  }
  if (a.type === "vote") {
    need(["election", "vote"].includes(g.phase), "当前不能投票");
    need(!Object.hasOwn(g.votes, id), "已经投票");
    const v = a.targetId || "";
    need(
      !v ||
        (g.phase === "election"
          ? g.candidates.includes(v)
          : alive(g).some((x) => x.id === v)),
      "候选人无效",
    );
    g.votes[id] = v;
    if (alive(g).every((x) => Object.hasOwn(g.votes, x.id))) closeVote(g, n);
    return;
  }
  if (a.type === "chooseGroup") {
    need(g.phase === "planning", "当前不能选择去向");
    need(a.phaseId === g.phaseId, "此阶段的去向请求已过期");
    need(id !== g.captainId, "车长必须留车");
    need(!p.done && ["train", "away"].includes(a.group), "去向无效或已经选择");
    p.groupChoice = a.group;
    p.group = a.group;
    p.done = true;
    if (alive(g).every((x) => x.done)) startRound(g, n);
    return;
  }
  if (a.type === "chooseStation") {
    need(g.phase === "station" && id === g.captainId, "只有车长可选择站点");
    need(a.phaseId === g.phaseId, "此阶段的选站请求已过期");
    const s = STATIONS[g.round].find((s) => s[0] === a.station);
    need(s, "站点无效");
    g.station = s;
    enter(g, "planning", n);
    return;
  }
  if (a.type === "allocate") {
    need(g.phase === "ration" && id === g.captainId, "只有车长可分粮");
    const t = who(g, a.targetId);
    need(t.alive && !t.left, "目标已离场");
    const amount = Number(a.amount),
      old = t.ration ?? 0,
      max = t.group === "train" ? 1 : 2;
    need(
      Number.isInteger(amount) && amount >= 0 && amount <= max,
      "口粮数量无效",
    );
    need(g.resources.food + old >= amount, "食物不足");
    g.resources.food += old - amount;
    t.ration = amount;
    t.hungry = amount < max;
    log(g, `${t.name}获配口粮${amount}/${max}`);
    return;
  }
  if (a.type === "next") {
    need(id === g.captainId && g.phase === "ration", "当前不能结束分粮");
    if (g.round === 4) finish(g, "列车抵达终点");
    else enter(g, "station", n);
    return;
  }
  if (a.type === "done") {
    need(["tie", "search", "therapy", "discussion"].includes(g.phase), "当前不能完成");
    need(a.phaseId === g.phaseId, "此阶段的完成请求已过期");
    need(!p.done, "本阶段已经完成");
    need(!p.busy, "紧急事件尚未结束");
    p.done = true;
    if (alive(g).every((x) => x.done) && !g.emergencies.length) {
      g.deadline = n;
      tick(g, n);
    }
    return;
  }
  if (a.type === "defend") {
    defend(g, p, a.itemId, n);
    return;
  }
  need(!p.busy, "紧急事件中不能操作");
  if (a.type === "publish") {
    need(g.phase === "search" || meeting(g), "当前不能公开证据");
    const e = p.evidence.find((x) => x.id === a.evidenceId);
    need(e, "没有这条证据");
    need(!p.published.includes(e.id), "已公开");
    p.published.push(e.id);
    log(g, `证据原件·第${e.round}轮：${who(g, e.owner).name}，${e.text}`);
    if (e.deviceId && e.deviceId === g.device?.id) g.devicePublic = true;
    quests(g, p, n);
    return;
  }
  if (a.type === "claim") {
    const i = p.pending.findIndex((x) => x.id === a.itemId);
    need(i >= 0, "奖励不存在");
    need(p.pending[i].expires > n, "整理时间已结束");
    if (a.replaceId) {
      need(
        Number.isFinite(p.pending[i].expires),
        "私人任务奖励需先腾出背包再领取",
      );
      need(
        p.bag.some((x) => x.id === a.replaceId),
        "替换物品不在背包",
      );
    }
    need(p.bag.length < 6 || a.replaceId, "背包已满，请选择替换物品");
    if (a.replaceId) g.warehouse.push(take(p, a.replaceId));
    p.bag.push(p.pending.splice(i, 1)[0]);
    return;
  }
  if (a.type === "deposit" || a.type === "withdraw") {
    need(meeting(g) || g.phase === "therapy", "搜索中不能使用仓库");
    if (a.type === "deposit") g.warehouse.push(take(p, a.itemId));
    else {
      need(p.bag.length < 6, "背包已满");
      const i = g.warehouse.findIndex((x) => x.id === a.itemId);
      need(i >= 0, "道具已被取走");
      p.bag.push(g.warehouse.splice(i, 1)[0]);
    }
    log(
      g,
      p.name + (a.type === "deposit" ? "存入" : "领取") + "了一件仓库物品",
    );
    return;
  }
  if (a.type === "give") {
    need(
      g.phase === "search" || meeting(g) || g.phase === "therapy",
      "当前不能赠送",
    );
    if (g.phase === "search") active(g, p);
    const x = p.bag.find((item) => item.id === a.itemId);
    need(x, "道具不在背包");
    const t = target(g, p, a.targetId);
    need(t.bag.length < 6, "对方背包已满");
    take(p, x.id);
    t.bag.push(x);
    if (!p.sent.includes(x.id)) p.sent.push(x.id);
    note(t, p.name + "交给你" + x.label);
    quests(g, p, n);
    return;
  }
  if (a.type === "inject") {
    need(["search", "therapy"].includes(g.phase), "当前不能注射");
    if (g.phase === "search") active(g, p);
    const x = p.bag.find((x) => x.id === a.itemId && x.type === "serum");
    need(x, "需要血清");
    const cost = g.phase === "search" ? 1 : 0;
    need(p.ap >= cost, "行动点不足");
    const t = target(g, p, a.targetId, true);
    pay(p, cost);
    take(p, x.id);
    t.doses++;
    t.serummed = true;
    record(g, p, "接触操作", "给" + t.name + "注射血清");
    record(g, t, "用药", "累计第" + t.doses + "针血清", false);
    note(p, "已注射血清");
    note(t, "接受血清，目前累计" + t.doses + "针");
    if (t.doses >= 3) die(g, t, "血清过量", p, n);
    else if (t.status === "latent") t.status = "healthy";
    return;
  }
  active(g, p);
  if (a.type === "search") {
    need(a.round === g.round && a.step === p.node, "此情景已处理，请刷新操作");
    if (a.choice === "inspect")
      need(!p.roundUsed.inspectControl, "本轮已经检查过控制柜");
    const option = searchOptions(g, p).find((x) => x.value === a.choice);
    need(option, "搜索选项不存在");
    let t;
    if (["room", "deepRoom"].includes(a.choice)) {
      t = who(g, a.targetId);
      need(t, "请选择房间");
      validateInvestigation(p, a);
    }
    pay(p, option.cost);
    p.node++;
    if (a.choice.startsWith("deep")) p.deep = true;
    if (a.choice === "keyitem") g.sourceTaken = true;
    if (a.choice === "medicine") p.medUsed = true;
    if (t) investigate(g, p, t, a.choice === "deepRoom", a, n);
    else if (a.choice === "inspect") inspect(g, p);
    else if (option.item) {
      if (option.amount) {
        let count = option.amount;
        if (
          option.item === "parts" &&
          p.role === "engineer" &&
          !p.roundUsed.engineer
        ) {
          count++;
          p.roundUsed.engineer = true;
        }
        g.resources[option.item] += count;
        p.counts[option.item] += count;
      } else gain(g, p, option.item, n);
      record(g, p, "搜索", "完成物资搜索");
      if (a.choice !== "keyitem" && g.rng() < 0.1) {
        const r = g.rng();
        gain(g, p, r < 0.6 ? "club" : r < 0.9 ? "knife" : "gun", n);
      }
    }
    quests(g, p, n);
    return;
  }
  if (a.type === "infect") {
    need(p.status === "infected", "只有感染者可感染");
    need(p.mother ? !p.roundUsed.infect : !p.used.infect, "感染次数用尽");
    need(p.ap >= 1, "行动点不足");
    const t = infectionTarget(g, p, a.targetId);
    pay(p, 1);
    if (p.mother) p.roundUsed.infect = true;
    else p.used.infect = true;
    g.infections.push({ actor: id, target: t.id });
    record(g, p, "接触操作", "完成一次接触操作");
    note(p, "感染操作已提交");
    return;
  }
  if (a.type === "use") {
    const x = p.bag.find((x) => x.id === a.itemId);
    need(
      x && ["toolkit", "ration", "fuelcan"].includes(x.type),
      "物品不能兑换",
    );
    pay(p, 1);
    take(p, x.id);
    g.resources[
      { toolkit: "parts", ration: "food", fuelcan: "fuel" }[x.type]
    ] += 2;
    record(g, p, "维修", "使用" + x.label);
    return;
  }
  if (a.type === "attack") {
    const w = p.bag.find(
      (x) => x.id === a.itemId && ["club", "knife", "gun"].includes(x.type),
    );
    need(w, "需要背包武器");
    need(g.deadline - n > 10000, "最后10秒不能发起武器袭击");
    need(p.ap >= 2, "行动点不足");
    const t = target(g, p, a.targetId);
    pay(p, 2);
    take(p, w.id);
    record(g, p, "武器操作", "使用" + w.label + "袭击" + t.name);
    note(p, `你使用${w.label}袭击${t.name}。`);
    note(t, `${p.name}使用${w.label}袭击了你。`);
    if (blocked(t)) {
      note(p, "袭击被保护挡下");
      note(t, "保护挡下了一次袭击");
      return;
    }
    if (!bestWeapon(t)) {
      die(g, t, "武器伤", p, n);
      return;
    }
    p.busy = true;
    t.busy = true;
    g.emergencies.push({ actor: id, target: t.id, deadline: n + 10000 });
    return;
  }
  if (a.type === "inspect") {
    need(p.group === "train", "只能留车检查");
    need(!p.roundUsed.inspectControl, "本轮已经检查过控制柜");
    pay(p, 1);
    inspect(g, p);
    return;
  }
  if (a.type === "install") {
    need(p.sealAbility && p.group === "train", "需要封锁操作能力且留车");
    need(!g.device && !g.sealComplete, "控制柜无法安装");
    const x = p.bag.find((x) => x.type === "device");
    need(x, "需要旁路装置");
    pay(p, 2);
    take(p, x.id);
    g.device = { id: x.id, round: g.round };
    g.devicePublic = false;
    record(g, p, "设备操作", "安装旁路装置");
    return;
  }
  if (a.type === "activate") {
    need(p.sealAbility && p.group === "train", "需要封锁操作能力且留车");
    need(!g.activation, "本轮已经提交隔离协议");
    need(
      g.device &&
        g.device.round < g.round &&
        g.station?.[0] === "isolation" &&
        !g.sealComplete,
      "装置未成熟或本站无法连接",
    );
    need(
      p.bag.some((x) => x.type === "key"),
      "需要隔离密钥",
    );
    pay(p, 2);
    g.activation = g.device.id;
    record(g, p, "设备操作", "提交协议请求");
    return;
  }
  if (a.type === "dismantle") {
    need(
      p.group === "train" &&
        g.device &&
        !g.sealComplete &&
        (p.knowsDevice === g.device.id || g.devicePublic),
      "须先发现可拆除装置",
    );
    const x = p.bag.find((x) => x.type === "toolkit");
    need(x && g.resources.parts >= 3, "需要工具包与3公共零件");
    pay(p, 2);
    take(p, x.id);
    g.resources.parts -= 3;
    g.device = null;
    g.devicePublic = false;
    record(g, p, "设备操作", "拆除并销毁装置");
    return;
  }
  if (a.type === "skill") {
    need(
      !p.roundUsed.skill &&
        !(["guard", "sheriff", "gunner"].includes(p.role) && p.used.skill),
      "技能次数用尽",
    );
    if (p.role === "searcher") {
      const o = searchOptions(g, p).find((x) => x.value === a.choice);
      need(o && o.cost, "请选择付费搜索选项");
      p.roundUsed.skill = true;
      note(
        p,
        "预览：" +
          (o.item ? (ITEMS[o.item] ?? o.item) : o.label) +
          (o.amount ? " " + o.amount : ""),
      );
      return;
    }
    need(
      [
        "medic",
        "tracker",
        "guard",
        "sheriff",
        "gunner",
        "investigator",
      ].includes(p.role),
      "职业没有主动技能",
    );
    if (p.role === "investigator") {
      need(p.group === "train", "只能留车调查");
      validateInvestigation(p, a);
      need(p.ap >= 2, "行动点不足");
    } else {
      need(
        p.ap >=
          ({ medic: 1, tracker: 1, guard: 2, sheriff: 2, gunner: 3 }[
            p.role
          ] ?? 0),
        "行动点不足",
      );
    }
    const t = p.role === "investigator"
      ? who(g, a.targetId)
      : skillTarget(g, p, a.targetId, ["medic", "guard"].includes(p.role));
    if (p.role === "investigator") {
      pay(p, 2);
      investigate(g, p, t, true, a, n);
    } else if (p.role === "medic") {
      pay(p, 1);
      note(p, t.name + "累计血清针数：" + t.doses);
    } else if (p.role === "tracker") {
      pay(p, 1);
      p.track = { target: t.id, after: g.sequence };
    } else if (p.role === "guard") {
      pay(p, 2);
      t.protected = true;
    } else {
      pay(p, p.role === "gunner" ? 3 : 2);
      if (t.alive && !t.busy && !blocked(t)) {
        const backlash = p.role === "sheriff" && t.status !== "infected";
        if (backlash) die(g, p, "执法反噬", null, n);
        die(g, t, "武器伤", p, n);
      }
    }
    p.roundUsed.skill = true;
    if (["guard", "sheriff", "gunner"].includes(p.role)) p.used.skill = true;
    if (p.role !== "investigator")
      record(
        g,
        p,
        ["sheriff", "gunner"].includes(p.role)
          ? "武器操作"
          : ["medic", "guard"].includes(p.role)
            ? "接触操作"
            : p.role === "tracker"
              ? "调查"
              : "调查",
        "使用职业能力",
      );
    quests(g, p, n);
    return;
  }
  throw Error("未知动作");
}
function inspect(g, p) {
  p.roundUsed.inspectControl = true;
  p.knowsDevice = g.device?.id;
  const e = {
    id: "e" + ++g.sequence,
    owner: p.id,
    round: g.round,
    category: "设备",
    text: g.sealComplete
      ? "协议已发送"
      : g.device
        ? "控制柜安装有旁路装置"
        : "控制柜未发现装置",
    deviceId: g.device?.id ?? null,
  };
  p.evidence.push(e);
  note(p, e.text);
  record(g, p, "调查", "检查控制柜");
}
export function view(g, id) {
  const p = who(g, id),
    spectator = !p.alive && p.spectating;
  const options = (xs) =>
    xs.map((x) => ({ value: x.id, label: x.name ?? x.label }));
  const field = (name, label, opts) => ({
    name,
    label,
    kind: "select",
    options: opts,
  });
  const actions = [];
  const add = (type, label, fields = []) =>
    actions.push({ type, label, fields });
  const visibleAlive = (t) =>
    t.alive ||
    (t.id !== id &&
      !spectator &&
      g.phase !== "ended" &&
      !t.deathPublic);
  const people = options(g.players.filter(visibleAlive));
  const local = options(
    g.players.filter((t) => visibleAlive(t) && t.group === p.group),
  );
  const others = local.filter((t) => t.value !== id);
  const bag = (types) =>
    options(p.bag.filter((x) => !types || types.includes(x.type)));
  const targetField = (self = false) =>
    field(
      "targetId",
      "目标",
      g.phase === "search"
        ? self
          ? local
          : others
        : people.filter((t) => self || t.value !== id),
    );
  const itemField = (types) => field("itemId", "道具", bag(types));
  const investigationFields = () => [
    field(
      "category",
      "普通搜房类别（深入搜房查全部非任务记录）",
      ["物品", "用药", "行踪"].map((x) => ({ value: x, label: x })),
    ),
    field("lensId", "调查镜：消耗一件多查一条，不加行动点", [
      { value: "", label: "不使用" },
      ...bag(["lens"]),
    ]),
  ];
  if (p.alive && !p.left && g.phase !== "ended" && !g.transitionUntil) {
    if (meeting(g) || g.phase === "search")
      add("chat", "发送文字消息", [
        {
          name: "text",
          label: g.phase === "search" ? "同组消息" : "会议消息",
          kind: "text",
        },
      ]);
    if (g.phase === "lobby" && id === g.hostId)
      add("start", "发车：开始6–8人对局");
    if (["election", "vote"].includes(g.phase) && !Object.hasOwn(g.votes, id))
      add(
        "vote",
        g.phase === "election"
          ? "投票选车长"
          : "处决投票（须超过存活人数一半）",
        [
          field("targetId", "候选人", [
            { value: "", label: "弃票" },
            ...people.filter(
              (x) => g.phase !== "election" || g.candidates.includes(x.value),
            ),
          ]),
        ],
      );
    if (g.phase === "station" && id === g.captainId) {
      add("chooseStation", "选择下一站", [
        field(
          "station",
          "站点",
          STATIONS[g.round].map((s) => ({ value: s[0], label: s[1] })),
        ),
      ]);
      actions.at(-1).phaseId = g.phaseId;
    }
    if (g.phase === "planning" && !p.done) {
      add("chooseGroup", "选择留车或下车", [
        field("group", "去向", [
          { value: "train", label: "留在列车" },
          { value: "away", label: "下车搜索" },
        ]),
      ]);
      actions.at(-1).phaseId = g.phaseId;
    }
    if (g.phase === "ration" && id === g.captainId) {
      add("allocate", "公开分配口粮", [
        field("targetId", "乘客", people),
        {
          name: "amount",
          label: "总份数（留车1份，外出2份）",
          kind: "number",
          min: 0,
          max: 2,
        },
      ]);
      add(
        "next",
        g.round === 4 ? "结束分粮，抵达终点" : "结束分粮，安排下一站",
      );
    }
    if (
      ["tie", "search", "therapy", "discussion"].includes(g.phase) &&
      !p.done &&
      !p.busy
    ) {
      add(
        "done",
        g.phase === "tie"
          ? "完成平票发言，等待其他人"
          : "完成本阶段（仍可能受到攻击）",
      );
      actions.at(-1).phaseId = g.phaseId;
    }
    const emergency = g.emergencies.find((e) => e.target === id);
    if (emergency)
      add("defend", "选择防守武器：棍10% / 刀20% / 枪30%逃脱", [
        itemField(["club", "knife", "gun"]),
      ]);
    if (!p.busy) {
      if (
        p.pending.length &&
        (p.bag.length < 6 || p.pending.some((x) => Number.isFinite(x.expires)))
      )
        add("claim", "领取待整理奖励", [
          field(
            "itemId",
            "奖励",
            options(
              p.pending.filter(
                (x) => p.bag.length < 6 || Number.isFinite(x.expires),
              ),
            ),
          ),
          field("replaceId", "替换背包物品并送仓库（任务奖励须先腾空）", [
            { value: "", label: "不替换" },
            ...bag(),
          ]),
        ]);
      if (meeting(g) || g.phase === "therapy") {
        if (p.bag.length) add("deposit", "存入公共仓库", [itemField()]);
        if (g.warehouse.length && p.bag.length < 6)
          add("withdraw", "领取仓库物品", [
            field("itemId", "物品", options(g.warehouse)),
          ]);
      }
      if (
        p.bag.length &&
        (meeting(g) ||
          g.phase === "therapy" ||
          (g.phase === "search" && !p.done))
      )
        add("give", "赠送道具（0点）", [targetField(), itemField()]);
      if (p.evidence.length && (meeting(g) || g.phase === "search"))
        add("publish", "公开完整证据", [
          field(
            "evidenceId",
            "证据",
            p.evidence
              .filter((e) => !p.published.includes(e.id))
              .map((e) => ({ value: e.id, label: e.text })),
          ),
        ]);
      if (
        ["search", "therapy"].includes(g.phase) &&
        !(g.phase === "search" && p.done) &&
        bag(["serum"]).length
      )
        add(
          "inject",
          g.phase === "search"
            ? "注射血清（1点，第三针致死）"
            : "注射血清（0点，第三针致死）",
          [targetField(true), itemField(["serum"])],
        );
    }
    if (g.phase === "search" && !p.done && !p.busy) {
      const opts = searchOptions(g, p);
      if (opts.length) {
        add("search", `情景 ${p.node + 1}/5：选择搜索行动`, [
          field(
            "choice",
            "行动",
            opts.map((x) => ({ value: x.value, label: x.label })),
          ),
          ...(p.group === "train" && p.node === 1
            ? [
                field("targetId", "调查谁的房间", options(g.players)),
                ...investigationFields(),
              ]
            : []),
        ]);
        Object.assign(actions.at(-1), { round: g.round, step: p.node });
      }
      if (
        p.status === "infected" &&
        (p.mother ? !p.roundUsed.infect : !p.used.infect)
      )
        add("infect", "秘密感染（1点；同组，不反馈目标身份）", [targetField()]);
      if (bag(["toolkit", "ration", "fuelcan"]).length)
        add("use", "使用补给道具（1点，换2公共资源）", [
          itemField(["toolkit", "ration", "fuelcan"]),
        ]);
      if (bag(["club", "knife", "gun"]).length)
        add("attack", "袭击（2点+武器，武器必损坏）", [
          targetField(),
          itemField(["club", "knife", "gun"]),
        ]);
      if (p.group === "train") {
        if (!p.roundUsed.inspectControl)
          add("inspect", "检查控制柜（1点）");
        if (p.sealAbility) {
          add("install", "安装旁路装置（2点+装置）");
          if (!g.activation)
            add("activate", "提交隔离协议（2点，需密钥及成熟装置）");
        }
        if (g.device && (p.knowsDevice === g.device.id || g.devicePublic))
          add("dismantle", "拆除装置（2点+3公共零件+工具包）");
      }
      if (
        !p.roundUsed.skill &&
        !(["guard", "sheriff", "gunner"].includes(p.role) && p.used.skill) &&
        !["engineer", "bystander"].includes(p.role)
      ) {
        const skills = {
          medic: "医师：查看累计针数（1点，每轮一次）",
          investigator: "调查员：深入搜房（2点，额外记录每轮一次）",
          tracker: "追踪员：标记后随机追踪两次活动（1点）",
          guard: "护卫：保护至本轮结束（2点，整局一次）",
          sheriff: "执法官：射击（2点，误杀人类自身也死）",
          gunner: "枪手：射击（3点，整局一次）",
          searcher: "搜寻员：免费预览一次直接奖励",
        };
        add(
          "skill",
          skills[p.role],
          p.role === "searcher"
            ? [
                field(
                  "choice",
                  "搜索选项",
                  opts
                    .filter((o) => o.cost)
                    .map((o) => ({ value: o.value, label: o.label })),
                ),
              ]
            : [
                p.role === "investigator"
                  ? field("targetId", "调查谁的房间", options(g.players))
                  : targetField(["guard", "medic"].includes(p.role)),
                ...(p.role === "investigator" ? investigationFields() : []),
              ],
        );
      }
    }
  }
  const roleInfo = {
    engineer: "每轮首次搜索零件额外+1。",
    medic: "每轮1次，1点查看同组者累计血清针数。",
    investigator: "每轮首次2点深入搜房多取得一条记录。",
    tracker: "每轮1次，1点标记同组者，轮末随机追踪随后两次活动。",
    guard: "整局1次，2点保护同组者至本轮结束，免受武器。",
    searcher: "每轮1次免费预览奖励，不重抽。",
    sheriff: "整局1次2点射击；未转化目标死亡时自己也死。",
    gunner: "整局1次3点射击同组目标。",
    bystander: "每次感染25%免疫，整局最多成功一次。",
  };
  const hints = {
    station: "车长先选下一站；选好后每位乘客自行决定留车或下车。",
    planning: "每位乘客自行选择留车或下车；车长必须留车。单人外出有80%概率遭遇外部感染者。",
    search:
      "每人五个情景，收益进公共库存。完成五题后仍可使用技能；点击完成则停止主动行动。",
    therapy: "潜伏者下一轮转化；可用血清治疗。任何人的第三针都会致死。",
    ration: "车长公开分粮：留车1份、外出2份；不足者下轮扣2行动点。",
    election: "最高票当选车长，平票反复重投。",
    vote: "仅超过全部存活人数一半才处决，弃票不降低门槛。",
  };
  return {
    code: g.code,
    hint: hints[g.phase] ?? "",
    phase: g.phase,
    phaseLabel: LABELS[g.phase],
    station: g.station?.[1] ?? null,
    round: g.round,
    deadline: g.deadline,
    transitionUntil: g.transitionUntil,
    hostId: g.hostId,
    captainId: g.captainId,
    players: g.players.map((t) => ({
      id: t.id,
      name: t.name,
      online: t.online,
      alive: visibleAlive(t),
      captain: t.id === g.captainId,
      group: t.group,
      ration: t.ration,
      ...(spectator || g.phase === "ended"
        ? {
            roleLabel: ROLES[t.role]?.[0],
            factionLabel: FACTIONS[t.faction],
            status: t.status,
            bag: t.bag,
          }
        : {}),
    })),
    resources: { ...g.resources },
    me: {
      id,
      spectating: p.spectating,
      eliminationPending: !p.alive && !p.left && !p.spectating,
      role: p.role,
      roleLabel: ROLES[p.role]?.[0] ?? "尚未分配",
      roleInfo: roleInfo[p.role] ?? "",
      faction: p.faction,
      factionLabel: FACTIONS[p.faction] ?? "尚未分配",
      ap: p.ap,
      bag: p.bag.map((x) => ({ ...x })),
      status: p.alive ? p.status : "dead",
      notes: [
        ...(p.role
          ? [
              roleInfo[p.role],
              p.faction === "safe"
                ? "主线：活着且未转化抵达终点。"
                : p.faction === "seal"
                  ? "主线：收集密钥和装置，安装后经过会议，于第四轮隔离站启动。"
                  : "主线：至少一名感染者存活到站，阻止封锁。",
            ]
          : []),
        ...(hints[g.phase] ? [hints[g.phase]] : []),
        ...p.notes.slice(-30),
      ],
      tasks: p.tasks.map((t) => ({
        ...t,
        text:
          t.label +
          "：" +
          t.progress +
          "/" +
          (t.goal ?? (["fuel", "food", "parts"].includes(t.id) ? 6 : 2)) +
          (t.complete ? "（已完成）" : ""),
      })),
      evidence: p.evidence,
      pending: p.pending,
      emergency:
        g.emergencies
          .filter((e) => e.actor === id || e.target === id)
          .map((e) => ({
            deadline: e.deadline,
            attackerName: who(g, e.actor).name,
            defenderName: who(g, e.target).name,
            defending: e.target === id,
          }))[0] ?? null,
    },
    actions,
    log: g.log.slice(-60),
    chat: g.chat
      .filter(
        (c) =>
          spectator ||
          c.group === "all" ||
          (g.phase === "search" && c.round === g.round && c.group === p.group),
      )
      .slice(-80),
    warehouse: g.warehouse,
    result: g.result,
    voicePeers: g.players
      .filter(
        (t) =>
          p.alive &&
          t.alive &&
          t.id !== id &&
          t.online &&
          !t.left &&
          !p.left &&
          (meeting(g) ||
            g.phase === "lobby" ||
            (g.phase === "search" &&
              (spectator
                ? p.deathPublic || t.group === p.group
                : !visibleAlive(t) || t.group === p.group))),
      )
      .map((t) => ({
        id: t.id,
        name: t.name,
        canSend: true,
        canReceive: true,
      })),
  };
}
