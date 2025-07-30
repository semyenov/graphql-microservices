#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { discoverServices, logError, logStep, logSuccess } from '@shared/utils';

// Extract GraphQL schema from TypeScript file
async function extractSchemaFromFile(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, 'utf-8');

    // Look for gql template literal
    const gqlRegex = /const\s+typeDefs\s*=\s*gql`([\s\S]*?)`;/;
    const match = content.match(gqlRegex);

    if (match && match[1]) {
      // Clean up the schema
      let schema = match[1].trim();

      // Remove template literal expressions like ${authDirective}
      schema = schema.replace(/\$\{[^}]+\}/g, (match) => {
        // Keep the authDirective as a comment
        if (match.includes('authDirective')) {
          return '# Auth directive imported from shared module';
        }
        return '';
      });

      return schema;
    }

    return null;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

// Export schema for a service
async function exportServiceSchema(service: { name: string; file: string; output: string }) {
  logStep(`Extracting ${service.name} schema...`);

  const schema = await extractSchemaFromFile(service.file);

  if (schema) {
    // Ensure output directory exists
    await mkdir(dirname(service.output), { recursive: true });

    // Write schema file
    await writeFile(service.output, schema);
    logSuccess(`Schema exported to ${service.output}`);

    // Also export to the schemas directory
    const schemasDir = './schemas';
    await mkdir(schemasDir, { recursive: true });
    const schemaPath = join(schemasDir, `${service.name}.graphql`);
    await writeFile(schemaPath, schema);
    logSuccess(`Schema also exported to ${schemaPath}`);
  } else {
    logError(`Failed to extract schema from ${service.file}`);
  }
}

// Main function
async function main() {
  console.log('🚀 GraphQL Schema Extraction\n');

  // Discover services dynamically
  const discoveredServices = await discoverServices();
  const services = discoveredServices
    .filter((s) => s.name !== 'gateway') // Skip gateway
    .map((s) => ({
      name: s.name,
      file: join(s.path, 'src/index.ts'),
      output: join(s.path, 'src/schema.graphql'),
    }));

  // Extract all service schemas
  for (const service of services) {
    await exportServiceSchema(service);
    console.log('');
  }

  // Create a combined schema file for codegen
  logStep('Creating combined schema file...');
  const combinedSchemas: string[] = [];

  for (const service of services) {
    const schema = await extractSchemaFromFile(service.file);
    if (schema) {
      combinedSchemas.push(`# ${service.name.toUpperCase()} SERVICE SCHEMA\n${schema}`);
    }
  }

  if (combinedSchemas.length > 0) {
    const combinedPath = './schemas/combined.graphql';
    await writeFile(combinedPath, combinedSchemas.join('\n\n'));
    logSuccess(`Combined schema exported to ${combinedPath}`);
  }

  logSuccess('\nSchema extraction completed!');
}

// Run the script
main().catch((error) => {
  logError(`Script failed: ${error}`);
  process.exit(1);
});
