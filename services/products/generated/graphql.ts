import { GraphQLResolveInfo } from 'graphql';
import { Context } from '@graphql-microservices/products/src/index';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
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
  createProduct: Product;
  deactivateProduct: Product;
  updateProduct: Product;
  updateStock: Product;
};


export type MutationActivateProductArgs = {
  id: Scalars['ID']['input'];
};


export type MutationBulkUpdateStockArgs = {
  updates: Array<StockUpdate>;
};


export type MutationCreateProductArgs = {
  input: CreateProductInput;
};


export type MutationDeactivateProductArgs = {
  id: Scalars['ID']['input'];
};


export type MutationUpdateProductArgs = {
  id: Scalars['ID']['input'];
  input: UpdateProductInput;
};


export type MutationUpdateStockArgs = {
  id: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
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
  product?: Maybe<Product>;
  productBySku?: Maybe<Product>;
  products: ProductsPage;
  searchProducts: Array<Product>;
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

export type StockUpdate = {
  productId: Scalars['ID']['input'];
  quantity: Scalars['Int']['input'];
};

export type Subscription = {
  __typename?: 'Subscription';
  productCreated: Product;
  productDeactivated: Product;
  productStockChanged: Product;
  productUpdated: Product;
};


export type SubscriptionProductStockChangedArgs = {
  productId?: InputMaybe<Scalars['ID']['input']>;
};


export type SubscriptionProductUpdatedArgs = {
  productId?: InputMaybe<Scalars['ID']['input']>;
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



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  CreateProductInput: CreateProductInput;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  Mutation: ResolverTypeWrapper<{}>;
  PageInfo: ResolverTypeWrapper<PageInfo>;
  Product: ResolverTypeWrapper<Product>;
  ProductsPage: ResolverTypeWrapper<ProductsPage>;
  Query: ResolverTypeWrapper<{}>;
  StockUpdate: StockUpdate;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Subscription: ResolverTypeWrapper<{}>;
  UpdateProductInput: UpdateProductInput;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Boolean: Scalars['Boolean']['output'];
  CreateProductInput: CreateProductInput;
  Float: Scalars['Float']['output'];
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  Mutation: {};
  PageInfo: PageInfo;
  Product: Product;
  ProductsPage: ProductsPage;
  Query: {};
  StockUpdate: StockUpdate;
  String: Scalars['String']['output'];
  Subscription: {};
  UpdateProductInput: UpdateProductInput;
};

export type MutationResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  activateProduct?: Resolver<ResolversTypes['Product'], ParentType, ContextType, RequireFields<MutationActivateProductArgs, 'id'>>;
  bulkUpdateStock?: Resolver<Array<ResolversTypes['Product']>, ParentType, ContextType, RequireFields<MutationBulkUpdateStockArgs, 'updates'>>;
  createProduct?: Resolver<ResolversTypes['Product'], ParentType, ContextType, RequireFields<MutationCreateProductArgs, 'input'>>;
  deactivateProduct?: Resolver<ResolversTypes['Product'], ParentType, ContextType, RequireFields<MutationDeactivateProductArgs, 'id'>>;
  updateProduct?: Resolver<ResolversTypes['Product'], ParentType, ContextType, RequireFields<MutationUpdateProductArgs, 'id' | 'input'>>;
  updateStock?: Resolver<ResolversTypes['Product'], ParentType, ContextType, RequireFields<MutationUpdateStockArgs, 'id' | 'quantity'>>;
};

export type PageInfoResolvers<ContextType = Context, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = {
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  hasPreviousPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  startCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ProductResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Product'] = ResolversParentTypes['Product']> = {
  category?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  imageUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  isActive?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  price?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  sku?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  stock?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  tags?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ProductsPageResolvers<ContextType = Context, ParentType extends ResolversParentTypes['ProductsPage'] = ResolversParentTypes['ProductsPage']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  products?: Resolver<Array<ResolversTypes['Product']>, ParentType, ContextType>;
  totalCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  categories?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  product?: Resolver<Maybe<ResolversTypes['Product']>, ParentType, ContextType, RequireFields<QueryProductArgs, 'id'>>;
  productBySku?: Resolver<Maybe<ResolversTypes['Product']>, ParentType, ContextType, RequireFields<QueryProductBySkuArgs, 'sku'>>;
  products?: Resolver<ResolversTypes['ProductsPage'], ParentType, ContextType, Partial<QueryProductsArgs>>;
  searchProducts?: Resolver<Array<ResolversTypes['Product']>, ParentType, ContextType, RequireFields<QuerySearchProductsArgs, 'limit' | 'query'>>;
};

export type SubscriptionResolvers<ContextType = Context, ParentType extends ResolversParentTypes['Subscription'] = ResolversParentTypes['Subscription']> = {
  productCreated?: SubscriptionResolver<ResolversTypes['Product'], "productCreated", ParentType, ContextType>;
  productDeactivated?: SubscriptionResolver<ResolversTypes['Product'], "productDeactivated", ParentType, ContextType>;
  productStockChanged?: SubscriptionResolver<ResolversTypes['Product'], "productStockChanged", ParentType, ContextType, Partial<SubscriptionProductStockChangedArgs>>;
  productUpdated?: SubscriptionResolver<ResolversTypes['Product'], "productUpdated", ParentType, ContextType, Partial<SubscriptionProductUpdatedArgs>>;
};

export type Resolvers<ContextType = Context> = {
  Mutation?: MutationResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  Product?: ProductResolvers<ContextType>;
  ProductsPage?: ProductsPageResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Subscription?: SubscriptionResolvers<ContextType>;
};

