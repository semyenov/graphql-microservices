import { graphql } from './graphql';

// User queries
export const GET_USER = graphql(`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      username
      email
      name
      phoneNumber
      role
      isActive
      createdAt
      updatedAt
    }
  }
`);

export const GET_USERS = graphql(`
  query GetUsers {
    users {
      id
      username
      email
      name
      phoneNumber
      role
      isActive
      createdAt
      updatedAt
    }
  }
`);

export const GET_ME = graphql(`
  query GetMe {
    me {
      id
      username
      email
      name
      phoneNumber
      role
      isActive
      createdAt
      updatedAt
    }
  }
`);

// Product queries
export const GET_PRODUCT = graphql(`
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      name
      description
      price
      sku
      category
      tags
      stock
      isActive
      createdAt
      updatedAt
    }
  }
`);

export const GET_PRODUCTS = graphql(`
  query GetProducts($category: String, $isActive: Boolean) {
    products(category: $category, isActive: $isActive) {
      products {
        id
        name
        description
        price
        sku
        category
        tags
        stock
        isActive
      }
      totalCount
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`);

// Order queries with federation
export const GET_ORDER_WITH_DETAILS = graphql(`
  query GetOrderWithDetails($id: ID!) {
    order(id: $id) {
      id
      status
      total
      createdAt
      updatedAt
      user {
        id
        username
        email
        name
      }
      items {
        id
        quantity
        price
        product {
          id
          name
          description
          price
        }
      }
    }
  }
`);

export const GET_MY_ORDERS = graphql(`
  query GetMyOrders {
    myOrders {
      orders {
        id
        status
        total
        createdAt
        items {
          id
          quantity
          price
          product {
            id
            name
            price
          }
        }
      }
      totalCount
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`);

// User orders (federation example)
export const GET_USER_WITH_ORDERS = graphql(`
  query GetUserWithOrders($id: ID!) {
    user(id: $id) {
      id
      username
      email
      name
      orders {
        id
        status
        total
        createdAt
        items {
          id
          quantity
          price
          product {
            id
            name
          }
        }
      }
    }
  }
`);
