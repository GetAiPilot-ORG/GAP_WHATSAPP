import { Router } from "express";
import { getAppointments, updateAppointmentStatus, deleteAppointment, createAppointment, getAppointmentJoin } from "../controllers/appointments.controller.js";

const router = Router();

// GET /api/appointments
router.get("/", getAppointments);

// GET /api/appointments/:id/join (Masked link gateway)
router.get("/:id/join", getAppointmentJoin);

// POST /api/appointments
router.post("/", createAppointment);

// PATCH /api/appointments/:id/status
router.patch("/:id/status", updateAppointmentStatus);

// DELETE /api/appointments/:id
router.delete("/:id", deleteAppointment);

export default router;
