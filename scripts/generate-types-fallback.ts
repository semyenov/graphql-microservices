#!/usr/bin/env bun

import { discoverServices, logError, logStep, logSuccess } from '@shared/utils';
import { $ } from 'bun';

console.log('📝 Generating TypeScript declarations (fallback mode)...\n');

async function generateTypes() {
  const services = await discoverServices();
  const successCount = { count: 0 };
  const totalServices = services.length;

  for (const service of services) {
    logStep(`Generating types for ${service.name}...`);
    try {
      // Try with strict type checking first
      await $`cd ${service.path} && bunx tsc src/index.ts --declaration --emitDeclarationOnly --outDir dist --skipLibCheck --module esnext --moduleResolution bundler --allowImportingTsExtensions false --noEmit false`.quiet();
      logSuccess(`Generated types for ${service.name}`);
      successCount.count++;
    } catch (_strictError) {
      try {
        // Fallback: Try with more lenient options
        await $`cd ${service.path} && bunx tsc src/index.ts --declaration --emitDeclarationOnly --outDir dist --skipLibCheck --module esnext --moduleResolution bundler --allowImportingTsExtensions false --noEmit false --isolatedModules false --strict false`.quiet();
        logSuccess(`Generated types for ${service.name} (with relaxed checking)`);
        successCount.count++;
      } catch (_fallbackError) {
        try {
          // Last resort: Use tsdown builder to generate declarations
          await $`cd ${service.path} && bunx @graphql-microservices/builder --dts-only`.quiet();
          logSuccess(`Generated types for ${service.name} (using tsdown)`);
          successCount.count++;
        } catch (_finalError) {
          logError(`Failed to generate types for ${service.name}: All methods failed`);
          // Continue with other services even if one fails
        }
      }
    }
  }

  console.log(
    `\n✅ Type generation complete! Successfully generated types for ${successCount.count}/${totalServices} services.`
  );

  if (successCount.count < totalServices) {
    console.log(
      '\n⚠️  Some services failed type generation. Consider fixing TypeScript errors in those services.'
    );
    process.exit(1);
  }
}

generateTypes().catch((error) => {
  console.error('❌ Type generation failed:', error);
  process.exit(1);
});
