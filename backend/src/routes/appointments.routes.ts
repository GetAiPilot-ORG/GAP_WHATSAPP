import { Router } from "express";
import { getAppointments, updateAppointmentStatus, deleteAppointment } from "../controllers/appointments.controller.js";

const router = Router();

// GET /api/appointments
router.get("/", getAppointments);

// PATCH /api/appointments/:id/status
router.patch("/:id/status", updateAppointmentStatus);

// DELETE /api/appointments/:id
router.delete("/:id", deleteAppointment);

export default router;
