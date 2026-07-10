import { defineConfig } from 'vitest/config';
import path from 'path';

// Deliberately separate from the root vitest.config.ts: its include
// pattern only matches *.live-eval.ts, so these tests can NEVER be swept
// into a plain `vitest run` / `npm test` by accident (the root config's
// default include glob is *.{test,spec}.ts, which doesn't match this
// suffix). Run explicitly via `npm run eval:live`.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '..', '..') } },
  test: {
    environment: 'node',
    include: ['eval/live/**/*.live-eval.ts'],
  },
});
