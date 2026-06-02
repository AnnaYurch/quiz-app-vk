import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DEFAULT_POINTS = 10;

// Храним состояние комнаты в памяти процесса.
// Для MVP это самый простой способ отслеживать текущий вопрос и не пускать ответы вне активного экрана.
const roomState = new Map();

const getRoomState = (roomCode, quizId) => {
  if (!roomState.has(roomCode)) {
    roomState.set(roomCode, {
      quizId,
      currentQuestionIndex: -1,
      started: false,
      finished: false,
      answeredSessions: new Map(),
      participants: new Map(),
      organizerSocketId: null,
    });
  }

  return roomState.get(roomCode);
};

const sanitizeQuestion = (question) => ({
  id: question.id,
  quizId: question.quizId,
  type: question.type,
  answerType: question.answerType,
  content: question.content,
  order: question.order,
  options: question.options.map((option) => ({
    id: option.id,
    text: option.text,
  })),
});

const buildLeaderboard = async (quizId) => {
  const sessions = await prisma.quizSession.findMany({
    where: { quizId },
    orderBy: [{ score: "desc" }, { id: "asc" }],
    select: {
      id: true,
      participantName: true,
      score: true,
      status: true,
      userId: true,
    },
  });

  return sessions;
};

const getCurrentQuestion = async (quizId, currentIndex) => {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: {
        include: {
          options: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!quiz || quiz.questions.length === 0) {
    return { quiz, question: null };
  }

  return {
    quiz,
    question: quiz.questions[currentIndex] || null,
  };
};

const verifySocketUser = (socket) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

const emitLeaderboard = async (io, roomCode, quizId) => {
  const leaderboard = await buildLeaderboard(quizId);
  io.to(roomCode).emit("leaderboard", leaderboard);
  return leaderboard;
};

const emitParticipants = (io, roomCode, state) => {
  const participants = Array.from(state.participants.values()).sort((first, second) =>
    first.participantName.localeCompare(second.participantName)
  );

  io.to(roomCode).emit("participants_update", participants);
  return participants;
};

const loadQuizByPayload = async (payloadRoomCode, payloadQuizId) => {
  if (payloadQuizId) {
    return prisma.quiz.findUnique({
      where: { id: Number(payloadQuizId) },
      include: {
        questions: {
          include: { options: true },
          orderBy: { order: "asc" },
        },
      },
    });
  }

  if (payloadRoomCode) {
    return prisma.quiz.findUnique({
      where: { roomCode: payloadRoomCode },
      include: {
        questions: {
          include: { options: true },
          orderBy: { order: "asc" },
        },
      },
    });
  }

  return null;
};

export const initSocket = (io) => {
  io.use((socket, next) => {
    // Если клиент передал JWT в handshake.auth.token, сохраним пользователя в socket.data.
    // Это нужно, чтобы организатор мог запускать квиз через socket без отдельного HTTP-запроса.
    socket.data.user = verifySocketUser(socket);
    next();
  });

  io.on("connection", (socket) => {
    // Участник входит в комнату по 6-значному roomCode и получает отдельную запись QuizSession.
    socket.on("join_room", async (payload, callback) => {
      try {
        const { roomCode, participantName, isOrganizer } = payload || {};

        if (!roomCode) {
          const error = { message: "roomCode обязателен" };
          if (callback) callback(error);
          return;
        }

        const quiz = await prisma.quiz.findUnique({
          where: { roomCode },
          include: {
            questions: {
              include: { options: true },
              orderBy: { order: "asc" },
            },
          },
        });

        if (!quiz) {
          const error = { message: "Квиз с таким кодом комнаты не найден" };
          if (callback) callback(error);
          return;
        }

        socket.data.roomCode = roomCode;
        socket.data.quizId = quiz.id;
        socket.data.isOrganizer = Boolean(isOrganizer);

        await socket.join(roomCode);

        const state = getRoomState(roomCode, quiz.id);

        if (isOrganizer) {
          state.organizerSocketId = socket.id;
          roomState.set(roomCode, state);

          if (callback) callback({ ok: true, quizId: quiz.id, roomCode, isOrganizer: true });
          return;
        }

        if (!participantName) {
          const error = { message: "participantName обязателен" };
          if (callback) callback(error);
          return;
        }

        const session = await prisma.quizSession.create({
          data: {
            quizId: quiz.id,
            userId: socket.data.user?.id || null,
            participantName,
            status: "ACTIVE",
          },
        });

        socket.data.quizSessionId = session.id;

        state.participants.set(socket.id, {
          socketId: socket.id,
          sessionId: session.id,
          participantName,
          userId: socket.data.user?.id || null,
        });
        roomState.set(roomCode, state);

        const participant = {
          socketId: socket.id,
          sessionId: session.id,
          participantName,
          userId: socket.data.user?.id || null,
        };

        io.to(roomCode).emit("participant_joined", participant);
        emitParticipants(io, roomCode, state);

        if (callback) callback({ ok: true, sessionId: session.id, quizId: quiz.id });
      } catch (error) {
        if (callback) callback({ message: "Не удалось войти в комнату" });
      }
    });

    // Организатор запускает квиз и получает первый вопрос.
    socket.on("start_quiz", async (payload, callback) => {
      try {
        const { roomCode: payloadRoomCode, quizId: payloadQuizId } = payload || {};
        const roomCode = payloadRoomCode || socket.data.roomCode;
        const quizId = payloadQuizId ? Number(payloadQuizId) : socket.data.quizId;

        if (!roomCode && !quizId) {
          const error = { message: "roomCode или quizId обязателен" };
          if (callback) callback(error);
          return;
        }

        const quiz = await loadQuizByPayload(roomCode, quizId);

        if (!quiz) {
          const error = { message: "Квиз не найден" };
          if (callback) callback(error);
          return;
        }

        if (socket.data.user?.role !== "ORGANIZER" || socket.data.user?.id !== quiz.organizerId) {
          const error = { message: "Только организатор этого квиза может запускать игру" };
          if (callback) callback(error);
          return;
        }

        if (quiz.questions.length === 0) {
          const error = { message: "Нельзя запустить квиз без вопросов" };
          if (callback) callback(error);
          return;
        }

        const state = roomState.get(roomCode) || {
          quizId: quiz.id,
          currentQuestionIndex: -1,
          started: false,
          finished: false,
          answeredSessions: new Map(),
        };

        state.quizId = quiz.id;
        state.currentQuestionIndex = 0;
        state.started = true;
        state.finished = false;
        state.answeredSessions = new Map();
        roomState.set(roomCode, state);

        const question = sanitizeQuestion(quiz.questions[0]);

        // Важно: на клиент отправляем только текст вариантов ответа без isCorrect.
        // Это защищает игру от прямого просмотра правильных вариантов в DevTools.
        io.to(roomCode).emit("quiz_started", {
          roomCode,
          quizId: quiz.id,
          question,
          questionIndex: 0,
          totalQuestions: quiz.questions.length,
        });

        io.to(roomCode).emit("new_question", {
          roomCode,
          quizId: quiz.id,
          question,
          questionIndex: 0,
          totalQuestions: quiz.questions.length,
        });

        await emitLeaderboard(io, roomCode, quiz.id);

        if (callback) callback({ ok: true });
      } catch (error) {
        if (callback) callback({ message: "Не удалось запустить квиз" });
      }
    });

    // Проверяем ответ только относительно текущего вопроса комнаты.
    // Если участник прислал ответ слишком рано или слишком поздно, сервер его не засчитывает.
    socket.on("submit_answer", async (payload, callback) => {
      try {
        const { questionId, selectedOptionIds } = payload || {};
        const roomCode = socket.data.roomCode;
        const quizId = socket.data.quizId;
        const sessionId = socket.data.quizSessionId;

        if (!roomCode || !quizId || !sessionId) {
          const error = { message: "Сначала участник должен войти в комнату" };
          if (callback) callback(error);
          return;
        }

        const state = roomState.get(roomCode);

        if (!state || !state.started || state.finished) {
          const error = { message: "Квиз не активен" };
          if (callback) callback(error);
          return;
        }

        const { quiz, question } = await getCurrentQuestion(quizId, state.currentQuestionIndex);

        if (!question || question.id !== Number(questionId)) {
          const error = { message: "Сейчас идет другой вопрос" };
          if (callback) callback(error);
          return;
        }

        const selectedIds = Array.isArray(selectedOptionIds)
          ? selectedOptionIds.map((optionId) => Number(optionId))
          : [];

        const isCorrect = question.options.every((option) => {
          const wasSelected = selectedIds.includes(option.id);
          return option.isCorrect ? wasSelected : !wasSelected;
        });

        // Защита от повторной отправки ответа на тот же вопрос одним и тем же участником.
        const answeredQuestions = state.answeredSessions.get(sessionId) || new Set();
        if (answeredQuestions.has(question.id)) {
          const error = { message: "Ответ на этот вопрос уже был отправлен" };
          if (callback) callback(error);
          return;
        }

        answeredQuestions.add(question.id);
        state.answeredSessions.set(sessionId, answeredQuestions);

        if (isCorrect) {
          await prisma.quizSession.update({
            where: { id: sessionId },
            data: {
              score: {
                increment: DEFAULT_POINTS,
              },
            },
          });
        }

        await emitLeaderboard(io, roomCode, quizId);

        if (callback) {
          callback({
            ok: true,
            isCorrect,
            pointsAwarded: isCorrect ? DEFAULT_POINTS : 0,
          });
        }
      } catch (error) {
        if (callback) callback({ message: "Не удалось обработать ответ" });
      }
    });

    // Переход к следующему вопросу. Сервер сам вычисляет актуальный вопрос и снова скрывает isCorrect.
    socket.on("next_question", async (payload, callback) => {
      try {
        const { roomCode: payloadRoomCode, quizId: payloadQuizId } = payload || {};
        const roomCode = payloadRoomCode || socket.data.roomCode;
        const quizId = payloadQuizId ? Number(payloadQuizId) : socket.data.quizId;

        if (!roomCode && !quizId) {
          const error = { message: "roomCode или quizId обязателен" };
          if (callback) callback(error);
          return;
        }

        const quiz = await loadQuizByPayload(roomCode, quizId);

        if (!quiz) {
          const error = { message: "Квиз не найден" };
          if (callback) callback(error);
          return;
        }

        if (socket.data.user?.role !== "ORGANIZER" || socket.data.user?.id !== quiz.organizerId) {
          const error = { message: "Только организатор может переключать вопросы" };
          if (callback) callback(error);
          return;
        }

        const state = roomState.get(roomCode);

        if (!state || !state.started || state.finished) {
          const error = { message: "Квиз еще не запущен или уже завершен" };
          if (callback) callback(error);
          return;
        }

        const nextIndex = state.currentQuestionIndex + 1;

        if (nextIndex >= quiz.questions.length) {
          const error = { message: "Вопросы закончились. Завершите квиз через end_quiz." };
          if (callback) callback(error);
          return;
        }

        state.currentQuestionIndex = nextIndex;
        state.answeredSessions = new Map();
        roomState.set(roomCode, state);

        const nextQuestion = sanitizeQuestion(quiz.questions[nextIndex]);

        io.to(roomCode).emit("next_question", {
          roomCode,
          quizId: quiz.id,
          question: nextQuestion,
          questionIndex: nextIndex,
          totalQuestions: quiz.questions.length,
        });

        io.to(roomCode).emit("new_question", {
          roomCode,
          quizId: quiz.id,
          question: nextQuestion,
          questionIndex: nextIndex,
          totalQuestions: quiz.questions.length,
        });

        if (callback) callback({ ok: true });
      } catch (error) {
        if (callback) callback({ message: "Не удалось перейти к следующему вопросу" });
      }
    });

    // Завершение квиза закрывает все активные сессии и отправляет финальную таблицу лидеров.
    socket.on("end_quiz", async (payload, callback) => {
      try {
        const { roomCode: payloadRoomCode, quizId: payloadQuizId } = payload || {};
        const roomCode = payloadRoomCode || socket.data.roomCode;
        const quizId = payloadQuizId ? Number(payloadQuizId) : socket.data.quizId;

        if (!roomCode && !quizId) {
          const error = { message: "roomCode или quizId обязателен" };
          if (callback) callback(error);
          return;
        }

        const quiz = await loadQuizByPayload(roomCode, quizId);

        if (!quiz) {
          const error = { message: "Квиз не найден" };
          if (callback) callback(error);
          return;
        }

        if (socket.data.user?.role !== "ORGANIZER" || socket.data.user?.id !== quiz.organizerId) {
          const error = { message: "Только организатор может завершать квиз" };
          if (callback) callback(error);
          return;
        }

        await prisma.quizSession.updateMany({
          where: {
            quizId: quiz.id,
            status: "ACTIVE",
          },
          data: {
            status: "FINISHED",
          },
        });

        const leaderboard = await emitLeaderboard(io, roomCode, quiz.id);

        const state = roomState.get(roomCode);
        if (state) {
          state.finished = true;
          roomState.set(roomCode, state);
        }

        io.to(roomCode).emit("quiz_finished", {
          roomCode,
          leaderboard,
        });

        if (callback) callback({ ok: true });
      } catch (error) {
        if (callback) callback({ message: "Не удалось завершить квиз" });
      }
    });

    socket.on("disconnect", async () => {
      const roomCode = socket.data.roomCode;

      if (!roomCode) {
        return;
      }

      const state = roomState.get(roomCode);

      if (!state) {
        return;
      }

      if (socket.data.isOrganizer) {
        state.organizerSocketId = null;
      } else {
        state.participants.delete(socket.id);
        emitParticipants(io, roomCode, state);
      }

      roomState.set(roomCode, state);
    });
  });
};
