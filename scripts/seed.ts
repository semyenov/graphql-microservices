#!/usr/bin/env bun

import type { Decimal } from '@prisma/client/runtime/library';
import { getServiceDatabaseUrl, logError, logSuccess } from '@shared/utils';
import { PrismaClient as OrdersClient } from '../services/orders/generated/prisma';
import { PrismaClient as ProductsClient } from '../services/products/generated/prisma';
import { PrismaClient as UsersClient } from '../services/users/generated/prisma';
import { AuthService } from '../shared/auth';

console.log('🌱 Seeding databases...\n');

// Initialize Prisma clients with correct database URLs
const usersDb = new UsersClient({
  datasources: {
    db: {
      url: getServiceDatabaseUrl('users'),
    },
  },
});

const productsDb = new ProductsClient({
  datasources: {
    db: {
      url: getServiceDatabaseUrl('products'),
    },
  },
});

const ordersDb = new OrdersClient({
  datasources: {
    db: {
      url: getServiceDatabaseUrl('orders'),
    },
  },
});

const authService = new AuthService(AuthService.generateKeyPair(), AuthService.generateKeyPair(), {
  expiresIn: '7d',
  algorithm: 'RS256' as const,
});

async function seedUsers() {
  console.log('Seeding users...');

  const users = [
    {
      username: 'admin',
      email: 'admin@example.com',
      password: await authService.hashPassword('admin123'),
      name: 'Admin User',
      phoneNumber: '+1234567890',
      role: 'ADMIN' as const,
    },
    {
      username: 'johndoe',
      email: 'john@example.com',
      password: await authService.hashPassword('password123'),
      name: 'John Doe',
      phoneNumber: '+1234567891',
      role: 'USER' as const,
    },
    {
      username: 'janedoe',
      email: 'jane@example.com',
      password: await authService.hashPassword('password123'),
      name: 'Jane Doe',
      phoneNumber: '+1234567892',
      role: 'USER' as const,
    },
    {
      username: 'moderator',
      email: 'mod@example.com',
      password: await authService.hashPassword('mod123'),
      name: 'Moderator User',
      phoneNumber: '+1234567893',
      role: 'MODERATOR' as const,
    },
  ];

  for (const user of users) {
    await usersDb.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    });
  }

  const createdUsers = await usersDb.user.findMany();
  logSuccess(`Created ${createdUsers.length} users`);
  return createdUsers;
}

async function seedProducts() {
  console.log('Seeding products...');

  const products = [
    {
      name: 'MacBook Pro 16"',
      description: 'Apple MacBook Pro 16-inch with M3 Max chip',
      price: 2499.99,
      stock: 25,
      sku: 'MBP16-M3MAX',
      category: 'Laptops',
      tags: ['apple', 'laptop', 'professional'],
      imageUrl: 'https://example.com/macbook-pro-16.jpg',
    },
    {
      name: 'iPhone 15 Pro',
      description: 'Latest iPhone with titanium design',
      price: 999.99,
      stock: 100,
      sku: 'IP15PRO-128',
      category: 'Phones',
      tags: ['apple', 'iphone', 'smartphone'],
      imageUrl: 'https://example.com/iphone-15-pro.jpg',
    },
    {
      name: 'AirPods Pro',
      description: 'Wireless earbuds with active noise cancellation',
      price: 249.99,
      stock: 200,
      sku: 'AIRPODS-PRO-2',
      category: 'Audio',
      tags: ['apple', 'wireless', 'audio'],
      imageUrl: 'https://example.com/airpods-pro.jpg',
    },
    {
      name: 'Samsung Galaxy S24 Ultra',
      description: 'Premium Android smartphone with S Pen',
      price: 1199.99,
      stock: 75,
      sku: 'S24U-256',
      category: 'Phones',
      tags: ['samsung', 'android', 'smartphone'],
      imageUrl: 'https://example.com/galaxy-s24-ultra.jpg',
    },
    {
      name: 'Dell XPS 15',
      description: 'High-performance Windows laptop',
      price: 1799.99,
      stock: 30,
      sku: 'XPS15-I7-16GB',
      category: 'Laptops',
      tags: ['dell', 'laptop', 'windows'],
      imageUrl: 'https://example.com/dell-xps-15.jpg',
    },
    {
      name: 'Sony WH-1000XM5',
      description: 'Premium noise-cancelling headphones',
      price: 399.99,
      stock: 150,
      sku: 'WH1000XM5-BLK',
      category: 'Audio',
      tags: ['sony', 'headphones', 'noise-cancelling'],
      imageUrl: 'https://example.com/sony-wh1000xm5.jpg',
    },
    {
      name: 'iPad Pro 12.9"',
      description: 'Powerful tablet with M2 chip',
      price: 1099.99,
      stock: 40,
      sku: 'IPADPRO-12-128',
      category: 'Tablets',
      tags: ['apple', 'ipad', 'tablet'],
      imageUrl: 'https://example.com/ipad-pro.jpg',
    },
    {
      name: 'Logitech MX Master 3S',
      description: 'Advanced wireless mouse for productivity',
      price: 99.99,
      stock: 300,
      sku: 'MXM3S-GRAPHITE',
      category: 'Accessories',
      tags: ['logitech', 'mouse', 'wireless'],
      imageUrl: 'https://example.com/mx-master-3s.jpg',
    },
  ];

  for (const product of products) {
    await productsDb.product.upsert({
      where: { sku: product.sku },
      update: {},
      create: product,
    });
  }

  const createdProducts = await productsDb.product.findMany();
  logSuccess(`Created ${createdProducts.length} products`);
  return createdProducts;
}

