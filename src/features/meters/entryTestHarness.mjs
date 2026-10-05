import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const compiled = new Map();

// Run the real components and shared hooks; replace only native hosts and external services.
export function loadEntry(relativePath, overrides) {
  const modules = new Map();
  const replacements = new Map(Object.entries(overrides).map(([name, value]) => [
    name.startsWith(".") ? path.resolve(root, name) : name, value,
  ]));
  function load(filename) {
    if (replacements.has(filename)) return replacements.get(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    if (!compiled.has(filename)) {
      compiled.set(filename, transformSync(fs.readFileSync(filename, "utf8"), {
        filename, babelrc: false, configFile: false,
        plugins: [
          [require.resolve("@babel/plugin-transform-react-jsx"), { runtime: "automatic" }],
          require.resolve("@babel/plugin-transform-modules-commonjs"),
        ],
      }).code);
    }
    const module = { exports: {} };
    modules.set(filename, module);
    const localRequire = name => {
      if (replacements.has(name)) return replacements.get(name);
      if (!name.startsWith(".")) return require(name);
      const resolved = path.resolve(path.dirname(filename), name);
      return load(path.extname(resolved) ? resolved :
        [".js", ".jsx"].map(extension => `${resolved}${extension}`).find(candidate => replacements.has(candidate) || fs.existsSync(candidate)));
    };
    vm.runInNewContext(compiled.get(filename), {
      module, exports: module.exports, require: localRequire, console,
    }, { filename });
    return module.exports;
  }
  return load(path.resolve(root, relativePath)).default;
}

export function deferredGate(requests) {
  return {
    BATCH_WORK_BLOCKED: "BLOCKED",
    BATCH_WORK_BLOCKED_TITLE: "This work is not yours",
    BATCH_WORK_BLOCKED_FOOTER: "Ask the office.",
    checkBatchWorkBeforeForm: input => new Promise(resolve => requests.push({ input, resolve })),
  };
}

export const paperHosts = Object.fromEntries(
  ["ActivityIndicator", "Button", "Modal", "Portal", "Surface", "Text"].map(name => [name, name]),
);
export const nativeHosts = Object.fromEntries(
  ["View", "Modal", "Pressable", "ScrollView", "Text", "TouchableOpacity"].map(name => [name, name]),
);
