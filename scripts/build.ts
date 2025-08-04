#!/usr/bin/env bun

import { buildAllServices } from '@graphql-microservices/builder';
import { createLogger } from '@graphql-microservices/logger';

const logger = createLogger({ service: 'build-script' });

logger.info('🏗️  Building GraphQL Microservices with tsdown...\n');

async function main() {
  await buildAllServices({
    minify: process.env.NODE_ENV === 'production',
    sourcemap: true,
  });

  logger.info('\n✅ Build complete!');
}

main().catch((error) => {
  logger.error('❌ Build failed', error);
  process.exit(1);
});
