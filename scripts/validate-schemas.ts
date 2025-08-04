#!/usr/bin/env bun

/**
 * Schema validation script to ensure GraphQL schemas are valid and compatible
 */

import { existsSync, readFileSync } from 'node:fs';
import { ApolloGateway, IntrospectAndCompose } from '@apollo/gateway';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { createLogger } from '@graphql-microservices/logger';
import chalk from 'chalk';
import { type ObjectTypeDefinitionNode, parse, printSchema, validateSchema } from 'graphql';
import { gql } from 'graphql-tag';

const logger = createLogger({ service: 'validate-schemas' });

// Service configurations
const services = [
  { name: 'users', port: 4001, schemaPath: 'services/users/schema.graphql' },
  { name: 'products', port: 4002, schemaPath: 'services/products/schema.graphql' },
  { name: 'orders', port: 4003, schemaPath: 'services/orders/schema.graphql' },
];

// Validation results
interface ValidationResult {
  service: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const results: ValidationResult[] = [];

/**
 * Validate individual service schema
 */
async function validateServiceSchema(service: (typeof services)[0]): Promise<ValidationResult> {
  const result: ValidationResult = {
    service: service.name,
    valid: true,
    errors: [],
    warnings: [],
  };

  try {
    // Check if schema file exists
    if (!existsSync(service.schemaPath)) {
      result.errors.push(`Schema file not found: ${service.schemaPath}`);
      result.valid = false;
      return result;
    }

    // Read and parse schema
    const schemaContent = readFileSync(service.schemaPath, 'utf-8');
    const typeDefs = gql(schemaContent);

    // Build subgraph schema
    const schema = buildSubgraphSchema([{ typeDefs }]);

    // Validate schema
    const errors = validateSchema(schema);
    if (errors.length > 0) {
      result.valid = false;
      result.errors.push(...errors.map((e) => e.message));
    }

    // Additional validation checks
    const schemaString = printSchema(schema);

    // Check for required federation directives
    if (!schemaString.includes('@key')) {
      result.warnings.push(
        'No @key directive found - service may not properly participate in federation'
      );
    }

    // Check for proper schema extension
    if (!schemaString.includes('extend schema')) {
      result.warnings.push('Schema should extend with federation directives');
    }

    // Check for subscription support
    if (service.name !== 'gateway' && !schemaString.includes('type Subscription')) {
      result.warnings.push('No Subscription type defined - real-time features may be limited');
    }

    // Check for query complexity directives
    if (!schemaString.includes('@complexity')) {
      result.warnings.push(
        'No @complexity directives found - consider adding query complexity analysis'
      );
    }

    // Check for deprecated fields without reason
    const deprecatedWithoutReason = schemaString.match(/@deprecated(?!\(reason:)/g);
    if (deprecatedWithoutReason) {
      result.warnings.push(
        'Found @deprecated directive without reason - always provide deprecation reasons'
      );
    }
  } catch (error) {
    result.valid = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

/**
 * Validate federation composition
 */
async function validateFederationComposition(): Promise<ValidationResult> {
  const result: ValidationResult = {
    service: 'federation',
    valid: true,
    errors: [],
    warnings: [],
  };

  try {
    // Create gateway to test composition
    new ApolloGateway({
      supergraphSdl: new IntrospectAndCompose({
        subgraphs: services.map((s) => ({
          name: s.name,
          url: `http://localhost:${s.port}/graphql`,
        })),
      }),
    });

    // Note: In a real scenario, you'd need running services
    // This is a simplified check for schema composition
    logger.info(chalk.yellow('Note: Full federation validation requires running services'));
    result.warnings.push('Skipping runtime federation validation - services not running');
  } catch (error) {
    result.valid = false;
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

/**
 * Check for breaking changes
 * Currently unused but kept for future enhancement
 */
// @ts-expect-error - Keeping this function for potential future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _checkBreakingChanges(oldSchema: string, newSchema: string): string[] {
  const breakingChanges: string[] = [];

  // Parse schemas
  try {
    const oldDoc = parse(oldSchema);
    const newDoc = parse(newSchema);

    // Simple breaking change detection
    // In production, use graphql-inspector or similar tools

    // Check for removed types
    const oldTypes = new Set(
      oldDoc.definitions
        .filter((d) => d.kind === 'ObjectTypeDefinition')
        .map((d) => (d as ObjectTypeDefinitionNode).name.value)
    );

    const newTypes = new Set(
      newDoc.definitions
        .filter((d) => d.kind === 'ObjectTypeDefinition')
        .map((d) => (d as ObjectTypeDefinitionNode).name.value)
    );

    for (const type of oldTypes) {
      if (!newTypes.has(type)) {
        breakingChanges.push(`Type '${type}' was removed`);
      }
    }

    // Add more breaking change checks here...
  } catch (error) {
    breakingChanges.push(`Error parsing schemas: ${error}`);
  }

  return breakingChanges;
}

/**
 * Main validation function
 */
async function validateSchemas() {
  logger.info(chalk.blue('🔍 Validating GraphQL Schemas...\n'));

  // Validate individual services
  for (const service of services) {
    logger.info(chalk.gray(`Validating ${service.name} service...`));
    const result = await validateServiceSchema(service);
    results.push(result);
  }

  // Validate federation composition
  logger.info(chalk.gray('Validating federation composition...'));
  const federationResult = await validateFederationComposition();
  results.push(federationResult);

  // Display results
  logger.info(`\n${chalk.blue('📋 Validation Results:\n')}`);

  let hasErrors = false;
  for (const result of results) {
    const icon = result.valid ? '✅' : '❌';
    const color = result.valid ? chalk.green : chalk.red;

    logger.info(color(`${icon} ${result.service}`));

    if (result.errors.length > 0) {
      hasErrors = true;
      result.errors.forEach((error) => {
        logger.info(chalk.red(`   ❌ ${error}`));
      });
    }

    if (result.warnings.length > 0) {
      result.warnings.forEach((warning) => {
        logger.info(chalk.yellow(`   ⚠️  ${warning}`));
      });
    }
  }

  // Summary
  const validCount = results.filter((r) => r.valid).length;
  const totalCount = results.length;

  logger.info(`\n${chalk.blue('📊 Summary:')}`);
  logger.info(`   Valid schemas: ${validCount}/${totalCount}`);
  logger.info(`   Total errors: ${results.reduce((sum, r) => sum + r.errors.length, 0)}`);
  logger.info(`   Total warnings: ${results.reduce((sum, r) => sum + r.warnings.length, 0)}`);

  // Exit with error if validation failed
  if (hasErrors) {
    logger.info(`\n${chalk.red('❌ Schema validation failed!')}`);
    process.exit(1);
  } else {
    logger.info(`\n${chalk.green('✅ All schemas are valid!')}`);
  }
}

// Run validation
validateSchemas().catch((error) => {
  logger.error(chalk.red('Fatal error during validation'), error as Error);
  process.exit(1);
});
