import { graphql } from './graphql';

// Authentication mutations
export const SIGN_UP = graphql(`
  mutation SignUp($input: SignUpInput!) {
    signUp(input: $input) {
      user {
        id
        username
        email
        name
        role
      }
      accessToken
      refreshToken
    }
  }
`);

export const SIGN_IN = graphql(`
  mutation SignIn($input: SignInInput!) {
    signIn(input: $input) {
      user {
        id
        username
        email
        name
        role
      }
      accessToken
      refreshToken
    }
  }
`);

export const REFRESH_TOKEN = graphql(`
  mutation RefreshToken($refreshToken: String!) {
    refreshToken(refreshToken: $refreshToken) {
      user {
        id
        username
        email
        name
        role
      }
      accessToken
      refreshToken
    }
  }
`);

export const SIGN_OUT = graphql(`
  mutation SignOut {
    signOut
  }
`);

// User mutations
export const UPDATE_USER = graphql(`
  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
    updateUser(id: $id, input: $input) {
      id
      username
      email
      name
      phoneNumber
      role
      isActive
      updatedAt
    }
  }
`);

export const UPDATE_PROFILE = graphql(`
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      id
      username
      email
      name
      phoneNumber
      updatedAt
    }
  }
`);

export const CHANGE_PASSWORD = graphql(`
  mutation ChangePassword($input: ChangePasswordInput!) {
    changePassword(input: $input)
  }
`);

export const DEACTIVATE_USER = graphql(`
  mutation DeactivateUser($id: ID!) {
    deactivateUser(id: $id) {
      id
      username
      isActive
    }
  }
`);

// Product mutations
export const CREATE_PRODUCT = graphql(`
  mutation CreateProduct($input: CreateProductInput!) {
    createProduct(input: $input) {
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
    }
  }
`);

export const UPDATE_PRODUCT = graphql(`
  mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
    updateProduct(id: $id, input: $input) {
      id
      name
      description
      price
      sku
      category
      tags
      stock
      isActive
      updatedAt
    }
  }
`);

export const DEACTIVATE_PRODUCT = graphql(`
  mutation DeactivateProduct($id: ID!) {
    deactivateProduct(id: $id) {
      id
      isActive
    }
  }
`);

export const UPDATE_STOCK = graphql(`
  mutation UpdateStock($id: ID!, $quantity: Int!) {
    updateStock(id: $id, quantity: $quantity) {
      id
      stock
      updatedAt
    }
  }
`);

// Order mutations
export const CREATE_ORDER = graphql(`
  mutation CreateOrder($input: CreateOrderInput!) {
    createOrder(input: $input) {
      id
      orderNumber
      status
      total
      createdAt
      customerId
      customerName
      customerEmail
      items {
        id
        quantity
        unitPrice
        productName
        product {
          id
          name
          price
        }
      }
    }
  }
`);

export const UPDATE_ORDER_STATUS = graphql(`
  mutation UpdateOrderStatus($id: ID!, $status: OrderStatus!) {
    updateOrderStatus(id: $id, status: $status) {
      id
      status
      updatedAt
    }
  }
`);

export const CANCEL_ORDER = graphql(`
  mutation CancelOrder($id: ID!, $reason: String) {
    cancelOrder(id: $id, reason: $reason) {
      id
      status
      updatedAt
    }
  }
`);
