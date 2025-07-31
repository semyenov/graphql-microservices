#!/usr/bin/env bun

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function main() {
  try {
    // Read the schema.json file
    const schemaPath = join(process.cwd(), 'schema.json');
    const content = await readFile(schemaPath, 'utf-8');
    const data = JSON.parse(content);

    // Extract just the introspection data
    if (data.data?.__schema) {
      // Write the introspection data for gql.tada
      const introspectionPath = join(process.cwd(), 'introspection.json');
      await writeFile(introspectionPath, JSON.stringify({ __schema: data.data.__schema }, null, 2));
      console.log(`✅ Extracted introspection data to ${introspectionPath}`);
    } else {
      console.error('❌ Invalid schema.json format - missing data.__schema');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to extract introspection:', error);
    process.exit(1);
  }
}

main();
