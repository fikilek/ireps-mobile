import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { returnAfterLifecycleWork } from "./lifecycleReturn.js";
import { returnAfterPremiseForm, PREMISE_TAB, PREMISE_WORKORDERS } from "./premiseFormReturn.js";
const require = createRequire(import.meta.url);
const { StackRouter, TabRouter } = require("@react-navigation/routers");

// Execute the installed Expo Router action generator/queue and real React
// Navigation reducers. Only native/linking adapters are supplied for Node.
function navigation({ hasPremiseIndex = false } = {}) {
  const options = names => ({ routeNames: names, routeParamList: {}, routeGetIdList: {} });
  const stack = StackRouter({}), tab = TabRouter({ initialRouteName: "premises" });
  const premiseStack = stack.getInitialState(options(["index", "formPremise"]));
  premiseStack.key = "PREMISES";
  premiseStack.routes = hasPremiseIndex ? [{ key: "list", name: "index", params: {} }, { key: "form", name: "formPremise" }] : [{ key: "form", name: "formPremise" }];
  premiseStack.index = premiseStack.routes.length - 1;
  const tabs = tab.getInitialState(options(["premises", "admin", "maps"])); tabs.key = "TABS";
  tabs.routes[0].state = premiseStack;
  const root = stack.getInitialState(options(["(auth)", "(tabs)"])); root.key = "ROOT";
  root.routes.push({ key: "app", name: "(tabs)", state: tabs }); root.index = 1;
  let state = root;
  const actions = [];
  const apply = (current, action) => {
    if (!action.target || action.target === current.key) {
      return (current.type === "tab" ? tab : stack).getStateForAction(current, action, options(current.routeNames)) || current;
    }
    return { ...current, routes: current.routes.map(route => route.state ? { ...route, state: apply(route.state, action) } : route) };
  };
  const routeState = href => {
    const names = href === PREMISE_TAB ? ["(tabs)", "premises", "index"] : href === "/(tabs)/maps" ? ["(tabs)", "maps", "index"] : ["(tabs)", "admin", "operations", "my-workorders"];
    return names.reduceRight((child, name) => ({ routes: [{ name, ...(child ? { state: child } : {}) }] }), null);
  };
  const store = { get state() { return state; }, getRouteInfo: () => ({}), redirects: [],
    navigationRef: { isReady: () => true, current: { getRootState: () => state, dispatch: action => { actions.push(action); state = apply(state, action); } } },
    linking: { config: {}, getStateFromPath: routeState },
  };
  const exports = {};
  vm.runInNewContext(readFileSync(require.resolve("expo-router/build/global-state/routing.js"), "utf8"), { exports, process, console,
    require: name => {
      if (name === "./router-store") return { store };
      if (name === "expo/dom") return { IS_DOM: false };
      if (name === "react-native") return { Platform: { OS: "android" } };
      if (name === "../domComponents/emitDomEvent") return new Proxy({}, { get: () => () => false });
      if (name === "../link/href") return { resolveHref: value => typeof value === "string" ? value : value.pathname, resolveHrefStringWithSegments: value => value };
      if (name === "../getRoutesRedirects") return { applyRedirects: value => value };
      if (name === "../matchers") return { matchDynamicName: () => null };
      if (name === "../navigationParams") return { appendInternalExpoRouterParams: params => params };
      if (name === "../utils/url") return { shouldLinkExternally: () => false };
      if (name === "expo-linking") return {};
      throw Error(`Unexpected native dependency: ${name}`);
    },
  });
  return { router: exports, actions, state: () => state, flush: () => exports.routingQueue.run(store.navigationRef) };
}

test("reproduces the apparent logout: global dismiss removes tabs, so the queued return has no navigator", () => {
  const nav = navigation();
  assert.equal(nav.router.canDismiss(), true, "root auth history makes canDismiss true even with a single-screen premise stack");
  nav.router.dismissAll(); nav.router.navigate(PREMISE_WORKORDERS); nav.flush();
  assert.equal(nav.state().routes[nav.state().index].name, "(auth)");
  assert.equal(nav.actions[0].type, "POP_TO_TOP");
  assert.equal(nav.actions[1].target, "TABS");
  assert.ok(!nav.state().routes.some(route => route.name === "(tabs)"));
});

for (const hasPremiseIndex of [false, true]) test(`scoped return preserves signed-in tabs and targets My Workorders (premise index: ${hasPremiseIndex})`, () => {
  const nav = navigation({ hasPremiseIndex });
  returnAfterLifecycleWork(nav.router, PREMISE_WORKORDERS, PREMISE_TAB); nav.flush();
  assert.equal(nav.state().routes[nav.state().index].name, "(tabs)");
  assert.equal(nav.state().routes.length, 2, "auth history is neither exposed nor rewritten");
  assert.equal(nav.actions[0].target, "PREMISES"); assert.equal(nav.actions[0].type, "POP_TO");
  assert.equal(nav.actions[1].target, "TABS"); assert.equal(nav.actions[1].payload.name, "admin");
  assert.equal(nav.actions[1].payload.params.screen, "operations");
  assert.equal(nav.actions[1].payload.params.params.screen, "my-workorders");
  const premise = nav.state().routes[1].state.routes[0].state;
  assert.deepEqual(premise.routes.map(route => route.name), ["index"]);
  if (hasPremiseIndex) assert.equal(premise.routes[0].key, "list", "mounted source list/filter context is retained");
});

test("a correction opened on Premises returns to the same mounted list and retains its filter", () => {
  const nav = navigation({ hasPremiseIndex: true });
  returnAfterPremiseForm(nav.router, PREMISE_TAB); nav.flush();
  assert.equal(nav.state().routes[nav.state().index].name, "(tabs)");
  assert.equal(nav.actions.length, 1); assert.equal(nav.actions[0].target, "PREMISES");
  const list = nav.state().routes[1].state.routes[0].state.routes[0];
  assert.equal(list.key, "list", "same mounted list owns the existing filter and scroll state");
});
