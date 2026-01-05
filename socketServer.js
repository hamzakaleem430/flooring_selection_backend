import { Server as SocketIOServer } from "socket.io";
import userModel from "./models/userModel.js";

// Export io instance globally so it can be used in controllers
let io;

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

export const initialSocketServer = async (server) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: "*", // Configure with specific frontend URL in production
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", async (socket) => {
    console.log("Connected: User is online!");

    const { userID } = socket.handshake.query;

    // Check if userID is provided
    if (!userID || userID === 'undefined' || userID === 'null') {
      console.warn("UserID is missing or invalid in the connection handshake.");
      socket.disconnect(); // Prevent connecting without a valid user ID
      return;
    }

    console.log("User ID:", userID);

    let user;

    // Set the user's status to online
    try {
      user = await userModel.findByIdAndUpdate(
        userID,
        { isOnline: true },
        { new: true }
      );

      if (!user) {
        console.warn(`User with ID ${userID} not found in the database.`);
      } else {
        console.log(`User ${user.name} is now online.`);

        // Emit event for all users to update their chat lists
        io.emit("newUserData", { userID, isOnline: true });
      }
    } catch (error) {
      console.error("Error updating user's online status:", error);
    }

    // Join Chat
    socket.on("join chat", (room) => {
      if (!room) {
        console.error("Room is not provided!");
        return;
      }
      socket.join(room);
      console.log(`User joined room: ${room}`);
    });

    //------------------------- Listen for new message event--------------->
    socket.on("NewMessageAdded", (data) => {
      console.log("New Message Added: ", data);
      io.emit("fetchMessages", data);
    });

    // ---------------Typing------------>
    socket.on("typing", (room) => {
      console.log(`User ${userID} started typing in room: ${room}`);
      socket.in(room).emit("typing", { userID });
    });

    socket.on("stopTyping", (room) => {
      console.log(`User ${userID} stopped typing in room: ${room}`);
      socket.in(room).emit("stopTyping", { userID });
    });

    // ---------------Join Notification Room for User------------>
    socket.on("joinNotificationRoom", (userId) => {
      socket.join(`notification_${userId}`);
      console.log(`User ${userId} joined notification room`);
    });

    // -------------------------Handle disconnect User----------------->
    socket.on("disconnect", async () => {
      console.log(`User with ID: ${userID} disconnected!`);

      try {
        if (user && userID && userID !== 'undefined' && userID !== 'null') {
          await userModel.findByIdAndUpdate(
            userID,
            { isOnline: false },
            { new: true }
          );
          console.log(
            `User ${user.name || user.firstName + ' ' + user.lastName} is now offline.`
          );

          // Emit event for all users to update their chat lists
          io.emit("newUserData", { userID, isOnline: false });
        } else {
          console.warn(`User with ID ${userID} was not found when disconnecting.`);
        }
      } catch (error) {
        console.error("Error updating user's offline status:", error);
      }
    });

    // ---------End--------
  });
};
