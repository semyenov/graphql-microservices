/* eslint-disable */
/* prettier-ignore */

export type introspection_types = {
  AuthPayload: {
    kind: 'OBJECT';
    name: 'AuthPayload';
    fields: {
      accessToken: {
        name: 'accessToken';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      refreshToken: {
        name: 'refreshToken';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      user: {
        name: 'user';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'User'; ofType: null };
        };
      };
    };
  };
  Boolean: unknown;
  ChangePasswordInput: {
    kind: 'INPUT_OBJECT';
    name: 'ChangePasswordInput';
    isOneOf: false;
    inputFields: [
      {
        name: 'currentPassword';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'newPassword';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
    ];
  };
  CreateOrderInput: {
    kind: 'INPUT_OBJECT';
    name: 'CreateOrderInput';
    isOneOf: false;
    inputFields: [
      {
        name: 'items';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: {
            kind: 'LIST';
            name: never;
            ofType: {
              kind: 'NON_NULL';
              name: never;
              ofType: { kind: 'INPUT_OBJECT'; name: 'OrderItemInput'; ofType: null };
            };
          };
        };
        defaultValue: null;
      },
      {
        name: 'shippingInfo';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'INPUT_OBJECT'; name: 'ShippingInfoInput'; ofType: null };
        };
        defaultValue: null;
      },
      { name: 'notes'; type: { kind: 'SCALAR'; name: 'String'; ofType: null }; defaultValue: null },
    ];
  };
  CreateProductInput: {
    kind: 'INPUT_OBJECT';
    name: 'CreateProductInput';
    isOneOf: false;
    inputFields: [
      {
        name: 'name';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'description';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'price';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Float'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'stock';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'sku';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'category';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'tags';
        type: {
          kind: 'LIST';
          name: never;
          ofType: {
            kind: 'NON_NULL';
            name: never;
            ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
          };
        };
        defaultValue: null;
      },
      {
        name: 'imageUrl';
        type: { kind: 'SCALAR'; name: 'String'; ofType: null };
        defaultValue: null;
      },
    ];
  };
  Float: unknown;
  ID: unknown;
  Int: unknown;
  Mutation: {
    kind: 'OBJECT';
    name: 'Mutation';
    fields: {
      activateProduct: {
        name: 'activateProduct';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'Product'; ofType: null };
        };
      };
      bulkUpdateStock: {
        name: 'bulkUpdateStock';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: {
            kind: 'LIST';
            name: never;
            ofType: {
              kind: 'NON_NULL';
              name: never;
              ofType: { kind: 'OBJECT'; name: 'Product'; ofType: null };
            };
          };
        };
      };
      cancelOrder: {
        name: 'cancelOrder';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'Order'; ofType: null };
        };
      };
      changePassword: {
        name: 'changePassword';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Boolean'; ofType: null };
        };
      };
      createOrder: {
        name: 'createOrder';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'Order'; ofType: null };
        };
      };
      createProduct: {
        name: 'createProduct';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'Product'; ofType: null };
        };
      };
      deactivateProduct: {
        name: 'deactivateProduct';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'Product'; ofType: null };
        };
      };
      deactivateUser: {
        name: 'deactivateUser';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'User'; ofType: null };
        };
      };
      refreshToken: {
        name: 'refreshToken';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'AuthPayload'; ofType: null };
        };
      };
      refundOrder: {
        name: 'refundOrder';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'Order'; ofType: null };
        };
      };
      signIn: {
        name: 'signIn';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'AuthPayload'; ofType: null };
        };
      };
      signOut: {
        name: 'signOut';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Boolean'; ofType: null };
        };
      };
      signUp: {
        name: 'signUp';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'AuthPayload'; ofType: null };
        };
      };
      updateOrderNotes: {
        name: 'updateOrderNotes';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'Order'; ofType: null };
        };
      };
      updateOrderStatus: {
        name: 'updateOrderStatus';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'Order'; ofType: null };
        };
      };
      updateProduct: {
        name: 'updateProduct';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'Product'; ofType: null };
        };
      };
      updateProfile: {
        name: 'updateProfile';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'User'; ofType: null };
        };
      };
      updateShippingInfo: {
        name: 'updateShippingInfo';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'Order'; ofType: null };
        };
      };
      updateStock: {
        name: 'updateStock';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'Product'; ofType: null };
        };
      };
      updateUser: {
        name: 'updateUser';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'User'; ofType: null };
        };
      };
    };
  };
  Order: {
    kind: 'OBJECT';
    name: 'Order';
    fields: {
      createdAt: {
        name: 'createdAt';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      id: {
        name: 'id';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null };
        };
      };
      items: {
        name: 'items';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: {
            kind: 'LIST';
            name: never;
            ofType: {
              kind: 'NON_NULL';
              name: never;
              ofType: { kind: 'OBJECT'; name: 'OrderItem'; ofType: null };
            };
          };
        };
      };
      notes: { name: 'notes'; type: { kind: 'SCALAR'; name: 'String'; ofType: null } };
      orderNumber: {
        name: 'orderNumber';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      paymentInfo: {
        name: 'paymentInfo';
        type: { kind: 'OBJECT'; name: 'PaymentInfo'; ofType: null };
      };
      shipping: {
        name: 'shipping';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Float'; ofType: null };
        };
      };
      shippingInfo: {
        name: 'shippingInfo';
        type: { kind: 'OBJECT'; name: 'ShippingInfo'; ofType: null };
      };
      status: {
        name: 'status';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'ENUM'; name: 'OrderStatus'; ofType: null };
        };
      };
      subtotal: {
        name: 'subtotal';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Float'; ofType: null };
        };
      };
      tax: {
        name: 'tax';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Float'; ofType: null };
        };
      };
      total: {
        name: 'total';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Float'; ofType: null };
        };
      };
      updatedAt: {
        name: 'updatedAt';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      user: { name: 'user'; type: { kind: 'OBJECT'; name: 'User'; ofType: null } };
      userId: {
        name: 'userId';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null };
        };
      };
    };
  };
  OrderItem: {
    kind: 'OBJECT';
    name: 'OrderItem';
    fields: {
      id: {
        name: 'id';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null };
        };
      };
      price: {
        name: 'price';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Float'; ofType: null };
        };
      };
      product: { name: 'product'; type: { kind: 'OBJECT'; name: 'Product'; ofType: null } };
      productId: {
        name: 'productId';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null };
        };
      };
      quantity: {
        name: 'quantity';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null };
        };
      };
      total: {
        name: 'total';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Float'; ofType: null };
        };
      };
    };
  };
  OrderItemInput: {
    kind: 'INPUT_OBJECT';
    name: 'OrderItemInput';
    isOneOf: false;
    inputFields: [
      {
        name: 'productId';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'quantity';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'price';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Float'; ofType: null };
        };
        defaultValue: null;
      },
    ];
  };
  OrderStatus: {
    name: 'OrderStatus';
    enumValues: 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
  };
  OrdersPage: {
    kind: 'OBJECT';
    name: 'OrdersPage';
    fields: {
      orders: {
        name: 'orders';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: {
            kind: 'LIST';
            name: never;
            ofType: {
              kind: 'NON_NULL';
              name: never;
              ofType: { kind: 'OBJECT'; name: 'Order'; ofType: null };
            };
          };
        };
      };
      pageInfo: {
        name: 'pageInfo';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'PageInfo'; ofType: null };
        };
      };
      totalCount: {
        name: 'totalCount';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null };
        };
      };
    };
  };
  PageInfo: {
    kind: 'OBJECT';
    name: 'PageInfo';
    fields: {
      endCursor: { name: 'endCursor'; type: { kind: 'SCALAR'; name: 'String'; ofType: null } };
      hasNextPage: {
        name: 'hasNextPage';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Boolean'; ofType: null };
        };
      };
      hasPreviousPage: {
        name: 'hasPreviousPage';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Boolean'; ofType: null };
        };
      };
      startCursor: { name: 'startCursor'; type: { kind: 'SCALAR'; name: 'String'; ofType: null } };
    };
  };
  PaymentInfo: {
    kind: 'OBJECT';
    name: 'PaymentInfo';
    fields: {
      method: {
        name: 'method';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      paidAt: { name: 'paidAt'; type: { kind: 'SCALAR'; name: 'String'; ofType: null } };
      transactionId: {
        name: 'transactionId';
        type: { kind: 'SCALAR'; name: 'String'; ofType: null };
      };
    };
  };
  Product: {
    kind: 'OBJECT';
    name: 'Product';
    fields: {
      category: {
        name: 'category';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      createdAt: {
        name: 'createdAt';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      description: {
        name: 'description';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      id: {
        name: 'id';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null };
        };
      };
      imageUrl: { name: 'imageUrl'; type: { kind: 'SCALAR'; name: 'String'; ofType: null } };
      isActive: {
        name: 'isActive';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Boolean'; ofType: null };
        };
      };
      name: {
        name: 'name';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      price: {
        name: 'price';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Float'; ofType: null };
        };
      };
      sku: {
        name: 'sku';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      stock: {
        name: 'stock';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null };
        };
      };
      tags: {
        name: 'tags';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: {
            kind: 'LIST';
            name: never;
            ofType: {
              kind: 'NON_NULL';
              name: never;
              ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
            };
          };
        };
      };
      updatedAt: {
        name: 'updatedAt';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
    };
  };
  ProductsPage: {
    kind: 'OBJECT';
    name: 'ProductsPage';
    fields: {
      pageInfo: {
        name: 'pageInfo';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'PageInfo'; ofType: null };
        };
      };
      products: {
        name: 'products';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: {
            kind: 'LIST';
            name: never;
            ofType: {
              kind: 'NON_NULL';
              name: never;
              ofType: { kind: 'OBJECT'; name: 'Product'; ofType: null };
            };
          };
        };
      };
      totalCount: {
        name: 'totalCount';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null };
        };
      };
    };
  };
  Query: {
    kind: 'OBJECT';
    name: 'Query';
    fields: {
      categories: {
        name: 'categories';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: {
            kind: 'LIST';
            name: never;
            ofType: {
              kind: 'NON_NULL';
              name: never;
              ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
            };
          };
        };
      };
      me: { name: 'me'; type: { kind: 'OBJECT'; name: 'User'; ofType: null } };
      myOrders: {
        name: 'myOrders';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'OrdersPage'; ofType: null };
        };
      };
      order: { name: 'order'; type: { kind: 'OBJECT'; name: 'Order'; ofType: null } };
      orderByNumber: {
        name: 'orderByNumber';
        type: { kind: 'OBJECT'; name: 'Order'; ofType: null };
      };
      orders: {
        name: 'orders';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'OrdersPage'; ofType: null };
        };
      };
      product: { name: 'product'; type: { kind: 'OBJECT'; name: 'Product'; ofType: null } };
      productBySku: {
        name: 'productBySku';
        type: { kind: 'OBJECT'; name: 'Product'; ofType: null };
      };
      products: {
        name: 'products';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'OBJECT'; name: 'ProductsPage'; ofType: null };
        };
      };
      searchProducts: {
        name: 'searchProducts';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: {
            kind: 'LIST';
            name: never;
            ofType: {
              kind: 'NON_NULL';
              name: never;
              ofType: { kind: 'OBJECT'; name: 'Product'; ofType: null };
            };
          };
        };
      };
      user: { name: 'user'; type: { kind: 'OBJECT'; name: 'User'; ofType: null } };
      userByEmail: { name: 'userByEmail'; type: { kind: 'OBJECT'; name: 'User'; ofType: null } };
      userByUsername: {
        name: 'userByUsername';
        type: { kind: 'OBJECT'; name: 'User'; ofType: null };
      };
      users: {
        name: 'users';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: {
            kind: 'LIST';
            name: never;
            ofType: {
              kind: 'NON_NULL';
              name: never;
              ofType: { kind: 'OBJECT'; name: 'User'; ofType: null };
            };
          };
        };
      };
    };
  };
  Role: { name: 'Role'; enumValues: 'USER' | 'ADMIN' | 'MODERATOR' };
  ShippingInfo: {
    kind: 'OBJECT';
    name: 'ShippingInfo';
    fields: {
      address: {
        name: 'address';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      city: {
        name: 'city';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      country: {
        name: 'country';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      phone: { name: 'phone'; type: { kind: 'SCALAR'; name: 'String'; ofType: null } };
      state: {
        name: 'state';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      zipCode: {
        name: 'zipCode';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
    };
  };
  ShippingInfoInput: {
    kind: 'INPUT_OBJECT';
    name: 'ShippingInfoInput';
    isOneOf: false;
    inputFields: [
      {
        name: 'address';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'city';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'state';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'zipCode';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'country';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      { name: 'phone'; type: { kind: 'SCALAR'; name: 'String'; ofType: null }; defaultValue: null },
    ];
  };
  SignInInput: {
    kind: 'INPUT_OBJECT';
    name: 'SignInInput';
    isOneOf: false;
    inputFields: [
      {
        name: 'username';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'password';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
    ];
  };
  SignUpInput: {
    kind: 'INPUT_OBJECT';
    name: 'SignUpInput';
    isOneOf: false;
    inputFields: [
      {
        name: 'username';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'email';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'password';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'name';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'phoneNumber';
        type: { kind: 'SCALAR'; name: 'String'; ofType: null };
        defaultValue: null;
      },
    ];
  };
  StockUpdate: {
    kind: 'INPUT_OBJECT';
    name: 'StockUpdate';
    isOneOf: false;
    inputFields: [
      {
        name: 'productId';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null };
        };
        defaultValue: null;
      },
      {
        name: 'quantity';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null };
        };
        defaultValue: null;
      },
    ];
  };
  String: unknown;
  UpdateProductInput: {
    kind: 'INPUT_OBJECT';
    name: 'UpdateProductInput';
    isOneOf: false;
    inputFields: [
      { name: 'name'; type: { kind: 'SCALAR'; name: 'String'; ofType: null }; defaultValue: null },
      {
        name: 'description';
        type: { kind: 'SCALAR'; name: 'String'; ofType: null };
        defaultValue: null;
      },
      { name: 'price'; type: { kind: 'SCALAR'; name: 'Float'; ofType: null }; defaultValue: null },
      { name: 'stock'; type: { kind: 'SCALAR'; name: 'Int'; ofType: null }; defaultValue: null },
      {
        name: 'category';
        type: { kind: 'SCALAR'; name: 'String'; ofType: null };
        defaultValue: null;
      },
      {
        name: 'tags';
        type: {
          kind: 'LIST';
          name: never;
          ofType: {
            kind: 'NON_NULL';
            name: never;
            ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
          };
        };
        defaultValue: null;
      },
      {
        name: 'imageUrl';
        type: { kind: 'SCALAR'; name: 'String'; ofType: null };
        defaultValue: null;
      },
    ];
  };
  UpdateProfileInput: {
    kind: 'INPUT_OBJECT';
    name: 'UpdateProfileInput';
    isOneOf: false;
    inputFields: [
      { name: 'name'; type: { kind: 'SCALAR'; name: 'String'; ofType: null }; defaultValue: null },
      {
        name: 'phoneNumber';
        type: { kind: 'SCALAR'; name: 'String'; ofType: null };
        defaultValue: null;
      },
    ];
  };
  UpdateUserInput: {
    kind: 'INPUT_OBJECT';
    name: 'UpdateUserInput';
    isOneOf: false;
    inputFields: [
      {
        name: 'username';
        type: { kind: 'SCALAR'; name: 'String'; ofType: null };
        defaultValue: null;
      },
      { name: 'email'; type: { kind: 'SCALAR'; name: 'String'; ofType: null }; defaultValue: null },
      { name: 'name'; type: { kind: 'SCALAR'; name: 'String'; ofType: null }; defaultValue: null },
      {
        name: 'phoneNumber';
        type: { kind: 'SCALAR'; name: 'String'; ofType: null };
        defaultValue: null;
      },
      { name: 'role'; type: { kind: 'ENUM'; name: 'Role'; ofType: null }; defaultValue: null },
    ];
  };
  User: {
    kind: 'OBJECT';
    name: 'User';
    fields: {
      createdAt: {
        name: 'createdAt';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      email: {
        name: 'email';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      id: {
        name: 'id';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null };
        };
      };
      isActive: {
        name: 'isActive';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'Boolean'; ofType: null };
        };
      };
      name: {
        name: 'name';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      orders: {
        name: 'orders';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: {
            kind: 'LIST';
            name: never;
            ofType: {
              kind: 'NON_NULL';
              name: never;
              ofType: { kind: 'OBJECT'; name: 'Order'; ofType: null };
            };
          };
        };
      };
      phoneNumber: { name: 'phoneNumber'; type: { kind: 'SCALAR'; name: 'String'; ofType: null } };
      role: {
        name: 'role';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'ENUM'; name: 'Role'; ofType: null };
        };
      };
      updatedAt: {
        name: 'updatedAt';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
      username: {
        name: 'username';
        type: {
          kind: 'NON_NULL';
          name: never;
          ofType: { kind: 'SCALAR'; name: 'String'; ofType: null };
        };
      };
    };
  };
};

/** An IntrospectionQuery representation of your schema.
 *
 * @remarks
 * This is an introspection of your schema saved as a file by GraphQLSP.
 * It will automatically be used by `gql.tada` to infer the types of your GraphQL documents.
 * If you need to reuse this data or update your `scalars`, update `tadaOutputLocation` to
 * instead save to a .ts instead of a .d.ts file.
 */
export type introspection = {
  name: never;
  query: 'Query';
  mutation: 'Mutation';
  subscription: never;
  types: introspection_types;
};

import * as gqlTada from 'gql.tada';

declare module 'gql.tada' {
  interface setupSchema {
    introspection: introspection;
  }
}
