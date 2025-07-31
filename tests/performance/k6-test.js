import { check, sleep } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const queryComplexityRate = new Rate('query_complexity_exceeded');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 20 }, // Ramp up to 20 users
    { duration: '1m', target: 50 }, // Stay at 50 users
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '2m', target: 100 }, // Stay at 100 users
    { duration: '1m', target: 0 }, // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'], // 95% of requests under 500ms
    errors: ['rate<0.1'], // Error rate under 10%
    query_complexity_exceeded: ['rate<0.05'], // Complexity errors under 5%
  },
};

const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:4000/graphql';

// Test queries
const queries = {
  simple: {
    query: `
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          username
          email
        }
      }
    `,
    variables: { id: 'user-1' },
  },

  medium: {
    query: `
      query GetUserWithOrders($id: ID!) {
        user(id: $id) {
          id
          username
          email
          orders(first: 10) {
            id
            totalAmount
            status
            createdAt
          }
        }
      }
    `,
    variables: { id: 'user-1' },
  },

  complex: {
    query: `
      query GetUserWithFullDetails($id: ID!) {
        user(id: $id) {
          id
          username
          email
          orders(first: 20) {
            id
            totalAmount
            status
            items {
              id
              quantity
              unitPrice
              product {
                id
                name
                price
                category
              }
            }
          }
        }
      }
    `,
    variables: { id: 'user-1' },
  },

  list: {
    query: `
      query GetUsers($first: Int!) {
        users(first: $first) {
          id
          username
          email
          createdAt
        }
      }
    `,
    variables: { first: 20 },
  },

  search: {
    query: `
      query SearchProducts($query: String!, $limit: Int) {
        searchProducts(query: $query, limit: $limit) {
          id
          name
          price
          category
          inStock
        }
      }
    `,
    variables: { query: 'laptop', limit: 10 },
  },

  mutation: {
    query: `
      mutation CreateProduct($input: CreateProductInput!) {
        createProduct(input: $input) {
          id
          name
          price
          inStock
        }
      }
    `,
    variables: {
      input: {
        name: `Test Product ${Date.now()}`,
        price: 99.99,
        category: 'TEST',
        inStock: true,
      },
    },
  },
};

// Helper function to make GraphQL requests
function graphqlRequest(_name, query, variables) {
  const payload = JSON.stringify({
    query: query.query,
    variables: variables || query.variables,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  const response = http.post(GATEWAY_URL, payload, params);

  // Check response
  const success = check(response, {
    'status is 200': (r) => r.status === 200,
    'no errors': (r) => !JSON.parse(r.body).errors,
    'has data': (r) => JSON.parse(r.body).data !== null,
  });

  errorRate.add(!success);

  // Check for complexity errors
  if (response.status === 200) {
    const body = JSON.parse(response.body);
    if (body.errors?.some((e) => e.message.includes('complexity'))) {
      queryComplexityRate.add(1);
    } else {
      queryComplexityRate.add(0);
    }
  }

  return response;
}

// Main test scenario
export default function () {
  // Random distribution of query types
  const rand = Math.random();

  if (rand < 0.4) {
    // 40% simple queries
    graphqlRequest('simple', queries.simple);
  } else if (rand < 0.7) {
    // 30% medium queries
    graphqlRequest('medium', queries.medium);
  } else if (rand < 0.85) {
    // 15% list queries
    graphqlRequest('list', queries.list);
  } else if (rand < 0.95) {
    // 10% search queries
    graphqlRequest('search', queries.search);
  } else if (rand < 0.98) {
    // 3% complex queries
    graphqlRequest('complex', queries.complex);
  } else {
    // 2% mutations
    graphqlRequest('mutation', queries.mutation);
  }

  sleep(1); // Think time between requests
}

// Setup function - runs once per VU
export function setup() {
  // Test gateway health
  const healthCheck = http.get(GATEWAY_URL.replace('/graphql', '/health'));
  check(healthCheck, {
    'gateway is healthy': (r) => r.status === 200,
  });

  return { startTime: new Date().toISOString() };
}

// Teardown function - runs once after all iterations
export function teardown(data) {
  console.log(`Test completed. Started at: ${data.startTime}`);
}
