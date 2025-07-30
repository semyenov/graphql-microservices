export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = {
  [_ in K]?: never;
};
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
};

export type AuthPayload = {
  __typename?: 'AuthPayload';
  accessToken: Scalars['String']['output'];
  refreshToken: Scalars['String']['output'];
  user: User;
};

export type ChangePasswordInput = {
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
};

export type CreateOrderInput = {
  items: Array<OrderItemInput>;
  notes?: InputMaybe<Scalars['String']['input']>;
  shippingInfo: ShippingInfoInput;
};

export type CreateProductInput = {
  category: Scalars['String']['input'];
  description: Scalars['String']['input'];
  imageUrl?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  price: Scalars['Float']['input'];
  sku: Scalars['String']['input'];
  stock: Scalars['Int']['input'];
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type Mutation = {
  __typename?: 'Mutation';
  activateProduct: Product;
  bulkUpdateStock: Array<Product>;
  cancelOrder: Order;
  changePassword: Scalars['Boolean']['output'];
  createOrder: Order;
  createProduct: Product;
  deactivateProduct: Product;
  deactivateUser: User;
  refreshToken: AuthPayload;
  refundOrder: Order;
  signIn: AuthPayload;
  signOut: Scalars['Boolean']['output'];
  signUp: AuthPayload;
  updateOrderNotes: Order;
  updateOrderStatus: Order;
  updateProduct: Product;
  updateProfile: User;
  updateShippingInfo: Order;
  updateStock: Product;
  updateUser: User;
};

export type MutationActivateProductArgs = {
  id: Scalars['ID']['input'];
};

export type MutationBulkUpdateStockArgs = {
  updates: Array<StockUpdate>;
};

export type MutationCancelOrderArgs = {
  id: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
};

export type MutationChangePasswordArgs = {
  input: ChangePasswordInput;
};

export type MutationCreateOrderArgs = {
  input: CreateOrderInput;
};

export type MutationCreateProductArgs = {
  input: CreateProductInput;
};

export type MutationDeactivateProductArgs = {
  id: Scalars['ID']['input'];
};

export type MutationDeactivateUserArgs = {
  id: Scalars['ID']['input'];
};

export type MutationRefreshTokenArgs = {
  refreshToken: Scalars['String']['input'];
};

export type MutationRefundOrderArgs = {
  id: Scalars['ID']['input'];
  reason: Scalars['String']['input'];
};

export type MutationSignInArgs = {
  input: SignInInput;
};

export type MutationSignUpArgs = {
  input: SignUpInput;
};

export type MutationUpdateOrderNotesArgs = {
  id: Scalars['ID']['input'];
  notes: Scalars['String']['input'];
};

export type MutationUpdateOrderStatusArgs = {
  id: Scalars['ID']['input'];
  status: OrderStatus;
};

export type MutationUpdateProductArgs = {
  id: Scalars['ID']['input'];
  input: UpdateProductInput;
};

export type MutationUpdateProfileArgs = {
  input: UpdateProfileInput;
};

export type MutationUpdateShippingInfoArgs = {
  id: Scalars['ID']['input'];
  shippingInfo: ShippingInfoInput;
};

export type MutationUpdateStockArgs = {
  id: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type MutationUpdateUserArgs = {
  id: Scalars['ID']['input'];
  input: UpdateUserInput;
};

export type Order = {
  __typename?: 'Order';
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  items: Array<OrderItem>;
  notes?: Maybe<Scalars['String']['output']>;
  orderNumber: Scalars['String']['output'];
  paymentInfo?: Maybe<PaymentInfo>;
  shipping: Scalars['Float']['output'];
  shippingInfo?: Maybe<ShippingInfo>;
  status: OrderStatus;
  subtotal: Scalars['Float']['output'];
  tax: Scalars['Float']['output'];
  total: Scalars['Float']['output'];
  updatedAt: Scalars['String']['output'];
  user?: Maybe<User>;
  userId: Scalars['ID']['output'];
};

export type OrderItem = {
  __typename?: 'OrderItem';
  id: Scalars['ID']['output'];
  price: Scalars['Float']['output'];
  product?: Maybe<Product>;
  productId: Scalars['ID']['output'];
  quantity: Scalars['Int']['output'];
  total: Scalars['Float']['output'];
};

export type OrderItemInput = {
  price: Scalars['Float']['input'];
  productId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export enum OrderStatus {
  Cancelled = 'CANCELLED',
  Delivered = 'DELIVERED',
  Pending = 'PENDING',
  Processing = 'PROCESSING',
  Refunded = 'REFUNDED',
  Shipped = 'SHIPPED',
}

export type OrdersPage = {
  __typename?: 'OrdersPage';
  orders: Array<Order>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type PaymentInfo = {
  __typename?: 'PaymentInfo';
  method: Scalars['String']['output'];
  paidAt?: Maybe<Scalars['String']['output']>;
  transactionId?: Maybe<Scalars['String']['output']>;
};

export type Product = {
  __typename?: 'Product';
  category: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  imageUrl?: Maybe<Scalars['String']['output']>;
  isActive: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  price: Scalars['Float']['output'];
  sku: Scalars['String']['output'];
  stock: Scalars['Int']['output'];
  tags: Array<Scalars['String']['output']>;
  updatedAt: Scalars['String']['output'];
};

export type ProductsPage = {
  __typename?: 'ProductsPage';
  pageInfo: PageInfo;
  products: Array<Product>;
  totalCount: Scalars['Int']['output'];
};

export type Query = {
  __typename?: 'Query';
  categories: Array<Scalars['String']['output']>;
  me?: Maybe<User>;
  myOrders: OrdersPage;
  order?: Maybe<Order>;
  orderByNumber?: Maybe<Order>;
  orders: OrdersPage;
  product?: Maybe<Product>;
  productBySku?: Maybe<Product>;
  products: ProductsPage;
  searchProducts: Array<Product>;
  user?: Maybe<User>;
  userByEmail?: Maybe<User>;
  userByUsername?: Maybe<User>;
  users: Array<User>;
};

export type QueryMyOrdersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<OrderStatus>;
};

export type QueryOrderArgs = {
  id: Scalars['ID']['input'];
};

export type QueryOrderByNumberArgs = {
  orderNumber: Scalars['String']['input'];
};

export type QueryOrdersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  dateFrom?: InputMaybe<Scalars['String']['input']>;
  dateTo?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<OrderStatus>;
  userId?: InputMaybe<Scalars['ID']['input']>;
};

export type QueryProductArgs = {
  id: Scalars['ID']['input'];
};

export type QueryProductBySkuArgs = {
  sku: Scalars['String']['input'];
};

export type QueryProductsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  category?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type QuerySearchProductsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  query: Scalars['String']['input'];
};

export type QueryUserArgs = {
  id: Scalars['ID']['input'];
};

export type QueryUserByEmailArgs = {
  email: Scalars['String']['input'];
};

export type QueryUserByUsernameArgs = {
  username: Scalars['String']['input'];
};

export enum Role {
  Admin = 'ADMIN',
  Moderator = 'MODERATOR',
  User = 'USER',
}

export type ShippingInfo = {
  __typename?: 'ShippingInfo';
  address: Scalars['String']['output'];
  city: Scalars['String']['output'];
  country: Scalars['String']['output'];
  phone?: Maybe<Scalars['String']['output']>;
  state: Scalars['String']['output'];
  zipCode: Scalars['String']['output'];
};

export type ShippingInfoInput = {
  address: Scalars['String']['input'];
  city: Scalars['String']['input'];
  country: Scalars['String']['input'];
  phone?: InputMaybe<Scalars['String']['input']>;
  state: Scalars['String']['input'];
  zipCode: Scalars['String']['input'];
};

export type SignInInput = {
  password: Scalars['String']['input'];
  username: Scalars['String']['input'];
};

export type SignUpInput = {
  email: Scalars['String']['input'];
  name: Scalars['String']['input'];
  password: Scalars['String']['input'];
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  username: Scalars['String']['input'];
};

export type StockUpdate = {
  productId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type Subscription = {
  __typename?: 'Subscription';
  orderCancelled: Order;
  orderCreated: Order;
  orderRefunded: Order;
  orderStatusChanged: Order;
  productCreated: Product;
  productDeactivated: Product;
  productStockChanged: Product;
  productUpdated: Product;
  userCreated: User;
  userDeactivated: User;
  userUpdated: User;
};

export type SubscriptionOrderCreatedArgs = {
  userId?: InputMaybe<Scalars['ID']['input']>;
};

export type SubscriptionOrderStatusChangedArgs = {
  userId?: InputMaybe<Scalars['ID']['input']>;
};

export type SubscriptionProductStockChangedArgs = {
  productId?: InputMaybe<Scalars['ID']['input']>;
};

export type SubscriptionProductUpdatedArgs = {
  productId?: InputMaybe<Scalars['ID']['input']>;
};

export type SubscriptionUserUpdatedArgs = {
  userId?: InputMaybe<Scalars['ID']['input']>;
};

export type UpdateProductInput = {
  category?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  imageUrl?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  price?: InputMaybe<Scalars['Float']['input']>;
  stock?: InputMaybe<Scalars['Int']['input']>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type UpdateProfileInput = {
  name?: InputMaybe<Scalars['String']['input']>;
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateUserInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  phoneNumber?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Role>;
  username?: InputMaybe<Scalars['String']['input']>;
};

export type User = {
  __typename?: 'User';
  createdAt: Scalars['String']['output'];
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  orders: Array<Order>;
  phoneNumber?: Maybe<Scalars['String']['output']>;
  role: Role;
  updatedAt: Scalars['String']['output'];
  username: Scalars['String']['output'];
};

export type SignUpMutationVariables = Exact<{
  input: SignUpInput;
}>;

export type SignUpMutation = {
  __typename?: 'Mutation';
  signUp: {
    __typename?: 'AuthPayload';
    accessToken: string;
    refreshToken: string;
    user: {
      __typename?: 'User';
      id: string;
      username: string;
      email: string;
      name: string;
      role: Role;
    };
  };
};

export type SignInMutationVariables = Exact<{
  input: SignInInput;
}>;

export type SignInMutation = {
  __typename?: 'Mutation';
  signIn: {
    __typename?: 'AuthPayload';
    accessToken: string;
    refreshToken: string;
    user: {
      __typename?: 'User';
      id: string;
      username: string;
      email: string;
      name: string;
      role: Role;
    };
  };
};

export type RefreshTokenMutationVariables = Exact<{
  refreshToken: Scalars['String']['input'];
}>;

export type RefreshTokenMutation = {
  __typename?: 'Mutation';
  refreshToken: {
    __typename?: 'AuthPayload';
    accessToken: string;
    refreshToken: string;
    user: {
      __typename?: 'User';
      id: string;
      username: string;
      email: string;
      name: string;
      role: Role;
    };
  };
};

export type SignOutMutationVariables = Exact<{ [key: string]: never }>;

export type SignOutMutation = { __typename?: 'Mutation'; signOut: boolean };

export type UpdateUserMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateUserInput;
}>;

export type UpdateUserMutation = {
  __typename?: 'Mutation';
  updateUser: {
    __typename?: 'User';
    id: string;
    username: string;
    email: string;
    name: string;
    phoneNumber?: string | null;
    role: Role;
    isActive: boolean;
    updatedAt: string;
  };
};

export type UpdateProfileMutationVariables = Exact<{
  input: UpdateProfileInput;
}>;

export type UpdateProfileMutation = {
  __typename?: 'Mutation';
  updateProfile: {
    __typename?: 'User';
    id: string;
    username: string;
    email: string;
    name: string;
    phoneNumber?: string | null;
    updatedAt: string;
  };
};

export type ChangePasswordMutationVariables = Exact<{
  input: ChangePasswordInput;
}>;

export type ChangePasswordMutation = { __typename?: 'Mutation'; changePassword: boolean };

export type DeactivateUserMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeactivateUserMutation = {
  __typename?: 'Mutation';
  deactivateUser: { __typename?: 'User'; id: string; username: string; isActive: boolean };
};

export type CreateProductMutationVariables = Exact<{
  input: CreateProductInput;
}>;

export type CreateProductMutation = {
  __typename?: 'Mutation';
  createProduct: {
    __typename?: 'Product';
    id: string;
    name: string;
    description: string;
    price: number;
    sku: string;
    category: string;
    tags: Array<string>;
    stock: number;
    isActive: boolean;
    createdAt: string;
  };
};

export type UpdateProductMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateProductInput;
}>;

export type UpdateProductMutation = {
  __typename?: 'Mutation';
  updateProduct: {
    __typename?: 'Product';
    id: string;
    name: string;
    description: string;
    price: number;
    sku: string;
    category: string;
    tags: Array<string>;
    stock: number;
    isActive: boolean;
    updatedAt: string;
  };
};

export type DeactivateProductMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type DeactivateProductMutation = {
  __typename?: 'Mutation';
  deactivateProduct: { __typename?: 'Product'; id: string; isActive: boolean };
};

export type UpdateStockMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
}>;

