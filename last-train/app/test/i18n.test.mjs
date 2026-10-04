import test from "node:test";
import assert from "node:assert/strict";
import { translate } from "../public/i18n.js";

test("English locale translates game phases, roles, and dynamic search choices", () => {
  assert.equal(translate("选举车长", "en"), "Elect a captain");
  assert.equal(translate("工程师", "en"), "Engineer");
  assert.equal(translate("职业技能", "en"), "Role skill");
  assert.equal(translate("阶段切换", "en"), "Phase change");
  assert.equal(translate("取得2燃料（1点）", "en"), "2 Fuel (1 AP)");
  assert.equal(
    translate("情景 3/5：选择搜索行动", "en"),
    "Scenario 3/5: Choose a search action",
  );
});

test("Chinese remains the default and chat text is not translated implicitly", () => {
  assert.equal(translate("旅程结束"), "旅程结束");
  assert.equal(translate("健康", "en"), "Healthy");
  assert.equal(translate("Healthy", "en"), "Healthy");
});

test("elimination choice labels are available in both languages", () => {
  assert.equal(translate("观战", "en"), "Spectate");
  assert.equal(translate("退出并返回主页", "en"), "Exit to home");
  assert.equal(translate("Spectate", "en"), "Spectate");
  assert.match(
    translate(
      "武器袭击有十秒防守选择；出局后可选择观战或退出，观战不能操作、发言或使用语音。",
      "en",
    ),
    /spectate or exit/,
  );
});

test("dynamic announcements preserve passenger names that resemble UI words", () => {
  assert.equal(translate("健康当选车长", "en"), "健康 is elected captain");
  assert.equal(translate("健康获配口粮1/2", "en"), "健康 received 1/2 rations");
  assert.equal(translate("健康：武器伤", "en"), "健康: Weapon injury");
  assert.equal(
    translate("追踪结果：调查、武器操作", "en"),
    "Trace results: Investigation, Weapon action",
  );
});
