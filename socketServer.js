import { Server as SocketIOServer } from "socket.io";

export const initialSocketServer = async (server) => {
  const io = new SocketIOServer(server);
};
