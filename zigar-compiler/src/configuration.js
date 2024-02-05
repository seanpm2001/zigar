import { basename, dirname, join, parse, resolve } from 'path';
import { findFile, findFileSync, loadFile, loadFileSync, md5 } from './utility-functions.js';

export const optionsForCompile = {
  optimize: {
    type: 'string',
    enum: [ 'Debug', 'ReleaseSmall', 'ReleaseFast', 'ReleaseSafe' ],
    title: 'Zig optimization mode',
  },
  omitFunctions: {
    type: 'boolean',
    title: 'Omit all Zig functions',
  },
  omitVariables: {
    type: 'boolean',
    title: 'Omit all variables',
  },
  omitExports: {
    type: 'boolean',
    title: 'Omit export statements',
  },
  topLevelAwait: {
    type: 'boolean',
    title: 'Use top-level await to load WASM file',
  },
  buildDir: {
    type: 'string',
    title: 'Root directory where temporary build directories are placed',
  },
  cacheDir: {
    type: 'string',
    title: 'Directory where compiled library files are placed',
  },
  zigCmd: {
    type: 'string',
    title: 'Zig command used to build libraries',
  },
  sourceFiles: {
    type: 'object',
    title: 'Map of modules to source files/directories',
  },
  staleTime: {
    type: 'number',
    title: 'Time interval in milliseconds before a lock file is considered stale',
  },
  clean: {
    type: 'boolean',
    title: 'Remove temporary build directory after compilation finishes',
  },
  targets: {
    type: 'object',
    title: 'List of cross-compilation targets',
  },
};

export const optionsForTranspile = {
  useReadFile: {
    type: 'boolean',
    title: 'Enable the use of readFile() to Load WASM file when library is used in Node.js',
  },
  embedWASM: {
    type: 'boolean',
    title: 'Embed WASM file in JavaScript source code',
  },
  stripWASM: {
    type: 'boolean',
    title: 'Remove unnecessary code from WASM file',
  },
  keepNames: {
    type: 'boolean',
    title: 'Keep names of function in WASM binary when stripping',
  },
};

const allOptions = { 
  ...optionsForCompile,
  ...optionsForTranspile,
};

export function extractOptions(searchParams, availableOptions) {
  const options = {};
  for (const [ name, string ] of searchParams) {
    const key = camelCase(name);
    options[key] = convertValue(key, string, availableOptions);
  }
  return options;
}

function camelCase(name) {
  return name.toLowerCase().replace(/[_-](\w)/g, (m0, m1) => m1.toUpperCase());
}

function throwUnknownOption(key) {
  const adjective = (allOptions[key]) ? 'Unavailable' : 'Unrecognized';
  throw new Error(`${adjective} option: ${key}`);
}

function convertValue(key, string, availableOptions) {
  const option = availableOptions[key];
  if (!option) {
    throwUnknownOption(key);
  }
  switch (option.type) {
    case 'boolean': return !!parseInt(string);
    case 'number': return parseInt(string);
    default: return string;
  }
}

export async function findConfigFile(name, dir) {
  const path = join(dir, name);
  const info = await findFile(path);
  if (info?.isFile()) {
    return path;
  } else {
    const parent = dirname(dir);
    if (parent !== dir) {
      return findConfigFile(name, parent);
    }
  }
}

export function findConfigFileSync(name, dir) {
  const path = join(dir, name);
  const info = findFileSync(path);
  if (info?.isFile()) {
    return path;
  } else {
    const parent = dirname(dir);
    if (parent !== dir) {
      return findConfigFileSync(name, parent);
    }
  }
}

const cwd = process.cwd();

export function getCachePath(srcPath, options) {
  const {
    cacheDir = join(cwd, 'zigar-cache'),
    optimize,
    platform,
    arch,
  } = options;
  const src = parse(srcPath);
  const folder = basename(src.dir).slice(0, 16).trim() + '-' + md5(src.dir).slice(0, 8);  
  const soPathPI = join(cacheDir, folder, optimize, `${src.name}.zigar`);
  return addPlatformExt(soPathPI, options);
}

export function getPlatformExt(options) {
  const {
    platform,
    arch,
  } = options;  
  let ext;
  switch (platform) {
    case 'darwin':
      ext = '.dylib';
      if (arch !== 'arm64') {
        ext = `.${arch}` + ext;
      }
      break;
    case 'win32':
      ext = '.dll';
      if (arch !== 'x64') {
        ext = `.${arch}` + ext;
      }
      break;
    default:
      if (arch === 'wasm32' || arch === 'wasm64') {
        ext = '.wasm';
      } else {
        ext = '.so';
        if (arch !== 'x64') {
          ext = `.${arch}` + ext;
        }
        if (platform !== 'linux') {
          ext = `.${platform}` + ext;
        }
      }
  }
  return ext;
}

export function addPlatformExt(path, options) {
  return path + getPlatformExt(options);
}

export async function loadConfigFile(cfgPath, availableOptions) {
  const text = await loadFile(cfgPath);
  return processConfigFile(text, cfgPath, availableOptions);
}

export function loadConfigFileSync(cfgPath, availableOptions) {
  const text = loadFileSync(cfgPath);
  return processConfigFile(text, cfgPath, availableOptions);
}

function processConfigFile(text, cfgPath, availableOptions) {
  const options = JSON.parse(text);
  for (const [ key, value ] of Object.entries(options)) {
    const option = availableOptions[key];
    if (!option) {
      throwUnknownOption(key);
    }    
    if (typeof(value) !== option.type) {
      throw new Error(`${key} is expected to be a ${option.type}, received: ${value}`);
    }
  }
  const { sourceFiles } = options;
  if (sourceFiles) {
    const map = options.sourceFiles = {};    
    const cfgDir = dirname(cfgPath)
    for (const [ module, source ] of Object.entries(sourceFiles)) {
      const modulePath = resolve(cfgDir, module);
      const sourcePath = resolve(cfgDir, source);
      map[modulePath] = sourcePath;
    }
  }
  return options;
}

export function findSourceFile(soPathPI, options) {
  const { sourceFiles } = options;
  return sourceFiles?.[soPathPI];
}