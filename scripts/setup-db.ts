#!/usr/bin/env bun

import {
  getServiceDatabaseUrl,
  getServiceNames,
  logError,
  logStep,
  logSuccess,
  startDocker,
  waitForPostgres,
} from '@shared/utils';
import { $ } from 'bun';

console.log('🔧 Setting up databases...\n');

async function main() {
  // Start PostgreSQL and Redis using Docker Compose
  await startDocker();

  // Wait for PostgreSQL to be ready
  const isReady = await waitForPostgres();

  if (!isReady) {
    logError('PostgreSQL failed to start');
    process.exit(1);
  }

  logSuccess('PostgreSQL is ready');

  // Get all services dynamically
  const services = await getServiceNames();

  // Filter only services that have Prisma
  const servicesWithPrisma: string[] = [];
  for (const service of services) {
    try {
      await Bun.file(`services/${service}/prisma/schema.prisma`).text();
      servicesWithPrisma.push(service);
    } catch {
      // Service doesn't have Prisma, skip it
    }
  }

  // Generate Prisma clients
  console.log('\nGenerating Prisma clients...');
  for (const service of servicesWithPrisma) {
    logStep(`Generating client for ${service} service...`);
    await $`cd services/${service} && bunx prisma generate`;
  }

  // Run migrations
  console.log('\nRunning database migrations...');
  for (const service of servicesWithPrisma) {
    logStep(`Running migrations for ${service} service...`);
    const databaseUrl = getServiceDatabaseUrl(service);
    try {
      await $`cd services/${service} && bunx prisma migrate dev --name init`.env({
        DATABASE_URL: databaseUrl,
      });
    } catch (error) {
      logError(`Error running migrations for ${service}: ${error}`);
    }
  }

  logSuccess('\nDatabase setup complete!');
  console.log("\nYou can now run 'bun run dev' to start the services.");
}

main().catch((error) => {
  logError(`Setup failed: ${error}`);
  process.exit(1);
});
