import { Router } from "express";
import { getMyParticipationHistory, login, register } from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/history", authMiddleware, getMyParticipationHistory);

export default router;
