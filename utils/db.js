import mongoose from "mongoose";
import colors from "colors";

const db = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to MongoDB ${conn.connection.host}`.bgGreen.white);
  } catch (error) {
    console.log(error);
  }
};

export default db;
