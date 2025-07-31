#!/usr/bin/env bun

import { discoverServices, logError, logStep, logSuccess } from '@shared/utils';
import { $ } from 'bun';

console.log('📝 Generating TypeScript declarations...\n');

async function generateTypes() {
  const services = await discoverServices();

  for (const service of services) {
    logStep(`Generating types for ${service.name}...`);
    try {
      // Use TypeScript compiler directly to generate declaration files
      // Exclude test files to avoid compilation errors
      await $`cd ${service.path} && bunx tsc src/index.ts --declaration --emitDeclarationOnly --outDir dist --skipLibCheck --module esnext --target esnext --moduleResolution bundler --allowImportingTsExtensions false --noEmit false --types node`;
      logSuccess(`Generated types for ${service.name}`);
    } catch (error) {
      logError(`Failed to generate types for ${service.name}: ${error}`);
      // Continue with other services even if one fails
    }
  }

  console.log('\n✅ Type generation complete!');
}

generateTypes().catch((error) => {
  console.error('❌ Type generation failed:', error);
  process.exit(1);
});
