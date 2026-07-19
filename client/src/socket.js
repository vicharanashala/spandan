import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4001";

export const socket = io(SERVER_URL, {
  autoConnect: true,
});
