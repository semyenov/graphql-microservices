#!/usr/bin/env bun

import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { getServiceNames, logError, logSuccess } from '@shared/utils';

// Clean schema by removing custom directives that aren't defined
function cleanSchema(schema: string): string {
  // Remove @auth, @public directives
  let cleaned = schema.replace(/@auth(\([^)]*\))?/g, '');
  cleaned = cleaned.replace(/@public/g, '');

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+\n/g, '\n');
  // cleaned = cleaned.replace(/\n\n\n+/g, '\n\n');

  return cleaned;
}

async function cleanSchemaFile(inputPath: string) {
  try {
    const content = await readFile(inputPath, 'utf-8');
    const cleaned = cleanSchema(content);
    await writeFile(inputPath, cleaned, { encoding: 'utf-8', flag: 'w' });
    logSuccess(`Cleaned schema: ${basename(inputPath)} -> ${basename(inputPath)}`);
  } catch (error) {
    logError(`Failed to clean ${basename(inputPath)}: ${error}`);
  }
}

async function main() {
  console.log('🧹 Cleaning GraphQL Schemas\n');

  // Discover services dynamically
  const services = await getServiceNames();
  const schemas = services.filter((s) => s !== 'gateway'); // Skip gateway

  // Clean schemas in the main schemas directory
  for (const schema of schemas) {
    await cleanSchemaFile(join('./schemas', `${schema}.graphql`));
  }

  // Also create individual clean schema files in each service directory
  console.log('\nCreating individual service clean schemas...');
  for (const schema of schemas) {
    const serviceSchemaPath = join('services', schema, 'schema.graphql');
    try {
      await cleanSchemaFile(serviceSchemaPath);
    } catch (error) {
      logError(`Failed to create clean schema for ${schema} service: ${error}`);
    }
  }

  // Create a combined clean schema
  const combinedSchemas: string[] = [];

  for (const schema of schemas) {
    try {
      const content = await readFile(join('./schemas', `${schema}-clean.graphql`), 'utf-8');
      combinedSchemas.push(`# ${schema.toUpperCase()} SERVICE SCHEMA\n${content}`);
    } catch (error) {
      logError(`Failed to read ${schema}-clean.graphql: ${error}`);
    }
  }

  if (combinedSchemas.length > 0) {
    await writeFile('./schemas/combined-clean.graphql', combinedSchemas.join('\n\n'));
    logSuccess('\nCreated combined clean schema: ./schemas/combined-clean.graphql');
  }
}

main().catch((error) => {
  logError(`Script failed: ${error}`);
  process.exit(1);
});
