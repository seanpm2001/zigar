import Replace from '@rollup/plugin-replace';
import { readdirSync, writeFileSync } from 'fs';
import { basename, dirname, join, sep } from 'path';

const config = [];
const plugins = [
  Replace({
    preventAssignment: true,
    values: {
      'process.env.DEV': 'false',
      'process.env.TARGET': '"wasm"',
    },
  })
];
const mixins = {};

for (const subpath of readdirSync('./src', { recursive: true })) {
  const filename = basename(subpath);
  const folder = dirname(subpath);
  if (/\.js$/.test(filename)) {
    if (folder !== '.') {
      const prefix = folder.slice(0, -1).replace(/^./, m => m.toUpperCase());
      const name = prefix + filename.slice(0, -3)
                              .replace(/\-./g, m => m.slice(1).toUpperCase())
                              .replace(/^./, m => m.toUpperCase());
      mixins[name] = `./${subpath.split(sep).join('/')}`;
    }
    config.push({
      external: () => true,
      input: join('./src', subpath),
      output: {
        file: join('./dist', subpath),
        format: 'esm',
      },
      plugins,
    });
  }
}

const lines = [ '// generated by rollup.config.js' ];
for (const [ name, path ] of Object.entries(mixins)) {
  lines.push(`export { default as ${name} } from '${path}';`);
}
writeFileSync('./src/mixins.js', lines.join('\n') + '\n');

export default config;
