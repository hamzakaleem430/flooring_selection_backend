import mongoose from "mongoose";
import colors from "colors";
import { initializeDatabase } from "./dbInit.js";

const db = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to MongoDB ${conn.connection.host}`.bgGreen.white);
    
    // Initialize database indexes (fixes the invoiceNumber sparse index issue)
    await initializeDatabase();
    
  } catch (error) {
    console.log(error);
  }
};

export default db;
