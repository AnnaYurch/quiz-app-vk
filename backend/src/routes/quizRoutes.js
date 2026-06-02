import { Router } from "express";
import { addQuestion, createQuiz, getMyQuizzes, getQuizByRoomCode } from "../controllers/quizController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

// Простая проверка роли для защиты только организаторских маршрутов.
const requireOrganizer = (req, res, next) => {
  if (req.user?.role !== "ORGANIZER") {
    return res.status(403).json({ message: "Доступ разрешен только организатору" });
  }

  return next();
};

router.post("/", authMiddleware, requireOrganizer, createQuiz);
router.post("/:quizId/questions", authMiddleware, requireOrganizer, addQuestion);
router.get("/my", authMiddleware, requireOrganizer, getMyQuizzes);
router.get("/:roomCode", getQuizByRoomCode);

export default router;
