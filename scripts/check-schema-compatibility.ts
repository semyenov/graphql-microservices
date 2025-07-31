#!/usr/bin/env bun

/**
 * Check schema compatibility and detect breaking changes
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Change, CriticalityLevel, diff as schemaDiff } from '@graphql-inspector/core';
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader';
import { loadSchema } from '@graphql-tools/load';
import chalk from 'chalk';

interface SchemaVersion {
  version: string;
  date: string;
  schema: string;
}

interface CompatibilityReport {
  service: string;
  breaking: Change[];
  dangerous: Change[];
  safe: Change[];
}

const services = ['users', 'products', 'orders', 'gateway'];
const schemaHistoryPath = '.schema-history';

/**
 * Get current git version/tag
 */
function getCurrentVersion(): string {
  try {
    return execSync('git describe --tags --always', { encoding: 'utf-8' }).trim();
  } catch {
    return 'development';
  }
}

/**
 * Load schema history
 */
function loadSchemaHistory(service: string): SchemaVersion | null {
  const historyFile = join(schemaHistoryPath, `${service}.json`);

  if (!existsSync(historyFile)) {
    return null;
  }

  try {
    const content = readFileSync(historyFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(chalk.red(`Error loading schema history for ${service}:`, error));
    return null;
  }
}

/**
 * Save schema history
 */
function saveSchemaHistory(service: string, schema: string) {
  const historyFile = join(schemaHistoryPath, `${service}.json`);
  const version: SchemaVersion = {
    version: getCurrentVersion(),
    date: new Date().toISOString(),
    schema,
  };

  try {
    if (!existsSync(schemaHistoryPath)) {
      execSync(`mkdir -p ${schemaHistoryPath}`);
    }
    writeFileSync(historyFile, JSON.stringify(version, null, 2));
  } catch (error) {
    console.error(chalk.red(`Error saving schema history for ${service}:`, error));
  }
}

/**
 * Check compatibility for a single service
 */
async function checkServiceCompatibility(service: string): Promise<CompatibilityReport> {
  const report: CompatibilityReport = {
    service,
    breaking: [],
    dangerous: [],
    safe: [],
  };

  try {
    // Load current schema
    const schemaPath = join('services', service, 'schema.graphql');

    if (!existsSync(schemaPath)) {
      console.log(chalk.yellow(`No schema file found for ${service}`));
      return report;
    }

    const currentSchema = await loadSchema(schemaPath, {
      loaders: [new GraphQLFileLoader()],
    });

    // Load previous schema from history
    const previousVersion = loadSchemaHistory(service);

    if (!previousVersion) {
      console.log(chalk.blue(`No previous schema found for ${service} - saving current version`));
      saveSchemaHistory(service, readFileSync(schemaPath, 'utf-8'));
      return report;
    }

    const previousSchema = await loadSchema(previousVersion.schema, {
      loaders: [new GraphQLFileLoader()],
    });

    // Compare schemas
    const changes = await schemaDiff(previousSchema, currentSchema);

    // Categorize changes
    for (const change of changes) {
      switch (change.criticality.level) {
        case CriticalityLevel.Breaking:
          report.breaking.push(change);
          break;
        case CriticalityLevel.Dangerous:
          report.dangerous.push(change);
          break;
        case CriticalityLevel.NonBreaking:
          report.safe.push(change);
          break;
        default:
          break;
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error checking compatibility for ${service}:`, error));
  }

  return report;
}

/**
 * Format change for display
 */
function formatChange(change: Change): string {
  const icon =
    change.criticality.level === CriticalityLevel.Breaking
      ? '❌'
      : change.criticality.level === CriticalityLevel.Dangerous
        ? '⚠️'
        : '✅';

  return `${icon} ${change.message}`;
}

/**
 * Main compatibility check
 */
async function checkCompatibility() {
  console.log(chalk.blue('🔍 Checking Schema Compatibility...\n'));

  const reports: CompatibilityReport[] = [];
  let hasBreakingChanges = false;

  // Check each service
  for (const service of services) {
    console.log(chalk.gray(`Checking ${service}...`));
    const report = await checkServiceCompatibility(service);
    reports.push(report);

    if (report.breaking.length > 0) {
      hasBreakingChanges = true;
    }
  }

  // Display results
  console.log(`\n${chalk.blue('📋 Compatibility Report:\n')}`);

  for (const report of reports) {
    const hasChanges =
      report.breaking.length > 0 || report.dangerous.length > 0 || report.safe.length > 0;

    if (!hasChanges) {
      console.log(chalk.green(`✅ ${report.service}: No changes detected`));
      continue;
    }

    console.log(chalk.bold(`\n${report.service}:`));

    // Breaking changes
    if (report.breaking.length > 0) {
      console.log(chalk.red('\n  Breaking Changes:'));
      report.breaking.forEach((change) => {
        console.log(`    ${formatChange(change)}`);
      });
    }

    // Dangerous changes
    if (report.dangerous.length > 0) {
      console.log(chalk.yellow('\n  Dangerous Changes:'));
      report.dangerous.forEach((change) => {
        console.log(`    ${formatChange(change)}`);
      });
    }

    // Safe changes
    if (report.safe.length > 0) {
      console.log(chalk.green('\n  Safe Changes:'));
      report.safe.forEach((change) => {
        console.log(`    ${formatChange(change)}`);
      });
    }
  }

  // Summary
  const totalBreaking = reports.reduce((sum, r) => sum + r.breaking.length, 0);
  const totalDangerous = reports.reduce((sum, r) => sum + r.dangerous.length, 0);
  const totalSafe = reports.reduce((sum, r) => sum + r.safe.length, 0);

  console.log(`\n${chalk.blue('📊 Summary:')}`);
  console.log(`   Breaking changes: ${totalBreaking}`);
  console.log(`   Dangerous changes: ${totalDangerous}`);
  console.log(`   Safe changes: ${totalSafe}`);

  // Update schema history if no breaking changes
  if (!hasBreakingChanges) {
    console.log(`\n${chalk.green('✅ No breaking changes detected!')}`);

    // Update history
    for (const service of services) {
      const schemaPath = join('services', service, 'schema.graphql');
      if (existsSync(schemaPath)) {
        saveSchemaHistory(service, readFileSync(schemaPath, 'utf-8'));
      }
    }

    console.log(chalk.gray('Schema history updated.'));
  } else {
    console.log(`\n${chalk.red('❌ Breaking changes detected!')}`);
    console.log(chalk.yellow('Please ensure clients are updated before deploying these changes.'));
    process.exit(1);
  }
}

// Add to package.json scripts
const packageJsonPath = 'package.json';
try {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

  if (!packageJson.scripts['schema:validate']) {
    packageJson.scripts['schema:validate'] = 'bun run scripts/validate-schemas.ts';
  }

  if (!packageJson.scripts['schema:check-compatibility']) {
    packageJson.scripts['schema:check-compatibility'] =
      'bun run scripts/check-schema-compatibility.ts';
  }

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
} catch (error) {
  console.error(chalk.yellow('Could not update package.json scripts:', error));
}

// Run compatibility check
checkCompatibility().catch((error) => {
  console.error(chalk.red('Fatal error during compatibility check:'), error);
  process.exit(1);
});