export type UpdateStockMutation = {
  __typename?: 'Mutation';
  updateStock: { __typename?: 'Product'; id: string; stock: number; updatedAt: string };
};

export type CreateOrderMutationVariables = Exact<{
  input: CreateOrderInput;
}>;

export type CreateOrderMutation = {
  __typename?: 'Mutation';
  createOrder: {
    __typename?: 'Order';
    id: string;
    status: OrderStatus;
    total: number;
    createdAt: string;
    user?: { __typename?: 'User'; id: string; username: string; email: string } | null;
    items: Array<{
      __typename?: 'OrderItem';
      id: string;
      quantity: number;
      price: number;
      product?: { __typename?: 'Product'; id: string; name: string; price: number } | null;
    }>;
  };
};

export type UpdateOrderStatusMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  status: OrderStatus;
}>;

export type UpdateOrderStatusMutation = {
  __typename?: 'Mutation';
  updateOrderStatus: { __typename?: 'Order'; id: string; status: OrderStatus; updatedAt: string };
};

export type CancelOrderMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  reason?: InputMaybe<Scalars['String']['input']>;
}>;

export type CancelOrderMutation = {
  __typename?: 'Mutation';
  cancelOrder: { __typename?: 'Order'; id: string; status: OrderStatus; updatedAt: string };
};

