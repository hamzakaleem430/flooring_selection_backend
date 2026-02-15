/**
 * Database initialization script
 * Run this once to ensure all indexes are properly configured
 * Or call ensureIndexes() in your server startup
 */

import mongoose from 'mongoose';
import orderModel from '../models/orderModel.js';

/**
 * Ensures all indexes are properly configured, especially the sparse indexes
 */
export const ensureOrderIndexes = async () => {
  try {
    console.log('🔧 Checking and fixing order indexes...');
    
    const collection = mongoose.connection.collection('orders');
    const existingIndexes = await collection.indexes();
    
    // Check if invoiceNumber index exists and is sparse
    const invoiceIndex = existingIndexes.find(idx => idx.name === 'invoiceNumber_1');
    
    if (invoiceIndex && !invoiceIndex.sparse) {
      console.log('⚠️  Found non-sparse invoiceNumber index. Fixing...');
      
      // Drop the problematic index
      await collection.dropIndex('invoiceNumber_1');
      console.log('✅ Dropped old invoiceNumber index');
      
      // Create the correct sparse index
      await collection.createIndex(
        { invoiceNumber: 1 },
        { unique: true, sparse: true, name: 'invoiceNumber_1' }
      );
      console.log('✅ Created sparse invoiceNumber index');
    } else if (!invoiceIndex) {
      // Index doesn't exist, create it
      await collection.createIndex(
        { invoiceNumber: 1 },
        { unique: true, sparse: true, name: 'invoiceNumber_1' }
      );
      console.log('✅ Created sparse invoiceNumber index');
    } else {
      console.log('✅ invoiceNumber index is already correct (sparse)');
    }
    
    // Ensure other necessary indexes exist
    const indexes = [
      { key: { orderNumber: 1 }, options: { unique: true } },
      { key: { user: 1 }, options: {} },
      { key: { dealer: 1 }, options: {} },
      { key: { project: 1 }, options: {} },
      { key: { status: 1 }, options: {} },
      { key: { createdAt: -1 }, options: {} },
    ];
    
    for (const { key, options } of indexes) {
      const indexName = Object.keys(key).join('_');
      const exists = existingIndexes.some(idx => 
        JSON.stringify(idx.key) === JSON.stringify(key)
      );
      
      if (!exists) {
        await collection.createIndex(key, options);
        console.log(`✅ Created ${indexName} index`);
      }
    }
    
    console.log('✅ All order indexes are properly configured');
    return true;
  } catch (error) {
    console.error('❌ Error ensuring order indexes:', error.message);
    return false;
  }
};

/**
 * Call this in your server startup to ensure indexes are correct
 */
export const initializeDatabase = async () => {
  try {
    console.log('🚀 Initializing database indexes...');
    
    // Wait for mongoose connection
    if (mongoose.connection.readyState !== 1) {
      await new Promise((resolve) => {
        mongoose.connection.once('connected', resolve);
      });
    }
    
    // Ensure order indexes
    await ensureOrderIndexes();
    
    // Sync all model indexes (this will create missing indexes from schemas)
    await orderModel.syncIndexes();
    
    console.log('✅ Database initialization complete');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

export default { ensureOrderIndexes, initializeDatabase };
