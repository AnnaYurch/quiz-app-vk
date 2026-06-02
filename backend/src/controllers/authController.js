import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// Регистрация нового пользователя.
// Логика отдельно вынесена в контроллер, чтобы роуты оставались тонкими.
export const register = async (req, res, next) => {
  try {
    const { email, password, role, name } = req.body;

    if (!email || !password || !role || !name) {
      return res.status(400).json({ message: "Все поля обязательны" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({ message: "Пользователь с таким email уже существует" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role,
        name,
      },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      message: "Пользователь успешно зарегистрирован",
      user,
    });
  } catch (error) {
    next(error);
  }
};

// Авторизация пользователя и выпуск JWT-токена.
// Из ответа исключаем пароль, чтобы не утекали чувствительные данные.
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email и пароль обязательны" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ message: "Неверный email или пароль" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Неверный email или пароль" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getMyParticipationHistory = async (req, res, next) => {
  try {
    const sessions = await prisma.quizSession.findMany({
      where: {
        userId: req.user.id,
      },
      orderBy: {
        id: "desc",
      },
      select: {
        id: true,
        participantName: true,
        score: true,
        status: true,
        quiz: {
          select: {
            id: true,
            title: true,
            category: true,
            roomCode: true,
            createdAt: true,
          },
        },
      },
    });

    return res.status(200).json({ sessions });
  } catch (error) {
    next(error);
  }
};
