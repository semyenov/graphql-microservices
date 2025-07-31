import { readFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

export interface ServiceConfig {
  name: string;
  path: string;
  port: number;
  priority: number; // Lower priority starts first
  packageJson?: Record<string, unknown> & {
    name: string;
    version: string;
    description: string;
    main: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

export interface ServiceInfo {
  name: string;
  path: string;
  url: string;
  port: number;
}

// Default ports for known services
const KNOWN_PORTS: Record<string, number> = {
  gateway: 4000,
  users: 4001,
  products: 4002,
  orders: 4003,
};

// Auto-discover services by scanning for package.json files
export async function discoverServices(): Promise<ServiceConfig[]> {
  const services: ServiceConfig[] = [];
  const servicePackages = new Bun.Glob('services/*/package.json').scan();

  let nextPort = 4004; // Start after known services

  for await (const packagePath of servicePackages) {
    try {
      const packageContent = await readFile(packagePath, 'utf-8');
      const packageJson = JSON.parse(packageContent);
      const servicePath = dirname(packagePath);
      const serviceName = packageJson.name
        ? packageJson.name.split('/').pop()
        : basename(servicePath);

      // Gateway gets special treatment - always port 4000 and starts last
      if (serviceName === 'gateway') {
        services.push({
          name: serviceName,
          path: servicePath,
          port: 4000,
          priority: 100, // Start last
          packageJson,
        });
      } else {
        // Assign ports based on service name for consistency
        const port = getServicePort(serviceName, nextPort++);
        services.push({
          name: serviceName,
          path: servicePath,
          port,
          priority: 10, // Regular services start first
          packageJson,
        });
      }
    } catch (error) {
      console.error(`Failed to read package.json at ${packagePath}:`, error);
    }
  }

  // Sort by priority - lower priority starts first
  return services.sort((a, b) => a.priority - b.priority);
}

// Get consistent port for a service
export function getServicePort(serviceName: string, defaultPort: number): number {
  return KNOWN_PORTS[serviceName] || defaultPort;
}

// Get service info for all known services
export function getAllServiceInfo(): Record<string, ServiceInfo> {
  const services: Record<string, ServiceInfo> = {};

  for (const [name, port] of Object.entries(KNOWN_PORTS)) {
    services[name] = {
      name,
      path: `services/${name}`,
      url: `http://localhost:${port}/graphql`,
      port,
    };
  }

  return services;
}

// Check if a service is running
export async function checkServiceHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Discover and check running services
export async function discoverRunningServices(): Promise<ServiceInfo[]> {
  const allServices = getAllServiceInfo();
  const runningServices: ServiceInfo[] = [];

  for (const service of Object.values(allServices)) {
    if (await checkServiceHealth(service.url)) {
      runningServices.push(service);
    }
  }

  return runningServices;
}

// Get service names from directory scan
export async function getServiceNames(): Promise<string[]> {
  const services: string[] = [];
  const servicePackages = new Bun.Glob('services/*/package.json').scan();

  for await (const packagePath of servicePackages) {
    const serviceName = basename(dirname(packagePath));
    services.push(serviceName);
  }

  return services;
}
