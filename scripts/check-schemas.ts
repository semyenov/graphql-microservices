#!/usr/bin/env bun

// Script to check what schemas each service is exposing
const services = [
  { name: 'users', url: 'http://localhost:4001/graphql' },
  { name: 'products', url: 'http://localhost:4002/graphql' },
  { name: 'orders', url: 'http://localhost:4003/graphql' },
];

const introspectionQuery = `
  query IntrospectionQuery {
    __schema {
      types {
        name
        kind
        fields {
          name
          type {
            name
            kind
          }
        }
      }
    }
  }
`;

async function checkService(service: { name: string; url: string }) {
  try {
    const response = await fetch(service.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: introspectionQuery }),
    });

    if (!response.ok) {
      console.error(`❌ ${service.name}: HTTP ${response.status}`);
      return;
    }

    const data = (await response.json()) as {
      data?: {
        __schema?: {
          types?: {
            name: string;
            fields: { name: string; type: { name: string; kind: string } }[];
          }[];
        };
      };
    };
    const types = data.data?.__schema?.types || [];

    // Find User type
    const userType = types.find(
      (t: { name: string; fields: { name: string; type: { name: string; kind: string } }[] }) =>
        t.name === 'User'
    );
    if (userType?.fields) {
      console.log(`\n📦 ${service.name} service - User type fields:`);
      userType.fields.forEach((field: { name: string; type: { name: string; kind: string } }) => {
        console.log(`  - ${field.name}: ${field.type.name || field.type.kind}`);
      });
    }

    // Find AuthPayload type
    const authType = types.find(
      (t: { name: string; fields: { name: string; type: { name: string; kind: string } }[] }) =>
        t.name === 'AuthPayload'
    );
    if (authType?.fields) {
      console.log(`\n📦 ${service.name} service - AuthPayload type fields:`);
      authType.fields.forEach((field: { name: string; type: { name: string; kind: string } }) => {
        console.log(`  - ${field.name}: ${field.type.name || field.type.kind}`);
      });
    }

    // Find Query type
    const queryType = types.find(
      (t: { name: string; fields: { name: string; type: { name: string; kind: string } }[] }) =>
        t.name === 'Query'
    );
    if (queryType?.fields) {
      const userQueries = queryType.fields.filter(
        (f: { name: string }) =>
          f.name.toLowerCase().includes('user') ||
          f.name === 'me' ||
          f.name.includes('signIn') ||
          f.name.includes('signUp')
      );
      if (userQueries.length > 0) {
        console.log(`\n📦 ${service.name} service - User-related queries:`);
        userQueries.forEach((field: { name: string }) => {
          console.log(`  - ${field.name}`);
        });
      }
    }

    // Find Mutation type
    const mutationType = types.find(
      (t: { name: string; fields: { name: string; type: { name: string; kind: string } }[] }) =>
        t.name === 'Mutation'
    );
    if (mutationType?.fields) {
      const userMutations = mutationType.fields.filter(
        (f: { name: string }) =>
          f.name.toLowerCase().includes('user') ||
          f.name.includes('sign') ||
          f.name.includes('auth') ||
          f.name.includes('profile') ||
          f.name.includes('password')
      );
      if (userMutations.length > 0) {
        console.log(`\n📦 ${service.name} service - User-related mutations:`);
        userMutations.forEach((field: { name: string }) => {
          console.log(`  - ${field.name}`);
        });
      }
    }
  } catch (error) {
    console.error(`❌ ${service.name}: ${error}`);
  }
}

console.log('🔍 Checking GraphQL schemas exposed by each service...\n');

// Check all services
for (const service of services) {
  await checkService(service);
  console.log(`\n${'='.repeat(50)}`);
}

export {};
