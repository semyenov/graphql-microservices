#!/usr/bin/env bun

import { join } from 'node:path';
import {
  checkServiceHealth,
  exportSchema,
  getAllServiceInfo,
  logError,
  logStep,
  logSuccess,
  logWarning,
  type ServiceInfo,
} from '@shared/utils';

interface ExportOptions {
  service?: string;
  format?: 'sdl' | 'json' | 'both';
  output?: string;
}

async function exportServiceSchema(service: ServiceInfo, format: string, outputDir: string) {
  logStep(`Exporting ${service.name} schema...`);

  try {
    const outputPath = join(outputDir, service.name);
    await exportSchema(service.url, outputPath, format as 'sdl' | 'json' | 'both');

    if (format === 'sdl' || format === 'both') {
      logSuccess(`SDL exported to ${outputPath}.graphql`);
    }
    if (format === 'json' || format === 'both') {
      logSuccess(`JSON exported to ${outputPath}.json`);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      logError(`Failed to export ${service.name} schema: ${error.message}`);
    } else {
      logError(`Failed to export ${service.name} schema: ${String(error)}`);
    }
  }
}

async function exportGatewaySchema(format: string, outputDir: string) {
  const services = getAllServiceInfo();
  const gateway = services.gateway;

  if (!gateway) {
    throw new Error('Gateway service not found. Make sure the gateway service is configured.');
  }

  console.log(`🌐 Exporting federated gateway schema...`);

  try {
    const outputPath = join(outputDir, 'schema');
    await exportSchema(gateway.url, outputPath, format as 'sdl' | 'json' | 'both');

    if (format === 'json' || format === 'both') {
      logSuccess(`Introspection JSON exported to ${outputPath}.json`);
    }
    if (format === 'sdl' || format === 'both') {
      logSuccess(`SDL exported to ${outputPath}.graphql`);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      logError(`Failed to export gateway schema: ${error.message}`);
    } else {
      logError(`Failed to export gateway schema: ${String(error)}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options: ExportOptions = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--service':
      case '-s':
        options.service = args[++i];
        break;
      case '--format':
      case '-f':
        options.format = args[++i] as 'sdl' | 'json' | 'both';
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
GraphQL Schema Export Script

Usage: bun run scripts/export-schema.ts [options]

Options:
  -s, --service <name>   Service to export (gateway, users, products, orders, all)
                         Default: gateway
  -f, --format <type>    Export format (sdl, json, both)
                         Default: both
  -o, --output <dir>     Output directory
                         Default: ./schemas
  -h, --help            Show this help message

Examples:
  # Export gateway schema in both formats
  bun run scripts/export-schema.ts

  # Export only users service SDL
  bun run scripts/export-schema.ts -s users -f sdl

  # Export all services
  bun run scripts/export-schema.ts -s all

  # Export to custom directory
  bun run scripts/export-schema.ts -o ./my-schemas
`);
        process.exit(0);
    }
  }

  // Set defaults
  const service = options.service || 'gateway';
  const format = options.format || 'both';
  const outputDir = options.output || './schemas';

  // Create output directory
  await Bun.write(join(outputDir, '.gitkeep'), '');

  console.log(`🚀 GraphQL Schema Export\n`);
  console.log(`📁 Output directory: ${outputDir}`);
  console.log(`📄 Format: ${format}\n`);

  const allServices = getAllServiceInfo();

  // Export schemas based on service selection
  if (service === 'all') {
    // Check which services are running
    const runningServices: ServiceInfo[] = [];
    for (const serviceInfo of Object.values(allServices)) {
      if (await checkServiceHealth(serviceInfo.url)) {
        runningServices.push(serviceInfo);
      } else {
        logWarning(`${serviceInfo.name} service is not running at ${serviceInfo.url}`);
      }
    }

    if (runningServices.length === 0) {
      logError('\nNo services are running. Please start services with: bun run dev');
      process.exit(1);
    }

    // Export all running services
    for (const svc of runningServices) {
      await exportServiceSchema(svc, format, outputDir);
      console.log('');
    }
  } else if (service === 'gateway') {
    // Check if gateway is running
    if (!allServices.gateway || !(await checkServiceHealth(allServices.gateway.url))) {
      logError('Gateway is not running. Please start it with: bun run dev');
      process.exit(1);
    }
    await exportGatewaySchema(format, outputDir);
  } else if (service in allServices) {
    // Export specific service
    const serviceInfo = allServices[service];
    if (!serviceInfo) {
      logError(`Service '${service}' not found.`);
      process.exit(1);
    }
    if (!(await checkServiceHealth(serviceInfo.url))) {
      logError(`${serviceInfo.name} service is not running. Please start it with: bun run dev`);
      process.exit(1);
    }
    await exportServiceSchema(serviceInfo, format, outputDir);
  } else {
    logError(`Unknown service: ${service}`);
    console.log('Available services: gateway, users, products, orders, all');
    process.exit(1);
  }

  console.log('\n✅ Schema export completed!');
}

// Run the script
main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
