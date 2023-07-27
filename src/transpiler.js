import { readFile } from 'fs/promises';
import { compile } from './compiler.js';
import { runWASMBinary, serializeDefinitions } from './wasm-exporter.js';

export async function transpile(path, options = {}) {
  const {
    embedWASM = true,
    moduleResolver = (name) => name,
    wasmLoader,
    omitFunctions,
    ...compileOptions
  } = options;
  const wasmPath = await compile(path, { ...compileOptions, target: 'wasm' });
  const buffer = await readFile(wasmPath);
  const structures = await runWASMBinary(buffer, { omitFunctions });
  const hasMethods = !!structures.find(s => s.methods.length > 0);
  const runtimeURL = moduleResolver('node-zig/wasm-runtime');
  let loadWASM;
  if (hasMethods) {
    if (embedWASM) {
      const base64 = await readFile(wasmPath, { encoding: 'base64' });
      loadWASM = `(async () => {
        const binaryString = atob(${JSON.stringify(base64)});
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      })()`;
    } else {
      if (typeof(wasmLoader) !== 'function') {
        throw new Error(`wasmLoader is a required option when embedWASM is false`);
      }
      loadWASM = wasmLoader(wasmPath);
    }
  }
  return serializeDefinitions(structures, { runtimeURL, loadWASM });
}
