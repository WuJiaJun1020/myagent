import { build } from 'esbuild';
import { mainBuildOptions } from '../scripts/main-build-options.mjs';
await build({ ...mainBuildOptions, entryPoints: { 'testing/packaged-smoke': 'tests/integration/packaged-smoke.ts' } });
