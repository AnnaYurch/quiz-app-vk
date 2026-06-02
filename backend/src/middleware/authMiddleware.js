import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// Middleware проверяет JWT в заголовке Authorization: Bearer <token>.
// Если токен валиден, данные пользователя попадают в req.user.
export const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Токен авторизации не найден" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Недействительный или просроченный токен" });
  }
};
