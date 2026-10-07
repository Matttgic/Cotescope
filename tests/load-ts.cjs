const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

// Exercise the actual TypeScript sources without introducing a second runtime dependency.
function loadTS(relative, overrides = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, instance);
  instance.require = (name) => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name === "server-only") return {};
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/")
        ? path.resolve(__dirname, "../src", name.slice(2))
        : path.resolve(path.dirname(filename), name);
      if (fs.existsSync(target + ".ts"))
        return loadTS(
          path.relative(path.resolve(__dirname, ".."), target + ".ts"),
          overrides,
          cache,
        );
    }
    return Module.prototype.require.call(instance, name);
  };
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  instance._compile(result.outputText, filename);
  return instance.exports;
}
module.exports = { loadTS };
