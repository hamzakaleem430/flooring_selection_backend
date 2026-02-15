#!/bin/bash

# Quick fix for order creation error
# This script drops the old invoiceNumber index and creates a new sparse one

echo "🔧 Fixing order creation error..."
echo ""

# Check if mongosh is installed
if ! command -v mongosh &> /dev/null; then
    echo "❌ mongosh is not installed or not in PATH"
    echo "Please install MongoDB Shell: https://www.mongodb.com/try/download/shell"
    echo ""
    echo "Or use the migration script instead:"
    echo "  node migrations/fix-invoice-number-index.js"
    exit 1
fi

# Get MongoDB connection string from .env
if [ -f .env ]; then
    source .env
    MONGO_CONN="${MONGO_URI:-${MONGO_URL:-$MONGODB_URI}}"
else
    echo "❌ .env file not found"
    echo "Please run this script from the backend directory:"
    echo "  cd /Users/hamzakaleem/Documents/flooring_selection_dir/flooring_selection_backend"
    exit 1
fi

if [ -z "$MONGO_CONN" ]; then
    echo "❌ MONGO_URI, MONGO_URL, or MONGODB_URI not found in .env"
    exit 1
fi

echo "📡 Connecting to MongoDB..."
echo ""

# Run the fix
mongosh "$MONGO_CONN" --quiet --eval '
console.log("✅ Connected to MongoDB");
console.log("");

// Drop old index
console.log("🗑️  Dropping old invoiceNumber index...");
try {
    db.orders.dropIndex("invoiceNumber_1");
    console.log("✅ Old index dropped");
} catch (e) {
    if (e.codeName === "IndexNotFound") {
        console.log("⚠️  Index not found (might not exist yet)");
    } else {
        console.log("❌ Error dropping index:", e.message);
    }
}
console.log("");

// Create new sparse index
console.log("🔨 Creating new sparse unique index...");
try {
    db.orders.createIndex({ invoiceNumber: 1 }, { unique: true, sparse: true });
    console.log("✅ New sparse unique index created");
} catch (e) {
    console.log("❌ Error creating index:", e.message);
}
console.log("");

// Verify
console.log("--- Verification ---");
const indexes = db.orders.getIndexes();
const invoiceIndex = indexes.find(idx => idx.name === "invoiceNumber_1");
if (invoiceIndex) {
    console.log("✅ invoiceNumber_1 index exists");
    console.log("   Sparse:", invoiceIndex.sparse || false);
    console.log("   Unique:", invoiceIndex.unique || false);
    console.log("");
    if (invoiceIndex.sparse && invoiceIndex.unique) {
        console.log("✅✅✅ SUCCESS! Index is now sparse and unique!");
        console.log("You can now create orders without issues.");
    } else {
        console.log("❌ Index configuration is incorrect");
        console.log("Please check the index manually");
    }
} else {
    console.log("❌ invoiceNumber_1 index not found after creation");
}
console.log("");

// Stats
const nullCount = db.orders.countDocuments({ invoiceNumber: null });
const withCount = db.orders.countDocuments({ invoiceNumber: { $ne: null } });
console.log("📊 Statistics:");
console.log("   Orders with null invoiceNumber:", nullCount);
console.log("   Orders with invoiceNumber:", withCount);
'

echo ""
echo "✅ Fix completed!"
echo ""
echo "Next steps:"
echo "1. Restart your backend server"
echo "2. Try creating an order again"
echo "3. It should work now!"
