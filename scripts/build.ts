#!/usr/bin/env bun

import { buildAllServices } from '@graphql-microservices/builder';

console.log('🏗️  Building GraphQL Microservices with tsdown...\n');

async function main() {
  await buildAllServices({
    minify: process.env.NODE_ENV === 'production',
    sourcemap: true,
  });

  console.log('\n✅ Build complete!');
}

main().catch((error) => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});
