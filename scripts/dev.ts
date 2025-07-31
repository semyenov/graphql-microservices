#!/usr/bin/env bun

import { discoverServices, getServiceDatabaseUrl, type ServiceConfig } from '@shared/utils';
import { spawn } from 'bun';

console.log('🚀 Starting GraphQL Microservices...\n');

const processes: Bun.Subprocess[] = [];

// Start a service
async function startService(config: ServiceConfig): Promise<Bun.Subprocess> {
  console.log(`Starting ${config.name} service on port ${config.port}...`);

  // Check if service has a dev script
  if (!config.packageJson?.scripts?.dev) {
    console.warn(`⚠️  Service ${config.name} has no dev script, skipping...`);
    throw new Error(`No dev script for ${config.name}`);
  }

  return spawn(['bun', 'run', 'dev'], {
    cwd: config.path,
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      ...process.env,
      PORT: config.port.toString(),
      SERVICE_NAME: config.name,
      // Service-specific database URL
      DATABASE_URL: getServiceDatabaseUrl(config.name),
    },
  });
}

// Main function
async function main() {
  try {
    const services = await discoverServices();

    if (services.length === 0) {
      console.error('❌ No services found in services/ directory');
      process.exit(1);
    }

    console.log(`📦 Found ${services.length} services:\n`);
    services.forEach((s) => {
      console.log(`  - ${s.name} (port ${s.port})`);
    });
    console.log('');

    // Start services in order
    for (const service of services) {
      try {
        const proc = await startService(service);
        processes.push(proc);

        // Give services time to start before starting the next one
        if (service.name !== 'gateway') {
          await Bun.sleep(1000);
        }
      } catch (error) {
        console.error(`Failed to start ${service.name}:`, error);
      }
    }

    if (processes.length === 0) {
      console.error('❌ No services started successfully');
      process.exit(1);
    }

    console.log(`\n✅ Started ${processes.length} services successfully`);
    console.log('\n🌐 Gateway GraphQL playground: http://localhost:4000/graphql');
  } catch (error) {
    console.error('❌ Failed to start services:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down services...');
  processes.forEach((proc) => proc.kill());
  process.exit();
});

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  processes.forEach((proc) => proc.kill());
  process.exit(1);
});

// Run the main function
main();
