import { z } from 'zod';

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}){1,2}$/;
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export const createCategorySchema = z.object({
  name: z
    .string({ required_error: 'Please provide a category name' })
    .trim()
    .min(1, { message: 'Category name cannot be empty' })
    .max(50, { message: 'Category name cannot exceed 50 characters' }),
  color: z
    .string()
    .trim()
    .regex(HEX_COLOR_REGEX, { message: 'Please provide a valid hex color code (e.g. #6366f1)' })
    .optional()
    .default('#6366f1'),
  description: z.string().trim().max(200, { message: 'Description cannot exceed 200 characters' }).optional().default(''),
  workspaceId: z.string().trim().regex(OBJECT_ID_REGEX, { message: 'Invalid workspace ID' }).optional().nullable()
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  color: z.string().trim().regex(HEX_COLOR_REGEX, { message: 'Invalid hex color code' }).optional(),
  description: z.string().trim().max(200).optional(),
  isArchived: z.boolean().optional()
});

export const deleteCategorySchema = z.object({
  reassignTo: z.string().trim().min(1).optional(),
  reassignCategory: z.string().trim().min(1).optional()
}).optional().default({});
