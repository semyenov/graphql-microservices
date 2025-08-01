#!/usr/bin/env bun

// Test script for Products Service CQRS implementation

const PRODUCTS_URL = 'http://localhost:4002/graphql';

// Helper function to make GraphQL requests
async function graphqlRequest(query: string, variables?: Record<string, any>, includeAuth = true) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  if (includeAuth) {
    // For now, we'll skip auth until we figure out proper token generation
    // headers['Authorization'] = 'Bearer ' + token;
  }
  
  const response = await fetch(PRODUCTS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables })
  });

  const data = await response.json();
  return data;
}

// Test queries
const TEST_QUERIES = {
  GET_PRODUCT: `
    query GetProduct($id: ID!) {
      product(id: $id) {
        id
        name
        price
        stock
        description
        category
        sku
        isActive
        tags
        createdAt
        updatedAt
      }
    }
  `,
  
  GET_ALL_PRODUCTS: `
    query GetAllProducts($first: Int, $after: String) {
      products(first: $first, after: $after) {
        products {
          id
          name
          price
          stock
          category
          isActive
          tags
        }
        totalCount
        pageInfo {
          hasNextPage
          hasPreviousPage
        }
      }
    }
  `,
  
  GET_PRODUCTS_BY_CATEGORY: `
    query GetProductsByCategory($category: String!, $first: Int, $after: String) {
      productsByCategory(category: $category, first: $first, after: $after) {
        products {
          id
          name
          price
          category
        }
        totalCount
      }
    }
  `,
  
  CHECK_PRODUCT_AVAILABILITY: `
    query CheckAvailability($id: ID!, $quantity: Int!) {
      checkProductAvailability(id: $id, quantity: $quantity) {
        available
        currentStock
        message
      }
    }
  `
};

// Test mutations
const TEST_MUTATIONS = {
  CREATE_PRODUCT: `
    mutation CreateProduct($input: CreateProductInput!) {
      createProduct(input: $input) {
        id
        name
        price
        stock
        category
        isActive
      }
    }
  `,
  
  UPDATE_PRODUCT: `
    mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
      updateProduct(id: $id, input: $input) {
        id
        name
        price
        stock
        isActive
      }
    }
  `,
  
  UPDATE_STOCK: `
    mutation UpdateStock($id: ID!, $quantity: Int!) {
      updateStock(id: $id, quantity: $quantity) {
        id
        stock
      }
    }
  `,
  
  ACTIVATE_PRODUCT: `
    mutation ActivateProduct($id: ID!) {
      activateProduct(id: $id) {
        id
        isActive
      }
    }
  `,
  
  DEACTIVATE_PRODUCT: `
    mutation DeactivateProduct($id: ID!) {
      deactivateProduct(id: $id) {
        id
        isActive
      }
    }
  `,
  
  BULK_UPDATE_STOCK: `
    mutation BulkUpdateStock($updates: [StockUpdate!]!) {
      bulkUpdateStock(updates: $updates) {
        id
        stock
      }
    }
  `
};

async function runTests() {
  console.log('🧪 Testing Products Service CQRS Implementation\n');
  
  try {
    // First test public queries that don't require authentication
    console.log('📋 Test 0: Testing public queries (no auth required)...');
    const categoriesResult = await graphqlRequest(`
      query GetCategories {
        categories
      }
    `, undefined, false);
    console.log('Categories result:', JSON.stringify(categoriesResult, null, 2));
    
    const allProductsResult = await graphqlRequest(TEST_QUERIES.GET_ALL_PRODUCTS, {
      first: 5
    }, false);
    console.log('All products result:', JSON.stringify(allProductsResult, null, 2));
    console.log();
    
    // Test 1: Create a product
    console.log('📝 Test 1: Creating a new product...');
    const createResult = await graphqlRequest(TEST_MUTATIONS.CREATE_PRODUCT, {
      input: {
        name: 'Test Product CQRS',
        price: 99.99,
        stock: 100,
        description: 'A test product for CQRS implementation',
        category: 'Electronics',
        sku: 'TEST-CQRS-001',
        tags: ['test', 'electronics']
      }
    });
    
    console.log('Result:', JSON.stringify(createResult, null, 2));
    
    if (createResult.errors) {
      console.error('❌ Create product failed:', createResult.errors);
      return;
    }
    
    const productId = createResult.data?.createProduct?.id;
    console.log('✅ Product created with ID:', productId);
    console.log();
    
    // Test 2: Query the created product
    console.log('🔍 Test 2: Querying the created product...');
    const getResult = await graphqlRequest(TEST_QUERIES.GET_PRODUCT, { id: productId });
    console.log('Result:', JSON.stringify(getResult, null, 2));
    console.log();
    
    // Test 3: Update product stock
    console.log('📦 Test 3: Updating product stock...');
    const updateStockResult = await graphqlRequest(TEST_MUTATIONS.UPDATE_STOCK, {
      id: productId,
      quantity: 50
    });
    console.log('Result:', JSON.stringify(updateStockResult, null, 2));
    console.log();
    
    // Test 4: Check product availability
    console.log('✅ Test 4: Checking product availability...');
    const availabilityResult = await graphqlRequest(TEST_QUERIES.CHECK_PRODUCT_AVAILABILITY, {
      id: productId,
      quantity: 30
    });
    console.log('Result:', JSON.stringify(availabilityResult, null, 2));
    console.log();
    
    // Test 5: Deactivate product
    console.log('🔒 Test 5: Deactivating product...');
    const deactivateResult = await graphqlRequest(TEST_MUTATIONS.DEACTIVATE_PRODUCT, {
      id: productId
    });
    console.log('Result:', JSON.stringify(deactivateResult, null, 2));
    console.log();
    
    // Test 6: Query all products
    console.log('📋 Test 6: Querying all products...');
    const allProductsResult2 = await graphqlRequest(TEST_QUERIES.GET_ALL_PRODUCTS, {
      first: 10
    });
    console.log('Result:', JSON.stringify(allProductsResult2, null, 2));
    console.log();
    
    // Test 7: Update product details
    console.log('✏️ Test 7: Updating product details...');
    const updateResult = await graphqlRequest(TEST_MUTATIONS.UPDATE_PRODUCT, {
      id: productId,
      input: {
        name: 'Updated Test Product CQRS',
        price: 149.99,
        description: 'Updated description for CQRS test'
      }
    });
    console.log('Result:', JSON.stringify(updateResult, null, 2));
    console.log();
    
    // Test 8: Activate product again
    console.log('🔄 Test 8: Activating product again...');
    const activateResult = await graphqlRequest(TEST_MUTATIONS.ACTIVATE_PRODUCT, {
      id: productId
    });
    console.log('Result:', JSON.stringify(activateResult, null, 2));
    console.log();
    
    // Test 9: Bulk update stock
    console.log('📦 Test 9: Bulk updating stock...');
    const bulkUpdateResult = await graphqlRequest(TEST_MUTATIONS.BULK_UPDATE_STOCK, {
      updates: [
        { productId: productId, quantity: 75 }
      ]
    });
    console.log('Result:', JSON.stringify(bulkUpdateResult, null, 2));
    console.log();
    
    console.log('🎉 All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the tests
runTests();