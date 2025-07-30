#!/usr/bin/env bun

import { spawn } from 'node:child_process';
import { logError, logStep, logSuccess } from '@shared/utils';

async function runCommand(command: string, args: string[] = []) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function main() {
  console.log('🚀 Updating GraphQL Schemas and Types\n');

  try {
    // Step 1: Extract schemas from TypeScript files
    logStep('Step 1: Extracting schemas from service files...\n');
    await runCommand('bun', ['run', 'scripts/extract-schemas.ts']);

    // Step 2: Clean schemas (remove custom directives)
    logStep('\nStep 2: Cleaning schemas...\n');
    await runCommand('bun', ['run', 'scripts/clean-schemas.ts']);

    // Step 3: Run GraphQL Codegen
    logStep('\nStep 3: Running GraphQL Codegen...\n');
    await runCommand('bun', ['run', 'codegen']);

    logSuccess('\nAll schemas and types updated successfully!');
    console.log('\n📁 Generated files:');
    console.log('   - services/*/src/generated/graphql.ts');
    console.log('   - shared/graphql/generated/client-types.ts');
    console.log('   - schemas/*.graphql (extracted schemas)');
    console.log('   - schemas/*-clean.graphql (cleaned schemas for codegen)');
  } catch (error) {
    logError(`Update failed: ${error}`);
    process.exit(1);
  }
}

main();
