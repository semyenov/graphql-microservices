import type { Options } from 'tsdown';
import { defineConfig } from 'tsdown';
import type { BuildOptions } from './types.js';

export function createServiceConfig(servicePath: string, options: BuildOptions = {}): Options {
  return defineConfig({
    entry: [`${servicePath}/src/index.ts`],
    outDir: `${servicePath}/dist`,
    format: options.format || 'esm',
    platform: 'node',
    clean: true,
    dts: true,
    sourcemap: options.sourcemap ?? true,
    minify: options.minify ?? false,
    external: [/^@graphql-microservices\//, /^@apollo\//, /^@prisma\//, 'graphql', 'dataloader', 'tsdown'],
    // Enable shims for __dirname and __filename in ESM
    shims: true,
  });
}
