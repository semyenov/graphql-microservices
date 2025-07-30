#!/usr/bin/env bun

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

async function seedOrders(users: any[], products: any[]) {
  console.log('Seeding orders...');

  // Create some sample orders
  const orderData = [
    {
      userId: users[1].id, // John Doe
      items: [
        { productId: products[0].id, quantity: 1, price: products[0].price },
        { productId: products[2].id, quantity: 2, price: products[2].price },
      ],
      status: 'DELIVERED' as const,
      shippingInfo: {
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA',
        phone: '+1234567891',
      },
    },
    {
      userId: users[2].id, // Jane Doe
      items: [{ productId: products[1].id, quantity: 1, price: products[1].price }],
      status: 'PROCESSING' as const,
      shippingInfo: {
        address: '456 Oak Ave',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90001',
        country: 'USA',
        phone: '+1234567892',
      },
    },
    {
      userId: users[1].id, // John Doe
      items: [
        { productId: products[4].id, quantity: 1, price: products[4].price },
        { productId: products[7].id, quantity: 1, price: products[7].price },
      ],
      status: 'PENDING' as const,
      shippingInfo: {
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA',
        phone: '+1234567891',
      },
    },
  ];

  for (const order of orderData) {
    const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = subtotal * 0.1;
    const shipping = subtotal > 100 ? 0 : 10;
    const total = subtotal + tax + shipping;

    await ordersDb.order.create({
      data: {
        userId: order.userId,
        subtotal,
        tax,
        shipping,
        total,
        status: order.status,
        shippingInfo: order.shippingInfo,
        items: {
          create: order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity,
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
