import { build } from 'esbuild'
await build({ entryPoints: ['demo/preview.jsx'], outfile: 'demo/preview.js', bundle: true, minify: true, define: { 'process.env.NODE_ENV': '"production"' } })
