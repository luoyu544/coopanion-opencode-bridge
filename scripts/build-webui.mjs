import { build } from 'esbuild';

await build({
  entryPoints: ['src/webui/client.ts'],
  outfile: 'dist/webui.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  external: ['cortico/*'],
});

console.log('built dist/webui.js');
