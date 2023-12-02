export async function loadModule(libPath) {
  const { createRequire } = await import('module');
  const { fileURLToPath } = await import('url');
  const require = createRequire(import.meta.url);
  const extPath = fileURLToPath(new URL('../build/Release/node-zigar-addon', import.meta.url));
  const { loadModule } = require(extPath);
  return loadModule(libPath);
}

export async function importModule(libPath, options = {}) {
  const env = await loadModule(libPath);
  env.acquireStructures(options);
  return env.getRootModule();
}

export async function exportStructures(libPath, options = {}) {
  const env = await loadModule(libPath);
  env.acquireStructures(options);
  return env.exportStructures();
}
