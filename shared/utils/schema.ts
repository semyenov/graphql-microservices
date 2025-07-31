import { writeFile } from 'node:fs/promises';
import type { IntrospectionQuery } from 'graphql';
import { buildClientSchema, getIntrospectionQuery, printSchema } from 'graphql';

export interface SchemaFetchOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

// Query to get SDL (Schema Definition Language) for federated services
export const SDL_QUERY = `
  query IntrospectionQuery {
    _service {
      sdl
    }
  }
`;

// Fetch schema from a GraphQL endpoint
export async function fetchSchema(
  url: string,
  query: string,
  options: SchemaFetchOptions = {}
): Promise<{ data?: Record<string, unknown>; errors?: unknown }> {
  try {
    const { headers = {}, timeout = 30000 } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'POST',
      headers: [['Content-Type', 'application/json'], ...Object.entries(headers)],
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    return data;
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${options.timeout}ms`);
      }
      throw new Error(`Failed to fetch schema from ${url}: ${error.message}`);
    }
    throw new Error(`Failed to fetch schema from ${url}: ${String(error)}`);
  }
}

// Fetch introspection schema
export async function fetchIntrospectionSchema(
  url: string,
  options?: SchemaFetchOptions
): Promise<IntrospectionQuery> {
  const result = await fetchSchema(url, getIntrospectionQuery(), options);

  if (!result.data) {
    throw new Error('Invalid introspection result');
  }

  return result.data as unknown as IntrospectionQuery;
}

// Fetch SDL schema (for federated services)
export async function fetchSDLSchema(
  url: string,
  options?: SchemaFetchOptions
): Promise<string | null> {
  try {
    const result = await fetchSchema(url, SDL_QUERY, options);
    return (result.data as { _service?: { sdl?: string } })?._service?.sdl || null;
  } catch {
    return null;
  }
}

// Convert introspection to SDL
export function introspectionToSDL(introspection: IntrospectionQuery): string {
  const schema = buildClientSchema(introspection);
  return printSchema(schema);
}

// Save schema to file
export async function saveSchema(path: string, content: string | object): Promise<void> {
  const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

  await writeFile(path, data);
}

// Export schema in multiple formats
export async function exportSchema(
  url: string,
  outputPath: string,
  format: 'sdl' | 'json' | 'both' = 'both',
  options?: SchemaFetchOptions
): Promise<void> {
  // Try to get SDL first (for federated services)
  const sdl = await fetchSDLSchema(url, options);

  if (sdl && (format === 'sdl' || format === 'both')) {
    await saveSchema(`${outputPath}.graphql`, sdl);
  }

  // Get introspection
  if (format === 'json' || format === 'both' || !sdl) {
    const introspection = await fetchIntrospectionSchema(url, options);

    if (format === 'json' || format === 'both') {
      await saveSchema(`${outputPath}.json`, introspection);
    }

    // Generate SDL from introspection if we don't have it
    if (!sdl && (format === 'sdl' || format === 'both')) {
      const generatedSDL = introspectionToSDL(introspection);
      await saveSchema(`${outputPath}.graphql`, generatedSDL);
    }
  }
}
