// Shared by production builds and the development watcher.
export const mainBuildOptions = {
  entryPoints: {
    'main/index': 'src/main/index.ts',
    'preload/index': 'src/preload/index.ts',
    'preload/desktop-pet': 'src/preload/desktop-pet.ts',
    'main/library-import': 'src/main/smart-library/import-worker.ts',
    'main/library-evaluation': 'src/main/smart-library/evaluation/evaluation-worker.ts',
    'main/library-question-bank': 'src/main/smart-library/question-bank/bank-worker.ts',
    'main/library-index': 'src/main/smart-library/indexing/index-worker.ts',
    'main/library-vector-storage': 'src/main/smart-library/indexing/vector-storage.ts',
    'main/library-index-retention': 'src/main/smart-library/indexing/index-retention.ts',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', 'node-pty', '@lancedb/lancedb', 'mammoth', 'pdf-parse'],
  outdir: 'dist',
  outExtension: { '.js': '.cjs' },
};
