#!/usr/bin/env bun

import { discoverServices, logStep, logSuccess } from '@shared/utils';
import { $ } from 'bun';

console.log('🏗️  Building GraphQL Microservices...\n');

async function main() {
  const services = await discoverServices();

  for (const service of services) {
    logStep(`Building ${service.name}...`);
    await $`cd ${service.path} && bun build src/index.ts --outdir=dist --target=bun`;
    logSuccess(`Built ${service.name}`);
  }

  console.log('\n✅ Build complete!');
}

main().catch((error) => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});
