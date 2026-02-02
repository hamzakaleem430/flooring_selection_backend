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
import chatRoutes from "./routes/chat/chatRoutes.js";
import messagesRoutes from "./routes/chat/messageRoutes.js";
import notificationRoutes from "./routes/notificationRoute.js";
import productRoutes from "./routes/productRoutes.js";
import suggestedProductRoutes from "./routes/suggestedProductsRoute.js";
import selectedProductsRoutes from "./routes/selectedProductsRoutes.js";
import projectLogRoutes from "./routes/projectLogRoutes.js";
import recommendationRoutes from "./routes/recommendationRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";

// Config Dotenv
dotenv.config();

// Database Connection
db();

// Middlewares
const app = express();

app.use(express.json());
app.use(cors());
app.use(cookieParser());
app.use(morgan("dev"));

// Socket Server
const server = http.createServer(app);
initialSocketServer(server);

// Rest API's
app.use("/api/v1/auth", userRoutes);
app.use("/api/v1/project", projectRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/messages", messagesRoutes);
app.use("/api/v1/notification", notificationRoutes);
app.use("/api/v1/product", productRoutes);
app.use("/api/v1/suggestedProducts", suggestedProductRoutes);
app.use("/api/v1/selectedProducts", selectedProductsRoutes);
app.use("/api/v1/projectLogs", projectLogRoutes);
app.use("/api/v1/recommendations", recommendationRoutes);
app.use("/api/v1/order", orderRoutes);

// Server
app.use("/", (req, res) => {
  res.send(`<h1>Server is running...</h1>`);
});

// Listening
const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`.bgGreen.white);
});