export type GetUserQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetUserQuery = {
  __typename?: 'Query';
  user?: {
    __typename?: 'User';
    id: string;
    username: string;
    email: string;
    name: string;
    phoneNumber?: string | null;
    role: Role;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type GetUsersQueryVariables = Exact<{ [key: string]: never }>;

export type GetUsersQuery = {
  __typename?: 'Query';
  users: Array<{
    __typename?: 'User';
    id: string;
    username: string;
    email: string;
    name: string;
    phoneNumber?: string | null;
    role: Role;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type GetMeQueryVariables = Exact<{ [key: string]: never }>;

export type GetMeQuery = {
  __typename?: 'Query';
  me?: {
    __typename?: 'User';
    id: string;
    username: string;
    email: string;
    name: string;
    phoneNumber?: string | null;
    role: Role;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type GetProductQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetProductQuery = {
  __typename?: 'Query';
  product?: {
    __typename?: 'Product';
    id: string;
    name: string;
    description: string;
    price: number;
    sku: string;
    category: string;
    tags: Array<string>;
    stock: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type GetProductsQueryVariables = Exact<{
  category?: InputMaybe<Scalars['String']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
}>;

export type GetProductsQuery = {
  __typename?: 'Query';
  products: {
    __typename?: 'ProductsPage';
    totalCount: number;
    products: Array<{
      __typename?: 'Product';
      id: string;
      name: string;
      description: string;
      price: number;
      sku: string;
      category: string;
      tags: Array<string>;
      stock: number;
      isActive: boolean;
    }>;
    pageInfo: {
      __typename?: 'PageInfo';
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor?: string | null;
      endCursor?: string | null;
    };
  };
};

export type GetOrderWithDetailsQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetOrderWithDetailsQuery = {
  __typename?: 'Query';
  order?: {
    __typename?: 'Order';
    id: string;
    status: OrderStatus;
    total: number;
    createdAt: string;
    updatedAt: string;
    user?: {
      __typename?: 'User';
      id: string;
      username: string;
      email: string;
      name: string;
    } | null;
    items: Array<{
      __typename?: 'OrderItem';
      id: string;
      quantity: number;
      price: number;
      product?: {
        __typename?: 'Product';
        id: string;
        name: string;
        description: string;
        price: number;
      } | null;
    }>;
  } | null;
};

export type GetMyOrdersQueryVariables = Exact<{ [key: string]: never }>;

export type GetMyOrdersQuery = {
  __typename?: 'Query';
  myOrders: {
    __typename?: 'OrdersPage';
    totalCount: number;
    orders: Array<{
      __typename?: 'Order';
      id: string;
      status: OrderStatus;
      total: number;
      createdAt: string;
      items: Array<{
        __typename?: 'OrderItem';
        id: string;
        quantity: number;
        price: number;
        product?: { __typename?: 'Product'; id: string; name: string; price: number } | null;
      }>;
    }>;
    pageInfo: {
      __typename?: 'PageInfo';
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor?: string | null;
      endCursor?: string | null;
    };
  };
};

export type GetUserWithOrdersQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;

export type GetUserWithOrdersQuery = {
  __typename?: 'Query';
  user?: {
    __typename?: 'User';
    id: string;
    username: string;
    email: string;
    name: string;
    orders: Array<{
      __typename?: 'Order';
      id: string;
      status: OrderStatus;
      total: number;
      createdAt: string;
      items: Array<{
        __typename?: 'OrderItem';
        id: string;
        quantity: number;
        price: number;
        product?: { __typename?: 'Product'; id: string; name: string } | null;
      }>;
    }>;
  } | null;
};
