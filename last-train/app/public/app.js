import { Voice } from "./voice.js";
import { applyLocale, translate } from "./i18n.js";
const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
let socket,
  state,
  session,
  locale = "en",
  pending = false,
  ready = false,
  joined = false,
  leaving = false,
  listenButton,
  abandonButton,
  voiceClosedForElimination = false;
try {
  const savedLocale = localStorage.getItem("last-train-language");
  if (["zh", "en"].includes(savedLocale)) locale = savedLocale;
} catch {
  locale = "en";
}
$("language").value = locale;
applyLocale(locale);
const storageKey = "last-train-session";
try {
  const saved = sessionStorage.getItem(storageKey);
  session = saved ? JSON.parse(saved) : null;
} catch {
  showError("无法读取重连身份，请检查浏览器存储权限。");
}
const requestedCode = new URL(location.href).searchParams.get("room");
if (requestedCode) $("code").value = requestedCode;
if (session && requestedCode && requestedCode.toUpperCase() !== session.code)
  showError(
    `当前标签页保留房间 ${session.code} 的身份。将先重连该房间；加入另一房间请使用独立浏览器窗口。`,
  );
function showError(message) {
  $("error").textContent = translate(message, locale);
  $("error").hidden = false;
}
function clearError() {
  $("error").hidden = true;
}
function isDead() {
  return (
    state?.players?.find((player) => player.id === session?.playerId)?.alive ===
    false
  );
}
function availability() {
  $("create").disabled = !ready || pending || !!session;
  $("join").disabled = !ready || pending || !!session;
  document
    .querySelectorAll("#actions button, #skills button")
    .forEach((b) => (b.disabled = !ready || !joined || pending));
  $("voice-enable").disabled =
    !ready || !joined || !state || isDead() || !!voice.starting;
  if (listenButton)
    listenButton.disabled = !ready || !joined || !state || isDead();
  if ($("invite")) $("invite").hidden = isDead();
  if (abandonButton) abandonButton.hidden = !session || (joined && isDead());
}
function send(message) {
  if (!ready || socket.readyState !== WebSocket.OPEN) {
    showError("连接已断开，请先重新连接。");
    return false;
  }
  socket.send(JSON.stringify(message));
  return true;
}
const voice = new Voice(
  (message) => send(message),
  (text) => {
    $("voice-status").textContent = translate(text, locale);
  },
);
function connect() {
  ready = false;
  joined = false;
  availability();
  $("connection").replaceChildren(el("span", "正在连接列车…"));
  socket = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
  );
  socket.addEventListener("open", () => {
    ready = true;
    $("connection").textContent = "已连接列车";
    applyLocale(locale);
    if (session) {
      pending = true;
      send({ type: "resume", code: session.code, ticket: session.ticket });
    }
    availability();
  });
  socket.addEventListener("message", (event) => {
    let packet;
    try {
      packet = JSON.parse(event.data);
    } catch {
      showError("服务器消息格式错误。");
      return;
    }
    if (packet.type === "session") {
      joined = true;
      pending = false;
      session = {
        code: packet.code,
        ticket: packet.ticket,
        playerId: packet.playerId,
      };
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(session));
      } catch {
        showError("浏览器无法保存身份；关闭或刷新后将无法自动重连。");
      }
      voice.setId(session.playerId);
    }
    if (packet.type === "state") {
      state = packet.state;
      render();
    }
    if (packet.type === "error") {
      if (packet.operation === "signal") {
        voice.status(translate("语音频道状态已变化，正在更新。", locale));
        return;
      }
      pending = false;
      leaving = false;
      showError(packet.message);
      availability();
    }
    if (packet.type === "ack") {
      if (leaving) {
        resetIdentity();
        return;
      }
      pending = false;
      availability();
    }
    if (packet.type === "signal") voice.receive(packet.fromId, packet.data);
  });
  socket.addEventListener("close", () => {
    ready = false;
    joined = false;
    pending = false;
    if ($("elimination-choice").open) $("elimination-choice").close();
    if ($("phase-transition").open) $("phase-transition").close();
    voice.disconnect();
    availability();
    const retry = el("button", "重新连接", "quiet");
    retry.addEventListener("click", connect);
    $("connection").replaceChildren(
      el("span", "连接断开；游戏仍在继续，身份已保留。"),
      retry,
    );
    applyLocale(locale);
  });
  socket.addEventListener("error", () =>
    showError("无法连接服务器，请确认服务器仍在运行，再点击重新连接。"),
  );
}
function enter(type) {
  const name = $("name").value.trim();
  if (!name) return showError("请先填写乘客姓名。");
  const code = $("code").value.trim().toUpperCase();
  if (type === "join" && !code) return showError("请填写房间号。");
  clearError();
  if (send({ type, name, code })) {
    pending = true;
    availability();
  }
}
$("create").addEventListener("click", () => enter("create"));
$("join").addEventListener("click", () => enter("join"));
$("rules-open").addEventListener("click", () => $("rules").showModal());
$("rules-close").addEventListener("click", () => $("rules").close());
$("invite").addEventListener("click", async () => {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", state.code);
  try {
    await navigator.clipboard.writeText(url.href);
    $("invite").textContent = "邀请链接已复制";
    applyLocale(locale);
  } catch {
    showError(`无法复制，请手动分享房间号：${state.code}`);
  }
});
document.querySelectorAll("[data-page]").forEach((button) =>
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-page]").forEach((b) => {
      const selected = b === button;
      b.setAttribute("aria-selected", String(selected));
      $(`page-${b.dataset.page}`).hidden = !selected;
    });
  }),
);
$("voice-enable").addEventListener("click", async () => {
  $("voice-enable").disabled = true;
  if (voice.enabled) {
    voice.stop();
    $("voice-enable").textContent = "启用语音";
  } else {
    if (await voice.enable()) {
      if (isDead() || !ready) voice.stop();
      else $("voice-enable").textContent = "关闭麦克风";
    }
  }
  availability();
});
listenButton = el("button", "启用收听", "secondary");
$("voice-enable").after(listenButton);
listenButton.addEventListener("click", () => voice.listen());
$("language").addEventListener("change", () => {
  locale = $("language").value;
  try {
    localStorage.setItem("last-train-language", locale);
  } catch {
    showError("浏览器无法保存语言偏好，本次页面内仍会生效。");
  }
  if (state) render();
  else applyLocale(locale);
});
const stageHint = el("p", "", "hint");
$("actions").before(stageHint);
const emergencyBanner = el("div", "", "error");
emergencyBanner.setAttribute("role", "alert");
emergencyBanner.hidden = true;
$("game").prepend(emergencyBanner);
let previousEmergency = null;
abandonButton = el("button", "放弃此身份，返回首页", "quiet");
abandonButton.id = "abandon-identity";
$("connection").after(abandonButton);
abandonButton.hidden = !session;
function resetIdentity() {
  voice.disconnect();
  voiceClosedForElimination = false;
  if ($("elimination-choice").open) $("elimination-choice").close();
  if ($("phase-transition").open) $("phase-transition").close();
  session = null;
  state = null;
  pending = false;
  joined = false;
  leaving = false;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    showError(
      "浏览器禁止删除保存的身份。当前身份已退出；请允许站点存储后再刷新页面。",
    );
    $("game").hidden = true;
    $("entry").hidden = false;
    abandonButton.hidden = true;
    socket.close();
    return;
  }
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  location.replace(url.href);
}
abandonButton.addEventListener("click", () => {
  if (!session || pending || (joined && isDead())) return;
  if (
    !confirm(
      ready && joined
        ? "确认主动离场？你将不能重返本局，也不能获胜。"
        : "确认放弃保存的身份？这不会暂停或替服务器结束旧角色，你将无法再重连该角色。",
    )
  )
    return;
  if (ready && joined) {
    leaving = true;
    pending = true;
    send({ type: "action", action: { type: "leave" } });
    availability();
  } else resetIdentity();
});
$("elimination-choice").addEventListener("cancel", (event) =>
  event.preventDefault(),
);
$("phase-transition").addEventListener("cancel", (event) =>
  event.preventDefault(),
);
function chooseElimination(choice) {
  if (!state?.me?.eliminationPending || pending) return;
  pending = true;
  leaving = choice === "exit";
  if (!send({ type: "elimination", choice })) {
    pending = false;
    leaving = false;
  }
  availability();
}
$("spectate").addEventListener("click", () =>
  chooseElimination("spectate"),
);
$("elimination-exit").addEventListener("click", () =>
  chooseElimination("exit"),
);
function textOf(value) {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (value == null) return "";
  return value.text ?? value.message ?? value.label ?? JSON.stringify(value);
}
function records(id, items, empty) {
  $(id).replaceChildren();
  if (!items?.length) {
    $(id).append(el("p", empty, "empty"));
    return;
  }
  for (const item of items) {
    const line = textOf(item);
    const record = el("div", item.name ? `${item.name}：${line}` : line, "record");
    if (id === "chat") record.dataset.noTranslate = "true";
    $(id).append(record);
  }
}
function render() {
  $("entry").hidden = true;
  $("game").hidden = false;
  $("room").textContent = `房间 ${state.code} · 单程车票`;
  $("phase").textContent = state.phaseLabel;
  $("round").textContent = state.round
    ? `第 ${state.round} / 4 轮`
    : "等待发车";
  abandonButton.hidden = joined && isDead();
  $("invite").hidden = isDead();
  stageHint.textContent = state.hint || "";
  const currentEmergency = state.me?.emergency;
  emergencyBanner.hidden = !currentEmergency;
  if (
    currentEmergency?.defending &&
    currentEmergency.deadline !== previousEmergency
  ) {
    document.querySelector('[data-page="action"]').click();
    emergencyBanner.scrollIntoView({ block: "center" });
  }
  previousEmergency = currentEmergency?.deadline ?? null;
  $("resources").replaceChildren();
  for (const [key, label] of [
    ["fuel", "燃料"],
    ["parts", "零件"],
    ["food", "食物"],
    ["debt", "零件欠额"],
  ]) {
    const node = el("div", label, "resource");
    node.append(el("strong", state.resources?.[key] ?? "—"));
    $("resources").append(node);
  }
  const me = state.me;
  $("skill-description").textContent = me?.roleInfo
    ? translate(me.roleInfo, locale)
    : translate("身份尚未分配", locale);
  $("identity").replaceChildren();
  if (me) {
    const identity = el("div", undefined, "identity");
    const statusLabel =
      { healthy: "健康", latent: "潜伏期", infected: "感染者", dead: "已死亡" }[
        me.status
      ] ?? textOf(me.status);
    identity.append(
      el("strong", me.roleLabel || "身份尚未分配"),
      el("div", me.factionLabel || "等待发车"),
      el(
        "div",
        locale === "en"
          ? `Status: ${translate(statusLabel, locale)} · Action points: ${me.ap ?? "—"}`
          : `状态：${statusLabel} · 行动点：${me.ap ?? "—"}`,
      ),
    );
    $("identity").append(identity);
  }
  $("bag").replaceChildren();
  $("bag").className = "bag";
  if (me?.bag?.length)
    me.bag.forEach((item) => $("bag").append(el("span", item.label, "badge")));
  else $("bag").append(el("p", "背包为空", "empty"));
  records(
    "tasks",
    me?.tasks?.map((task) => ({
      text: locale === "en"
        ? `${translate(task.label, locale)} · ${task.complete ? "Complete" : `Progress ${task.progress ?? 0}/${task.goal ?? "—"}`}`
        : `${task.label} · ${task.complete ? "已完成" : `进度 ${task.progress ?? 0}/${task.goal ?? "—"}`}`,
    })),
    "尚无私人任务",
  );
  records(
    "notes",
    [
      ...(me?.notes || []),
      ...(me?.evidence || []).map((proof) => locale === "en"
        ? `Original evidence · Round ${proof.round}: ${translate(proof.text, locale)}`
        : `证据原件 · 第${proof.round}轮：${proof.text}`),
    ],
    "尚无个人记录",
  );
  records("log", state.log, "等待第一条广播");
  records("chat", state.chat, "当前频道暂无消息");
  $("players").replaceChildren();
  for (const player of state.players) {
    const row = el("div", undefined, "person");
    const playerName = el("span", player.name);
    playerName.dataset.noTranslate = "true";
    row.append(playerName);
    if (player.id === me?.id)
      row.append(el("span", locale === "en" ? " (you)" : "（你）"));
    if (player.captain) row.append(el("span", "车长", "badge"));
    const group = player.group === "train"
      ? "留车"
      : player.group === "away"
        ? "下车搜索"
        : "待选择去向";
    const groupLabel = translate(group, locale);
    row.append(el("small", `${groupLabel} · ${translate(player.alive === false ? "已死亡" : player.online ? "在线" : "离线", locale)}`));
    $("players").append(row);
  }
  $("summary").textContent =
    locale === "en"
      ? `${state.players.length} passengers\n${translate(me?.roleLabel || "身份未分配", locale)}\n${me?.ap === undefined ? "" : `${me.ap} AP remaining`}`
      : `${state.players.length} 位乘客\n${me?.roleLabel || "身份未分配"}\n${me?.ap === undefined ? "" : `剩余 ${me.ap} 行动点`}`;
  if (isDead())
    for (const player of state.players) {
      $("players").append(
        el(
          "p",
          locale === "en"
            ? `${player.name} · ${translate(player.roleLabel, locale)} / ${translate(player.factionLabel, locale)} · Items: ${player.bag?.map((item) => translate(item.label, locale)).join(", ") || "None"}`
            : `${player.name} · ${player.roleLabel} / ${player.factionLabel} · 随身物品：${player.bag?.map((item) => item.label).join("、") || "无"}`,
          "record",
        ),
      );
    }
  renderActions();
  $("result").hidden = !state.result;
  if (state.result) {
    $("result").replaceChildren(el("h3", translate(state.result.reason, locale)));
    for (const player of state.result.players || []) {
      $("result").append(
        el(
          "p",
          locale === "en"
            ? `${player.won ? "Victory" : "Defeat"} · ${player.name} · ${translate(player.roleLabel, locale)} / ${translate(player.factionLabel, locale)}`
            : `${player.won ? "胜利" : "失败"} · ${player.name} · ${player.roleLabel} / ${player.factionLabel}`,
        ),
      );
    }
  }
  if (isDead()) {
    if (!voiceClosedForElimination) {
      voice.disconnect();
      voiceClosedForElimination = true;
    }
    voice.update([]);
    $("voice-enable").textContent = "启用语音";
    if (state.me.eliminationPending && !$("elimination-choice").open)
      $("elimination-choice").showModal();
    else if (state.me.spectating && $("elimination-choice").open)
      $("elimination-choice").close();
  } else {
    voiceClosedForElimination = false;
    voice.update(state.voicePeers || []);
  }
  updatePhaseTransition();
  availability();
  clock();
  applyLocale(locale);
}
function renderActions() {
  renderActionList(
    "actions",
    state.actions.filter((action) => !["skill", "chat"].includes(action.type)),
    "当前没有可提交的行动。请等待其他乘客或阶段结束，也可查看自己的书页。",
  );
  renderActionList(
    "skills",
    state.actions.filter((action) => action.type === "skill"),
    "目前没有可使用的主动技能。",
  );
  renderActionList(
    "chat-compose",
    state.actions.filter((action) => action.type === "chat"),
    null,
  );
}
function renderActionList(id, availableActions, emptyText) {
  // Preserve unfinished input across broadcasts from other players and server ticks.
  const values = new Map();
  $(id)
    .querySelectorAll("form")
    .forEach((form) =>
      values.set(form.dataset.key, Object.fromEntries(new FormData(form))),
    );
  const focused = document.activeElement;
  const focusKey = focused?.closest(`#${id} form`)?.dataset.key;
  const focusName = focused?.name;
  const selection =
    focused?.type === "text"
      ? [focused.selectionStart, focused.selectionEnd]
      : null;
  $(id).replaceChildren();
  if (!availableActions.length) {
    if (emptyText) $(id).append(el("p", emptyText, "empty"));
    return;
  }
  const occurrences = new Map();
  for (const action of [
    ...availableActions.filter((action) => action.type !== "done"),
    ...availableActions.filter((action) => action.type === "done"),
  ]) {
    const index = occurrences.get(action.type) || 0;
    occurrences.set(action.type, index + 1);
    const key = `${action.type}:${index}`,
      form = el("form", undefined, "action");
    form.dataset.key = key;
    form.append(el("p", action.label, "action-title"));
    for (const field of action.fields || []) {
      const label = el("label", field.label);
      let input;
      if (field.kind === "select") {
        input = el("select");
        const playerIds = new Set(state.players.map((player) => player.id));
        for (const option of field.options) {
          const node = el("option", option.label);
          node.value = option.value;
          if (
            field.name === "targetId" &&
            playerIds.has(String(option.value))
          )
            node.dataset.noTranslate = "true";
          input.append(node);
        }
      } else {
        input = el("input");
        input.type = field.kind === "number" ? "number" : "text";
        if (field.min !== undefined) input.min = field.min;
        if (field.max !== undefined) input.max = field.max;
        if (field.kind === "number") input.step = "1";
      }
      input.name = field.name;
      input.required = !(
        field.kind === "select" &&
        field.options.some((option) => option.value === "")
      );
      if (field.value !== undefined || field.default !== undefined)
        input.value = field.value ?? field.default;
      else if (field.kind === "number")
        input.value = Math.max(0, field.min ?? 0);
      const previous = values.get(key)?.[field.name];
      if (
        previous !== undefined &&
        (field.kind !== "select" ||
          field.options.some((option) => String(option.value) === previous))
      )
        input.value = previous;
      label.append(input);
      form.append(label);
    }
    const button = el("button", action.fields?.length ? "确认" : action.label);
    button.type = "submit";
    form.append(button);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (pending) return;
      const submitted = { type: action.type };
      if (action.type === "search") {
        submitted.round = action.round;
        submitted.step = action.step;
      }
      if (["done", "chooseStation", "chooseGroup"].includes(action.type))
        submitted.phaseId = action.phaseId;
      const data = new FormData(form);
      for (const field of action.fields || [])
        submitted[field.name] =
          field.kind === "number"
            ? Number(data.get(field.name))
            : data.get(field.name);
      clearError();
      if (send({ type: "action", action: submitted })) {
        pending = true;
        availability();
      }
    });
    $(id).append(form);
    if (key === focusKey && focusName) {
      const field = form.elements.namedItem(focusName);
      if (field) {
        field.focus({ preventScroll: true });
        if (selection && field.type === "text")
          field.setSelectionRange(...selection);
      }
    }
  }
}
function updatePhaseTransition() {
  const dialog = $("phase-transition");
  const until = state?.transitionUntil;
  if (!joined || !until || state.me?.eliminationPending) {
    if (dialog.open) dialog.close();
    return;
  }
  $("phase-transition-label").textContent =
    state.phase === "planning" && state.station
      ? locale === "en"
        ? `Next stop: ${translate(state.station, locale)}`
        : `下一站：${state.station}`
      : locale === "en"
        ? `Now entering ${translate(state.phaseLabel, locale)}`
        : `现在进入${state.phaseLabel}`;
  if (!dialog.open) dialog.showModal();
}
function clock() {
  if (state?.transitionUntil) {
    const seconds = Math.max(
      0,
      Math.ceil((state.transitionUntil - Date.now()) / 1000),
    );
    $("phase-transition-timer").textContent =
      locale === "en"
        ? `Begins in ${seconds} seconds`
        : `${seconds} 秒后开始`;
  }
  const emergency = state?.me?.emergency;
  if (emergency) {
    const seconds = Math.max(
      0,
      Math.ceil((emergency.deadline - Date.now()) / 1000),
    );
    emergencyBanner.textContent = emergency.defending
      ? locale === "en"
        ? `${emergency.attackerName} is attacking you! Choose a weapon within ${seconds} seconds; the strongest weapon is used automatically if time runs out.`
        : `${emergency.attackerName}正在袭击你！请在 ${seconds} 秒内选择防守武器；超时自动使用最强武器。`
      : locale === "en"
        ? `You are attacking ${emergency.defenderName}; waiting for their defense (${seconds} seconds).`
        : `正在袭击${emergency.defenderName}，等待防守结果（${seconds} 秒）。`;
  }
  if (!state?.deadline) {
    $("timer").textContent = "--:--";
    return;
  }
  const seconds = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
  $("timer").textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
setInterval(clock, 250);
connect();
