import { execa } from 'execa';

export interface DockerOptions {
  compose?: string;
  service?: string;
  quiet?: boolean;
}

// Wait for PostgreSQL to be ready
export async function waitForPostgres(
  containerName = 'graphql-microservices-postgres-1',
  maxAttempts = 30
): Promise<boolean> {
  console.log('Waiting for PostgreSQL to be ready...');

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    try {
      await execa('docker', ['exec', containerName, 'pg_isready', '-U', 'postgres'], {
        stdio: 'ignore',
      });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return false;
}

// Start docker compose services
export async function startDocker(options: DockerOptions = {}): Promise<void> {
  const { compose = 'docker-compose.dev.yml', quiet = false } = options;

  if (!quiet) {
    console.log('Starting Docker services...');
  }

  await execa('docker', ['compose', '-f', compose, 'up', '-d']);
}

// Stop docker compose services
export async function stopDocker(options: DockerOptions = {}): Promise<void> {
  const { compose = 'docker-compose.dev.yml', quiet = false } = options;

  if (!quiet) {
    console.log('Stopping Docker services...');
  }

  await execa('docker', ['compose', '-f', compose, 'down']);
}

// Check if a docker container is running
export async function isContainerRunning(containerName: string): Promise<boolean> {
  try {
    const result = await execa(
      'docker',
      ['ps', '--filter', `name=${containerName}`, '--format', '{{.Names}}'],
      {
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    );
    return result.stdout.trim() === containerName;
  } catch {
    return false;
  }
}

// Get database URL for a service
export function getServiceDatabaseUrl(serviceName: string, baseUrl?: string): string {
  const defaultBaseUrl = 'postgresql://postgres:postgres@localhost:5432';
  const url = baseUrl || process.env.DATABASE_URL || defaultBaseUrl;

  // Replace the database name with service-specific one
  return url.replace(/\/[^/]+$/, `/${serviceName}_db`);
}
