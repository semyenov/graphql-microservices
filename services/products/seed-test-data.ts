#!/usr/bin/env bun

import { PrismaClient } from './generated/prisma';

const prisma = new PrismaClient();

async function seedTestData() {
  console.log('🌱 Seeding test data for Products Service...');

  try {
    // Clear existing data
    await prisma.product.deleteMany();
    console.log('✅ Cleared existing products');

    // Create test products
    const products = [
      {
        id: 'product-test-1',
        name: 'Laptop Pro',
        description: 'High-performance laptop for professionals',
        price: 1299.99,
        stock: 50,
        sku: 'LAP-PRO-001',
        category: 'Electronics',
        tags: ['laptop', 'computer', 'professional'],
        imageUrl: 'https://example.com/laptop.jpg',
        isActive: true,
      },
      {
        id: 'product-test-2',
        name: 'Wireless Mouse',
        description: 'Ergonomic wireless mouse with precision tracking',
        price: 39.99,
        stock: 200,
        sku: 'MOUSE-WL-001',
        category: 'Electronics',
        tags: ['mouse', 'wireless', 'accessories'],
        imageUrl: 'https://example.com/mouse.jpg',
        isActive: true,
      },
      {
        id: 'product-test-3',
        name: 'USB-C Hub',
        description: '7-in-1 USB-C hub with multiple ports',
        price: 49.99,
        stock: 150,
        sku: 'HUB-USBC-001',
        category: 'Electronics',
        tags: ['hub', 'usb-c', 'accessories'],
        imageUrl: 'https://example.com/hub.jpg',
        isActive: true,
      },
      {
        id: 'product-test-4',
        name: 'Mechanical Keyboard',
        description: 'RGB mechanical keyboard with Cherry MX switches',
        price: 149.99,
        stock: 0, // Out of stock
        sku: 'KB-MECH-001',
        category: 'Electronics',
        tags: ['keyboard', 'mechanical', 'gaming'],
        imageUrl: 'https://example.com/keyboard.jpg',
        isActive: false, // Inactive product
      },
    ];

    for (const product of products) {
      await prisma.product.create({ data: product });
      console.log(`✅ Created product: ${product.name}`);
    }

    console.log('\n🎉 Test data seeded successfully!');
    console.log(`Total products: ${products.length}`);
    console.log(`Active products: ${products.filter((p) => p.isActive).length}`);
    console.log(`Categories: ${[...new Set(products.map((p) => p.category))].join(', ')}`);
  } catch (error) {
    console.error('❌ Error seeding test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedTestData();
