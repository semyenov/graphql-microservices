import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/c12.ts', 'src/schemas.ts'],
  format: ['esm'],
  platform: 'neutral',
  dts: true,
  clean: true,
  sourcemap: true,
  external: [/^@graphql-microservices\//],
});
