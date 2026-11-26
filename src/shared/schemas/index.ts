import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(2, "Project name must be at least 2 characters").max(100),
  description: z.string().max(500).optional().nullable(),
  callbackUrl: z.string().url("Must be a valid URL").optional().nullable().or(z.literal("")),
  eventTypes: z.array(z.string()).default([
    "message.received"
  ]),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  phoneNumberId: z.string().optional().nullable(),
  newPhoneNumber: z.string().optional().nullable(),
  verifiedName: z.string().optional().nullable(),
});
