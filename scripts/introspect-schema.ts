#!/usr/bin/env bun
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

async function introspectSchema() {
  const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000/graphql';

  console.log(`Introspecting schema from ${GATEWAY_URL}...`);

  try {
    // Introspection query
    const introspectionQuery = {
      query: `
        query IntrospectionQuery {
          __schema {
            queryType { name }
            mutationType { name }
            subscriptionType { name }
            types {
              ...FullType
            }
            directives {
              name
              description
              locations
              args {
                ...InputValue
              }
            }
          }
        }

        fragment FullType on __Type {
          kind
          name
          description
          fields(includeDeprecated: true) {
            name
            description
            args {
              ...InputValue
            }
            type {
              ...TypeRef
            }
            isDeprecated
            deprecationReason
          }
          inputFields {
            ...InputValue
          }
          interfaces {
            ...TypeRef
          }
          enumValues(includeDeprecated: true) {
            name
            description
            isDeprecated
            deprecationReason
          }
          possibleTypes {
            ...TypeRef
          }
        }

        fragment InputValue on __InputValue {
          name
          description
          type { ...TypeRef }
          defaultValue
        }

        fragment TypeRef on __Type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                    ofType {
                      kind
                      name
                      ofType {
                        kind
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
    };

    const response = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(introspectionQuery),
    });

    if (!response.ok) {
      throw new Error(`Failed to introspect schema: ${response.statusText}`);
    }

    const result = (await response.json()) as { errors?: unknown };

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    // Write introspection result to file
    const outputPath = join(process.cwd(), 'schema.json');
    writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`✅ Schema introspection saved to ${outputPath}`);

    // Also save as GraphQL SDL
    const sdlQuery = {
      query: `
        {
          _service {
            sdl
          }
        }
      `,
    };

    const sdlResponse = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sdlQuery),
    });

    if (sdlResponse.ok) {
      const sdlResult = (await sdlResponse.json()) as { data?: { _service?: { sdl?: string } } };
      if (sdlResult.data?._service?.sdl) {
        const sdlPath = join(process.cwd(), 'schema.graphql');
        writeFileSync(sdlPath, sdlResult.data._service.sdl);
        console.log(`✅ Schema SDL saved to ${sdlPath}`);
      }
    }
  } catch (error) {
    console.error('❌ Failed to introspect schema:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  introspectSchema();
}
