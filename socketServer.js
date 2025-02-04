import { Server as SocketIOServer } from "socket.io";
import userModel from "./models/userModel.js";

export const initialSocketServer = async (server) => {
  const io = new SocketIOServer(server);

  io.on("connection", async (socket) => {
    console.log("Connected: User is online!");

    const { userID } = socket.handshake.query;

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
      console.log(" start Troom:", room);
      socket.in(room).emit("typing");
    });

    socket.on("stopTyping", (room) => {
      console.log(" stop Troom:", room);

      socket.in(room).emit("stopTyping");
    });

    // -------------------------Handle disconnect User----------------->
    socket.on("disconnect", async () => {
      console.log(`User with ID: ${userID} disconnected!`);

      try {
        if (user) {
          await userModel.findByIdAndUpdate(
            userID,
            { isOnline: false },
            { new: true }
          );
          console.log(
            `User ${user.firstName} ${user.lastName} is now offline.`
          );

          // Emit event for all users to update their chat lists
          io.emit("newUserData", { userID, isOnline: false });
        } else {
          console.warn(`User ${userID} was not found when disconnecting.`);
        }
      } catch (error) {
        console.error("Error updating user's offline status:", error);
      }
    });

    // ---------End--------
  });
};
