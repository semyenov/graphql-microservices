import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

export interface HealthCheck {
  name: string;
  check: () => Promise<boolean>;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail';
      message?: string;
    };
  };
}

export class HealthCheckService {
  private startTime = Date.now();

  constructor(
    private serviceName: string,
    private version: string = '1.0.0',
    private checks: HealthCheck[] = []
  ) {}

  addCheck(check: HealthCheck) {
    this.checks.push(check);
  }

  async getHealth(): Promise<HealthStatus> {
    const checkResults: HealthStatus['checks'] = {};
    let allHealthy = true;

    for (const check of this.checks) {
      try {
        const isHealthy = await check.check();
        checkResults[check.name] = {
          status: isHealthy ? 'pass' : 'fail',
        };
        if (!isHealthy) allHealthy = false;
      } catch (error) {
        checkResults[check.name] = {
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
        allHealthy = false;
      }
    }

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      version: this.version,
      uptime: Date.now() - this.startTime,
      checks: checkResults,
    };
  }

  async handleHealthRequest(req: IncomingMessage, res: ServerResponse) {
    if (req.url === '/health' && req.method === 'GET') {
      const health = await this.getHealth();
      const statusCode = health.status === 'healthy' ? 200 : 503;

      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health, null, 2));
      return true;
    }

    if (req.url === '/health/live' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'alive' }));
      return true;
    }

    if (req.url === '/health/ready' && req.method === 'GET') {
      const health = await this.getHealth();
      const isReady = health.status === 'healthy';

      res.writeHead(isReady ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: isReady }));
      return true;
    }

    return false;
  }
}

// Common health checks
export const createDatabaseCheck = (prisma: PrismaClient): HealthCheck => ({
  name: 'database',
  check: async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  },
});

export const createRedisCheck = (redis: Redis): HealthCheck => ({
  name: 'redis',
  check: async () => {
    try {
      await redis.ping();
      return true;
    } catch {
      return false;
    }
  },
});

export const createServiceCheck = (url: string): HealthCheck => ({
  name: `service-${url}`,
  check: async () => {
    try {
      const response = await fetch(`${url}/health/live`);
      return response.ok;
    } catch {
      return false;
    }
  },
});
