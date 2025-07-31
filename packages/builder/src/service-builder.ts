import { discoverServices, logError, logStep, logSuccess, type ServiceConfig } from '@shared/utils';
import { build } from 'tsdown';
import { createServiceConfig } from './config.js';
import type { BuildOptions } from './types.js';

export async function buildService(
  service: ServiceConfig,
  options: BuildOptions = {}
): Promise<void> {
  logStep(`Building ${service.name}...`);

  try {
    const config = createServiceConfig(service.path, options);
    await build(config);
    logSuccess(`Built ${service.name}`);
  } catch (error) {
    logError(`Failed to build ${service.name}: ${error}`);
    throw error;
  }
}

export async function buildAllServices(options: BuildOptions = {}): Promise<void> {
  const services = await discoverServices();

  for (const service of services) {
    await buildService(service, options);
  }
}

export async function buildSpecificService(
  serviceName: string,
  options: BuildOptions = {}
): Promise<void> {
  const services = await discoverServices();
  const service = services.find((s) => s.name === serviceName);

  if (!service) {
    throw new Error(`Service '${serviceName}' not found`);
  }

  await buildService(service, options);
}
