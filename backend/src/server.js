import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import authRoutes from "./routes/authRoutes.js";
import quizRoutes from "./routes/quizRoutes.js";
import { initSocket } from "./socket/quizSocket.js";

const app = express();

// Базовые middleware для принятия JSON и работы с фронтендом на другом origin.
app.use(cors());
app.use(express.json());

// HTTP сервер нужен, чтобы поверх него поднять Socket.io.
const server = http.createServer(app);

// Socket.io используется для real-time сценариев квиза.
// export ниже нужен, чтобы подключать io в других файлах проекта.
export const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
  },
});

// Регистрируем socket-обработчики после создания io, чтобы quiz-события были доступны сразу.
initSocket(io);

app.use("/api/auth", authRoutes);
app.use("/api/quizzes", quizRoutes);

// Простая проверка, что сервер жив.
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Централизованная обработка неожиданных ошибок.
app.use((error, req, res, next) => {
  // Логика оставлена простой: для MVP достаточно вернуть 500 и сообщение.
  console.error(error);
  res.status(500).json({ message: "Внутренняя ошибка сервера" });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
