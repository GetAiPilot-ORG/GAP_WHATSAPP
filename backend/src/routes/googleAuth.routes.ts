import { Router } from "express";
import {
  getGoogleStatus,
  getGoogleAuthUrlController,
  handleGoogleCallbackController,
} from "../controllers/googleAuth.controller.js";

const router = Router();

router.get("/status", getGoogleStatus);
router.get("/auth-url", getGoogleAuthUrlController);
router.get("/callback", handleGoogleCallbackController);

export default router;