async function seedOrders(
  users: { id: string; username: string; email: string }[],
  products: { id: string; name: string; price: Decimal }[]
) {
  console.log('Seeding orders...');

  // Ensure we have enough users and products for seeding
  if (users.length < 3) {
    throw new Error('Need at least 3 users to seed orders');
  }
  if (products.length < 8) {
    throw new Error('Need at least 8 products to seed orders');
  }

  // Create some sample orders
  const orderData = [
    {
      orderNumber: '1234567890',
      customerId: users[1]?.id, // John Doe
      customerName: users[1]?.username || 'John Doe',
      customerEmail: users[1]?.email || 'john@example.com',
      items: [
        { productId: products[0]?.id, productName: products[0]?.name || 'Product', quantity: 1, unitPrice: products[0]?.price.toNumber() },
        { productId: products[2]?.id, productName: products[2]?.name || 'Product', quantity: 2, unitPrice: products[2]?.price.toNumber() },
      ],
      status: 'DELIVERED' as const,
      shippingStreet: '123 Main St',
      shippingCity: 'New York',
      shippingState: 'NY',
      shippingPostalCode: '10001',
      shippingCountry: 'USA',
      paymentMethod: 'credit_card',
    },
    {
      orderNumber: '1234567891',
      customerId: users[2]?.id, // Jane Doe
      customerName: users[2]?.username || 'Jane Doe',
      customerEmail: users[2]?.email || 'jane@example.com',
      items: [{ productId: products[1]?.id, productName: products[1]?.name || 'Product', quantity: 1, unitPrice: products[1]?.price.toNumber() }],
      status: 'PROCESSING' as const,
      shippingStreet: '456 Oak Ave',
      shippingCity: 'Los Angeles',
      shippingState: 'CA',
      shippingPostalCode: '90001',
      shippingCountry: 'USA',
      paymentMethod: 'paypal',
    },
    {
      orderNumber: '1234567892',
      customerId: users[1]?.id, // John Doe
      customerName: users[1]?.username || 'John Doe',
      customerEmail: users[1]?.email || 'john@example.com',
      items: [
        { productId: products[4]?.id, productName: products[4]?.name || 'Product', quantity: 1, unitPrice: products[4]?.price.toNumber() },
        { productId: products[7]?.id, productName: products[7]?.name || 'Product', quantity: 1, unitPrice: products[7]?.price.toNumber() },
      ],
      status: 'PENDING' as const,
      shippingStreet: '123 Main St',
      shippingCity: 'New York',
      shippingState: 'NY',
      shippingPostalCode: '10001',
      shippingCountry: 'USA',
      paymentMethod: 'credit_card',
    },
  ];

  for (const order of orderData) {
    // Filter out items with undefined productId or unitPrice
    const validItems = order.items.filter((item) => item.productId && item.unitPrice !== undefined);

    if (validItems.length === 0 || !order.customerId) {
      console.warn('Skipping order with invalid data');
      continue;
    }

    const subtotal = validItems.reduce(
      (sum, item) => sum + (item.unitPrice as number) * item.quantity,
      0
    );
    const tax = subtotal * 0.1;
    const shipping = subtotal > 100 ? 0 : 10;
    const total = subtotal + tax + shipping;

    await ordersDb.order.create({
      data: {
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        subtotal,
        tax,
        shipping,
        total,
        currency: 'USD',
        status: order.status,
        // Shipping Address
        shippingStreet: order.shippingStreet,
        shippingCity: order.shippingCity,
        shippingState: order.shippingState,
        shippingPostalCode: order.shippingPostalCode,
        shippingCountry: order.shippingCountry,
        // Payment
        paymentMethod: order.paymentMethod,
        items: {
          create: validItems.map((item) => ({
            productId: item.productId as string,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice as number,
            total: (item.unitPrice as number) * item.quantity,
          })),
        },
      },
    });
  }

  const createdOrders = await ordersDb.order.findMany({
    include: { items: true },
  });
  logSuccess(`Created ${createdOrders.length} orders`);
}

async function main() {
  try {
    // Clear existing data
    console.log('Clearing existing data...');
    await ordersDb.orderItem.deleteMany();
    await ordersDb.order.deleteMany();
    await productsDb.product.deleteMany();
    await usersDb.user.deleteMany();

    // Seed data
    const users = await seedUsers();
    const products = await seedProducts();
    await seedOrders(users, products);

    logSuccess('\nSeeding completed successfully!');
  } catch (error) {
    logError(`Seeding failed: ${error}`);
    process.exit(1);
  } finally {
    await usersDb.$disconnect();
    await productsDb.$disconnect();
    await ordersDb.$disconnect();
  }
}

main();
