import express from "express";
import cors from "cors";
import morgan from "morgan";
import colors from "colors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import http from "http";
import db from "./utils/db.js";
import { initialSocketServer } from "./socketServer.js";
import userRoutes from "./routes/userRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";

// Config Dotenv
dotenv.config();

// Database Connection
db();
// Middleware
const app = express();
app.use(express.json());
app.use(cors());
// app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));

// Socket Server
const server = http.createServer(app);
initialSocketServer(server);

// Rest API's
app.use("/api/v1/auth", userRoutes);
app.use("/api/v1/project", projectRoutes);

// Server
app.use("/", (req, res) => {
  res.send(`<h1>Server is running...</h1>`);
});

// Listening
const PORT = process.env.PORT || 8083;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`.bgGreen.white);
});
