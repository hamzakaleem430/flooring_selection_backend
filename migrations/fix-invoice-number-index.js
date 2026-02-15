// Migration script to fix the invoiceNumber unique index issue
// Run this script once to fix the database

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const fixInvoiceNumberIndex = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL || process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MongoDB connection string not found. Please set MONGO_URI in your .env file');
    }
    
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const ordersCollection = db.collection('orders');

    // Check existing indexes
    console.log('\nChecking existing indexes...');
    const indexes = await ordersCollection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    // Find the invoiceNumber index
    const invoiceNumberIndex = indexes.find(
      (idx) => idx.name === 'invoiceNumber_1'
    );

    if (invoiceNumberIndex) {
      console.log('\nFound invoiceNumber_1 index:', invoiceNumberIndex);

      // Check if it's sparse
      if (!invoiceNumberIndex.sparse) {
        console.log('\n❌ Index is NOT sparse - this is the problem!');
        console.log('Dropping the old index...');
        
        await ordersCollection.dropIndex('invoiceNumber_1');
        console.log('✅ Old index dropped successfully');

        // Create new sparse unique index
        console.log('\nCreating new sparse unique index...');
        await ordersCollection.createIndex(
          { invoiceNumber: 1 },
          { unique: true, sparse: true }
        );
        console.log('✅ New sparse unique index created successfully');
      } else {
        console.log('\n✅ Index is already sparse - no action needed');
      }
    } else {
      console.log('\n⚠️  invoiceNumber_1 index not found');
      console.log('Creating new sparse unique index...');
      await ordersCollection.createIndex(
        { invoiceNumber: 1 },
        { unique: true, sparse: true }
      );
      console.log('✅ New sparse unique index created successfully');
    }

    // Verify the fix
    console.log('\n--- Verification ---');
    const newIndexes = await ordersCollection.indexes();
    const newInvoiceIndex = newIndexes.find(
      (idx) => idx.name === 'invoiceNumber_1'
    );
    
    if (newInvoiceIndex) {
      console.log('✅ invoiceNumber_1 index exists');
      console.log('   Sparse:', newInvoiceIndex.sparse || false);
      console.log('   Unique:', newInvoiceIndex.unique || false);
      
      if (newInvoiceIndex.sparse && newInvoiceIndex.unique) {
        console.log('\n✅✅✅ SUCCESS! Index is now sparse and unique!');
        console.log('You can now create orders without issues.');
      } else {
        console.log('\n❌ Index configuration is incorrect');
        console.log('Please run this script again or manually fix the index');
      }
    }

    // Count orders with null invoiceNumber
    const nullInvoiceCount = await ordersCollection.countDocuments({
      invoiceNumber: null,
    });
    console.log(`\n📊 Orders with null invoiceNumber: ${nullInvoiceCount}`);

    // Count orders with invoiceNumber
    const withInvoiceCount = await ordersCollection.countDocuments({
      invoiceNumber: { $ne: null },
    });
    console.log(`📊 Orders with invoiceNumber: ${withInvoiceCount}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
};

// Run the migration
fixInvoiceNumberIndex()
  .then(() => {
    console.log('\n✅ Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
