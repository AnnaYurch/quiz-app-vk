import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DEFAULT_POINTS = 10;

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
      timerTimeout: null,
      timePerQuestion: 30,
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

// Полный вопрос с правильными ответами — отправляется только после истечения времени
const sanitizeQuestionWithAnswers = (question) => ({
  id: question.id,
  quizId: question.quizId,
  type: question.type,
  answerType: question.answerType,
  content: question.content,
  order: question.order,
  options: question.options.map((option) => ({
    id: option.id,
    text: option.text,
    isCorrect: option.isCorrect,
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
        include: { options: true },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!quiz || quiz.questions.length === 0) {
    return { quiz, question: null };
  }

  return { quiz, question: quiz.questions[currentIndex] || null };
};

const verifySocketUser = (socket) => {
  const token = socket.handshake.auth?.token;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

const emitLeaderboard = async (io, roomCode, quizId) => {
  const leaderboard = await buildLeaderboard(quizId);
  io.to(roomCode).emit("leaderboard", leaderboard);
  return leaderboard;
};

const emitParticipants = (io, roomCode, state) => {
  const participants = Array.from(state.participants.values()).sort((a, b) =>
    a.participantName.localeCompare(b.participantName)
  );
  io.to(roomCode).emit("participants_update", participants);
  return participants;
};

const loadQuizByPayload = async (payloadRoomCode, payloadQuizId) => {
  if (payloadQuizId) {
    return prisma.quiz.findUnique({
      where: { id: Number(payloadQuizId) },
      include: {
        questions: { include: { options: true }, orderBy: { order: "asc" } },
      },
    });
  }
  if (payloadRoomCode) {
    return prisma.quiz.findUnique({
      where: { roomCode: payloadRoomCode },
      include: {
        questions: { include: { options: true }, orderBy: { order: "asc" } },
      },
    });
  }
  return null;
};

// Запускает серверный таймер для текущего вопроса.
// По истечении времени рассылает quiz_time_up с правильными ответами.
const startQuestionTimer = (io, roomCode, quiz, state, question, questionIndex) => {
  // Сбрасываем предыдущий таймер, если был
  if (state.timerTimeout) {
    clearTimeout(state.timerTimeout);
    state.timerTimeout = null;
  }

  const seconds = state.timePerQuestion || quiz.timePerQuestion || 30;

  // Сообщаем всем в комнате метку времени окончания, чтобы клиенты
  // могли рисовать обратный отсчёт независимо и синхронно
  const endsAt = Date.now() + seconds * 1000;
  io.to(roomCode).emit("timer_start", { endsAt, seconds });

  state.timerTimeout = setTimeout(async () => {
    try {
      // Достаём вопрос свежо из БД, чтобы получить isCorrect
      const fresh = await prisma.question.findUnique({
        where: { id: question.id },
        include: { options: true },
      });

      if (fresh) {
        io.to(roomCode).emit("quiz_time_up", {
          questionId: fresh.id,
          questionIndex,
          question: sanitizeQuestionWithAnswers(fresh),
        });
      }

      await emitLeaderboard(io, roomCode, state.quizId);
    } catch (err) {
      console.error("timer error", err);
    }
  }, seconds * 1000);
};

export const initSocket = (io) => {
  io.use((socket, next) => {
    socket.data.user = verifySocketUser(socket);
    next();
  });

  io.on("connection", (socket) => {

    socket.on("join_room", async (payload, callback) => {
      try {
        const { roomCode, participantName, isOrganizer } = payload || {};

        if (!roomCode) {
          if (callback) callback({ message: "roomCode обязателен" });
          return;
        }

        const quiz = await prisma.quiz.findUnique({
          where: { roomCode },
          include: {
            questions: { include: { options: true }, orderBy: { order: "asc" } },
          },
        });

        if (!quiz) {
          if (callback) callback({ message: "Квиз с таким кодом комнаты не найден" });
          return;
        }

        socket.data.roomCode = roomCode;
        socket.data.quizId = quiz.id;
        socket.data.isOrganizer = Boolean(isOrganizer);

        await socket.join(roomCode);

        const state = getRoomState(roomCode, quiz.id);
        state.timePerQuestion = quiz.timePerQuestion;

        if (isOrganizer) {
          state.organizerSocketId = socket.id;
          roomState.set(roomCode, state);
          if (callback) callback({ ok: true, quizId: quiz.id, roomCode, isOrganizer: true });
          return;
        }

        if (!participantName) {
          if (callback) callback({ message: "participantName обязателен" });
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

        // Если квиз уже идёт — сразу отправляем текущий вопрос и таймер
        if (state.started && !state.finished && state.currentQuestionIndex >= 0) {
          const { question } = await getCurrentQuestion(quiz.id, state.currentQuestionIndex);
          if (question) {
            socket.emit("quiz_started", {
              roomCode,
              quizId: quiz.id,
              question: sanitizeQuestion(question),
              questionIndex: state.currentQuestionIndex,
              totalQuestions: quiz.questions.length,
            });
          }
        }

        if (callback) callback({ ok: true, sessionId: session.id, quizId: quiz.id });
      } catch {
        if (callback) callback({ message: "Не удалось войти в комнату" });
      }
    });

    socket.on("start_quiz", async (payload, callback) => {
      try {
        const { roomCode: payloadRoomCode, quizId: payloadQuizId } = payload || {};
        const roomCode = payloadRoomCode || socket.data.roomCode;
        const quizId = payloadQuizId ? Number(payloadQuizId) : socket.data.quizId;

        if (!roomCode && !quizId) {
          if (callback) callback({ message: "roomCode или quizId обязателен" });
          return;
        }

        const quiz = await loadQuizByPayload(roomCode, quizId);

        if (!quiz) {
          if (callback) callback({ message: "Квиз не найден" });
          return;
        }

        if (socket.data.user?.role !== "ORGANIZER" || socket.data.user?.id !== quiz.organizerId) {
          if (callback) callback({ message: "Только организатор этого квиза может запускать игру" });
          return;
        }

        if (quiz.questions.length === 0) {
          if (callback) callback({ message: "Нельзя запустить квиз без вопросов" });
          return;
        }

        const state = getRoomState(roomCode, quiz.id);
        state.quizId = quiz.id;
        state.currentQuestionIndex = 0;
        state.started = true;
        state.finished = false;
        state.answeredSessions = new Map();
        state.timePerQuestion = quiz.timePerQuestion;
        roomState.set(roomCode, state);

        const question = quiz.questions[0];
        const sanitized = sanitizeQuestion(question);

        // Отправляем только quiz_started — убираем дублирование new_question
        io.to(roomCode).emit("quiz_started", {
          roomCode,
          quizId: quiz.id,
          question: sanitized,
          questionIndex: 0,
          totalQuestions: quiz.questions.length,
        });

        await emitLeaderboard(io, roomCode, quiz.id);

        // Запускаем таймер после рассылки вопроса
        startQuestionTimer(io, roomCode, quiz, state, question, 0);

        if (callback) callback({ ok: true });
      } catch {
        if (callback) callback({ message: "Не удалось запустить квиз" });
      }
    });

    socket.on("submit_answer", async (payload, callback) => {
      try {
        const { questionId, selectedOptionIds } = payload || {};
        const roomCode = socket.data.roomCode;
        const quizId = socket.data.quizId;
        const sessionId = socket.data.quizSessionId;

        if (!roomCode || !quizId || !sessionId) {
          if (callback) callback({ message: "Сначала участник должен войти в комнату" });
          return;
        }

        const state = roomState.get(roomCode);

        if (!state || !state.started || state.finished) {
          if (callback) callback({ message: "Квиз не активен" });
          return;
        }

        const { quiz, question } = await getCurrentQuestion(quizId, state.currentQuestionIndex);

        if (!question || question.id !== Number(questionId)) {
          if (callback) callback({ message: "Сейчас идет другой вопрос" });
          return;
        }

        const selectedIds = Array.isArray(selectedOptionIds)
          ? selectedOptionIds.map((id) => Number(id))
          : [];

        const isCorrect = question.options.every((option) => {
          const wasSelected = selectedIds.includes(option.id);
          return option.isCorrect ? wasSelected : !wasSelected;
        });

        const answeredQuestions = state.answeredSessions.get(sessionId) || new Set();
        if (answeredQuestions.has(question.id)) {
          if (callback) callback({ message: "Ответ на этот вопрос уже был отправлен" });
          return;
        }

        answeredQuestions.add(question.id);
        state.answeredSessions.set(sessionId, answeredQuestions);

        if (isCorrect) {
          await prisma.quizSession.update({
            where: { id: sessionId },
            data: { score: { increment: DEFAULT_POINTS } },
          });
        }

        await emitLeaderboard(io, roomCode, quizId);

        if (callback) callback({ ok: true, isCorrect, pointsAwarded: isCorrect ? DEFAULT_POINTS : 0 });
      } catch {
        if (callback) callback({ message: "Не удалось обработать ответ" });
      }
    });

    socket.on("next_question", async (payload, callback) => {
      try {
        const { roomCode: payloadRoomCode, quizId: payloadQuizId } = payload || {};
        const roomCode = payloadRoomCode || socket.data.roomCode;
        const quizId = payloadQuizId ? Number(payloadQuizId) : socket.data.quizId;

        if (!roomCode && !quizId) {
          if (callback) callback({ message: "roomCode или quizId обязателен" });
          return;
        }

        const quiz = await loadQuizByPayload(roomCode, quizId);

        if (!quiz) {
          if (callback) callback({ message: "Квиз не найден" });
          return;
        }

        if (socket.data.user?.role !== "ORGANIZER" || socket.data.user?.id !== quiz.organizerId) {
          if (callback) callback({ message: "Только организатор может переключать вопросы" });
          return;
        }

        const state = roomState.get(roomCode);

        if (!state || !state.started || state.finished) {
          if (callback) callback({ message: "Квиз еще не запущен или уже завершен" });
          return;
        }

        const nextIndex = state.currentQuestionIndex + 1;

        if (nextIndex >= quiz.questions.length) {
          if (callback) callback({ message: "Вопросы закончились. Завершите квиз через end_quiz." });
          return;
        }

        // Сбрасываем таймер предыдущего вопроса
        if (state.timerTimeout) {
          clearTimeout(state.timerTimeout);
          state.timerTimeout = null;
        }

        state.currentQuestionIndex = nextIndex;
        state.answeredSessions = new Map();
        roomState.set(roomCode, state);

        const nextQuestion = quiz.questions[nextIndex];
        const sanitized = sanitizeQuestion(nextQuestion);

        io.to(roomCode).emit("new_question", {
          roomCode,
          quizId: quiz.id,
          question: sanitized,
          questionIndex: nextIndex,
          totalQuestions: quiz.questions.length,
        });

        startQuestionTimer(io, roomCode, quiz, state, nextQuestion, nextIndex);

        if (callback) callback({ ok: true });
      } catch {
        if (callback) callback({ message: "Не удалось перейти к следующему вопросу" });
      }
    });

    socket.on("end_quiz", async (payload, callback) => {
      try {
        const { roomCode: payloadRoomCode, quizId: payloadQuizId } = payload || {};
        const roomCode = payloadRoomCode || socket.data.roomCode;
        const quizId = payloadQuizId ? Number(payloadQuizId) : socket.data.quizId;

        if (!roomCode && !quizId) {
          if (callback) callback({ message: "roomCode или quizId обязателен" });
          return;
        }

        const quiz = await loadQuizByPayload(roomCode, quizId);

        if (!quiz) {
          if (callback) callback({ message: "Квиз не найден" });
          return;
        }

        if (socket.data.user?.role !== "ORGANIZER" || socket.data.user?.id !== quiz.organizerId) {
          if (callback) callback({ message: "Только организатор может завершать квиз" });
          return;
        }

        const state = roomState.get(roomCode);
        if (state?.timerTimeout) {
          clearTimeout(state.timerTimeout);
          state.timerTimeout = null;
        }

        await prisma.quizSession.updateMany({
          where: { quizId: quiz.id, status: "ACTIVE" },
          data: { status: "FINISHED" },
        });

        const leaderboard = await emitLeaderboard(io, roomCode, quiz.id);

        if (state) {
          state.finished = true;
          roomState.set(roomCode, state);
        }

        io.to(roomCode).emit("quiz_finished", { roomCode, leaderboard });

        if (callback) callback({ ok: true });
      } catch {
        if (callback) callback({ message: "Не удалось завершить квиз" });
      }
    });

    socket.on("disconnect", async () => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;

      const state = roomState.get(roomCode);
      if (!state) return;

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
