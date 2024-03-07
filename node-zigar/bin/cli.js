#!/usr/bin/env node

import { writeFile } from 'fs/promises';
import { buildAddOn } from 'node-zigar-addon';
import os from 'os';
import { basename, dirname, join } from 'path';
import { compile, findConfigFile, loadConfigFile, optionsForCompile } from 'zigar-compiler';

const possiblePlatforms = [ 
  'aix', 'darwin', 'freebsd', 'linux', 'linux-musl', 'openbsd', 'sunos', 'win32'
];
const possibleArchs = [
  'arm', 'arm64', 'ia32', 'loong64', 'mips', 'mipsel', 'ppc', 'ppc64', 'riscv64', 's390', 's390x',
  'x64' 
];

async function buildModules() {
  // load node-zigar.config.js
  const configPath = await findConfigFile('node-zigar.config.json', process.cwd());
  if (!configPath) {
    throw new Error('Unable to find node-zigar.config.json');
  }
  const config = await loadConfigFile(configPath, optionsForCompile);
  if (!Array.isArray(config.targets)) {
    throw new Error('Unable to find array "targets" in node-zigar.config.json');
  }
  if (!config.sourceFiles) {
    throw new Error('Unable to find "sourceFiles" in node-zigar.config.json');
  }
  // make sure targets are valid
  for (const { arch, platform } of config.targets) {
    if (!possibleArchs.includes(arch)) {
      if (typeof(arch) !== 'string') {
        throw new Error(`Invalid value for arch: ${arch}`);
      } else {
        console.warn(`Unrecognized archecture: ${arch}`);
      }
    }
    if (!possiblePlatforms.includes(platform)) {
      if (typeof(platform) !== 'string') {
        throw new Error(`Invalid value for platform: ${platform}`);
      } else {
        console.warn(`Unrecognized platform: ${platform}`);
      }
    }
  }
  const parentDirs = [];
  for (const [ modPath, srcPath ] of Object.entries(config.sourceFiles)) {
    console.log(`Building ${basename(modPath)}:`);
    for (const { platform, arch } of config.targets) {
      const { outputPath } = await compile(srcPath, modPath, { ...config, platform, arch }); 
      console.log(`  ${basename(outputPath)}`);
    }
    const parentDir = dirname(modPath);
    if (!parentDirs.includes(parentDir)) {
      parentDirs.push(parentDir);
    }
  }
  console.log(`Building node-zigar-addon:`);
  for (const parentDir of parentDirs) {
    for (const { platform, arch } of config.targets) {
      const { exeName = 'node' } = config;
      const addonPath = join(parentDir, 'node-zigar-addon', `${platform}.${arch}.node`);
      buildAddOn(addonPath, { platform, arch, exeName });
      console.log(`  ${basename(addonPath)}`);
    } 
  }
}

async function createConfig() {
  const path = join(process.cwd(), 'node-zigar.config.json');
  const config = {
    optimize: 'ReleaseSmall',
    sourceFiles: {},
    exeName: 'node',
    targets: [ 
      {
        platform: os.platform(),
        arch: os.arch(),
      }
    ],
  };
  const json = JSON.stringify(config, undefined, 2);
  await writeFile(path, json);
}

function printHelp() {
  const lines = [
    'Usage: npx node-zigar [command]',
    '',
    'Commands:',
    '',
    '  init          Create basic config file',
    '  build         Build library files for Zig modules and Node.js addon',
    '  help          Show this message',
    '',
  ];
  for (const line of lines) {
    console.log(line);
  }
}

try {
  const cmd = process.argv[2];
  switch (cmd) {
    case 'build':
      await buildModules();
      break;
    case 'init':
      await createConfig();
      break;
    case 'help':
    case undefined:
      printHelp();
      break;
    default: 
      throw new Error(`Unrecognized command: ${cmd}`);
  }
} catch (err) {
  console.log(err.message);
  process.exit(1);
} 
