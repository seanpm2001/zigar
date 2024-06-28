import NodeResolve from '@rollup/plugin-node-resolve';
import { createHash } from 'crypto';
import 'mocha-skip-if';
import { tmpdir } from 'os';
import { join } from 'path';
import { rollup } from 'rollup';
import { fileURLToPath } from 'url';
import { addTests } from '../../zigar-compiler/test/integration/index.js';
import Zigar from '../dist/index.js';

for (const optimize of [ 'Debug', 'ReleaseSmall', 'ReleaseSafe', 'ReleaseFast' ]) {
  skip.permanently.if(process.env.npm_lifecycle_event === 'coverage').
  describe(`Integration tests (rollup-plugin-zigar, ${optimize})`, function() {
    addTests((url, options) => importModule(url, { optimize, ...options }), {
      littleEndian: true,
      addressSize: 32,
      target: 'wasm32',
      optimize,
    });
  })
}

let currentModule;

async function importModule(url, options) {
  const {
    optimize,
    embedWASM = false,
    useLibc = false,
    topLevelAwait = true
  } = options;
  if (currentModule) {
    await currentModule.__zigar?.abandon();
    if (global.gc) {
      global.gc();
      const released = await currentModule.__zigar?.released();
      if (released === false) {
        console.warn(`WebAssembly instance has not been released`);
      }
    }
    currentModule = null;
  }
  const path = fileURLToPath(url);
  const hash = md5(path);
  const jsPath = join(tmpdir(), 'rollup-integration-test', optimize, `${hash}.mjs`);
  const inputOptions = {
    input: path,
    plugins: [
      Zigar({
        optimize,
        useReadFile: true,
        keepNames: optimize === 'ReleaseSafe',
        topLevelAwait,
        useLibc,
        embedWASM,
      }),
      NodeResolve({
        modulePaths: [ resolve(`../node_modules`) ],
      }),
    ],
  };
  const outputOptions = {
    file: jsPath,
    format: 'esm',
  };
  const bundle = await rollup(inputOptions);
  try {
    await bundle.write(outputOptions);
  } finally {
    await bundle.close();
  }
  currentModule = await import(jsPath);
  return currentModule;
}

function md5(text) {
  const hash = createHash('md5');
  hash.update(text);
  return hash.digest('hex');
}

function resolve(relPath) {
  return new URL(relPath, import.meta.url).pathname;
}
