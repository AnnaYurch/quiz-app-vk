import { randomInt } from "crypto";
import { prisma } from "../lib/prisma.js";

// Набор символов для генерации 6-значного буквенно-цифрового кода комнаты.
// Код нужен участникам для входа в квиз, поэтому он должен быть коротким, удобным и уникальным.
const ROOM_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const generateRoomCode = () => {
  let code = "";

  for (let index = 0; index < 6; index += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }

  return code;
};

const buildQuizInclude = {
  questions: {
    include: {
      options: true,
    },
    orderBy: {
      order: "asc",
    },
  },
  organizer: {
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  },
};

const parseBoolean = (value, defaultValue) => {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  }

  return Boolean(value);
};

const createUniqueRoomCode = async () => {
  // Защита от коллизий: даже при коротком коде мы проверяем уникальность в БД.
  // Для MVP достаточно простого цикла с повторной генерацией.
  while (true) {
    const roomCode = generateRoomCode();
    const existingQuiz = await prisma.quiz.findUnique({
      where: { roomCode },
    });

    if (!existingQuiz) {
      return roomCode;
    }
  }
};

export const createQuiz = async (req, res, next) => {
  try {
    const { title, category, timePerQuestion, showCorrectAnswer, shuffleQuestions } = req.body;

    if (!title || !category || !timePerQuestion) {
      return res.status(400).json({ message: "title, category и timePerQuestion обязательны" });
    }

    const roomCode = await createUniqueRoomCode();

    const quiz = await prisma.quiz.create({
      data: {
        title,
        category,
        timePerQuestion: Number(timePerQuestion),
        showCorrectAnswer: parseBoolean(showCorrectAnswer, true),
        shuffleQuestions: parseBoolean(shuffleQuestions, false),
        roomCode,
        organizerId: req.user.id,
      },
      include: buildQuizInclude,
    });

    return res.status(201).json({
      message: "Квиз успешно создан",
      quiz,
    });
  } catch (error) {
    next(error);
  }
};

export const addQuestion = async (req, res, next) => {
  try {
    const { quizId, type, answerType, content, order, options } = req.body;

    if (!quizId || !type || !answerType || !content || !Array.isArray(options)) {
      return res.status(400).json({
        message: "quizId, type, answerType, content и options обязательны",
      });
    }

    if (options.length !== 4) {
      return res.status(400).json({ message: "Для вопроса нужно ровно 4 варианта ответа" });
    }

    const quiz = await prisma.quiz.findFirst({
      where: {
        id: Number(quizId),
        organizerId: req.user.id,
      },
    });

    if (!quiz) {
      return res.status(404).json({ message: "Квиз не найден или недоступен" });
    }

    const maxOrderQuestion = await prisma.question.findFirst({
      where: { quizId: Number(quizId) },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const nextOrder = Number.isInteger(Number(order))
      ? Number(order)
      : (maxOrderQuestion?.order ?? 0) + 1;

    const correctOptionsCount = options.filter((option) => Boolean(option.isCorrect)).length;

    if (answerType === "SINGLE" && correctOptionsCount !== 1) {
      return res.status(400).json({ message: "Для SINGLE должен быть ровно один правильный ответ" });
    }

    if (answerType === "MULTIPLE" && correctOptionsCount === 0) {
      return res.status(400).json({ message: "Для MULTIPLE должен быть хотя бы один правильный ответ" });
    }

    const question = await prisma.question.create({
      data: {
        quizId: Number(quizId),
        type,
        answerType,
        content,
        order: nextOrder,
        options: {
          create: options.map((option) => ({
            text: option.text,
            isCorrect: Boolean(option.isCorrect),
          })),
        },
      },
      include: {
        options: true,
      },
    });

    return res.status(201).json({
      message: "Вопрос добавлен",
      question,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyQuizzes = async (req, res, next) => {
  try {
    const quizzes = await prisma.quiz.findMany({
      where: {
        organizerId: req.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        _count: {
          select: {
            questions: true,
            sessions: true,
          },
        },
      },
    });

    return res.status(200).json({ quizzes });
  } catch (error) {
    next(error);
  }
};

export const getQuizByRoomCode = async (req, res, next) => {
  try {
    const { roomCode } = req.params;

    const quiz = await prisma.quiz.findUnique({
      where: { roomCode },
      include: buildQuizInclude,
    });

    if (!quiz) {
      return res.status(404).json({ message: "Квиз не найден" });
    }

    return res.status(200).json({ quiz });
  } catch (error) {
    next(error);
  }
};