import { z } from "zod";

const availability = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMin: z.number().int().min(0).max(1470),
  endMin: z.number().int().min(0).max(1470),
});

const hardSet = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMin: z.number().int().min(0).max(1470),
  endMin: z.number().int().min(0).max(1470),
  weekStart: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const employeeInput = z.object({
  name: z.string().min(1),
  employmentType: z.enum(["FULL_TIME", "PART_TIME"]).default("PART_TIME"),
  isManager: z.boolean().default(false),
  isGM: z.boolean().default(false),
  isMinor: z.boolean().default(false),
  active: z.boolean().default(true),
  performance: z.number().int().min(1).max(5).default(3),
  minHoursPerWeek: z.number().int().min(0).nullable().optional(),
  maxHoursPerWeek: z.number().int().min(0).nullable().optional(),
  availability: z.array(availability).default([]),
  hardSets: z.array(hardSet).default([]),
});

export const employeeUpdate = employeeInput.partial();

export const generateInput = z.object({
  name: z.string().min(1).default("Weekly schedule"),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const assignmentUpsert = z.object({
  id: z.string().optional(),
  employeeId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startMin: z.number().int().min(0).max(1470),
  endMin: z.number().int().min(0).max(1470),
  locked: z.boolean().optional(),
});

// Whole-draft save from the grid / timeline editors. The client buffers all
// manual edits locally and sends the complete assignment set at once; the route
// reconciles it against the persisted rows in a single transaction.
export const assignmentBulk = z.object({
  assignments: z.array(
    z.object({
      id: z.string().optional(),
      employeeId: z.string(),
      dayOfWeek: z.number().int().min(0).max(6),
      startMin: z.number().int().min(0).max(1470),
      endMin: z.number().int().min(0).max(1470),
      locked: z.boolean().optional(),
      source: z.enum(["SOLVER", "MANUAL", "HARDSET"]).optional(),
    }),
  ),
});

export const changeInput = z.object({
  employeeId: z.string(),
  type: z.enum(["DAY_OFF", "TERMINATION", "SUSPENSION", "LEAVE_OF_ABSENCE", "AVAILABILITY_CHANGE"]),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  startMin: z.number().int().nullable().optional(),
  endMin: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
  payload: z.any().optional(),
});
