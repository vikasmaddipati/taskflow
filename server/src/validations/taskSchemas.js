import { z } from 'zod';

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export const objectIdSchema = z
  .string()
  .trim()
  .regex(OBJECT_ID_REGEX, { message: 'Must be a valid 24-character hexadecimal MongoDB ObjectId' });

export const taskIdParamSchema = z.object({
  id: objectIdSchema
});

export const createTaskSchema = z.object({
  title: z
    .string({ required_error: 'Task title is required' })
    .trim()
    .min(1, { message: 'Task title cannot be empty' })
    .max(150, { message: 'Title cannot exceed 150 characters' }),
  description: z.string().trim().max(2000, { message: 'Description cannot exceed 2000 characters' }).optional().default(''),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  status: z.enum(['pending', 'in_progress', 'review', 'completed']).optional().default('pending'),
  dueDate: z.any().optional().nullable(),
  dueDateString: z.string().trim().optional().nullable(),
  category: z.string().trim().max(50).optional().default('General'),
  assignedTo: objectIdSchema.optional().nullable(),
  collaboratorIds: z.array(objectIdSchema).optional().default([]),
  workspaceId: objectIdSchema.optional().nullable(),
  teamId: objectIdSchema.optional().nullable(),
  isPrivate: z.boolean().optional().default(false),
  subtasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        isCompleted: z.boolean().optional().default(false)
      })
    )
    .optional()
    .default([]),
  recurrence: z
    .object({
      isRecurring: z.boolean().optional().default(false),
      frequency: z.enum(['none', 'daily', 'weekly', 'monthly']).optional().default('none'),
      interval: z.number().int().min(1).optional().default(1)
    })
    .optional()
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['pending', 'in_progress', 'review', 'completed']).optional(),
  dueDate: z.any().optional().nullable(),
  dueDateString: z.string().trim().optional().nullable(),
  category: z.string().trim().max(50).optional(),
  assignedTo: objectIdSchema.optional().nullable(),
  collaboratorIds: z.array(objectIdSchema).optional(),
  workspaceId: objectIdSchema.optional().nullable(),
  teamId: objectIdSchema.optional().nullable(),
  isPrivate: z.boolean().optional(),
  subtasks: z
    .array(
      z.object({
        _id: objectIdSchema.optional(),
        title: z.string().trim().min(1).max(200),
        isCompleted: z.boolean().optional()
      })
    )
    .optional(),
  recurrence: z
    .object({
      isRecurring: z.boolean().optional(),
      frequency: z.enum(['none', 'daily', 'weekly', 'monthly']).optional(),
      interval: z.number().int().min(1).optional()
    })
    .optional()
});

export const getTasksQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  category: z.string().trim().optional(),
  workspaceId: z.string().trim().optional(),
  teamId: z.string().trim().optional(),
  view: z.string().trim().optional(),
  sortBy: z.string().trim().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.coerce
    .number()
    .int()
    .optional()
    .transform((val) => (val && val > 0 ? val : 1)),
  limit: z.coerce
    .number()
    .int()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, val)) : 20))
});

export const addCommentSchema = z.object({
  content: z
    .string({ required_error: 'Comment content cannot be empty' })
    .trim()
    .min(1, { message: 'Comment content cannot be empty' })
    .max(1000, { message: 'Comment cannot exceed 1000 characters' })
});

export const updateCollaboratorsSchema = z.object({
  collaboratorIds: z.array(objectIdSchema, {
    required_error: 'collaboratorIds must be an array of user IDs'
  })
});

export const updateCommentSchema = z.object({
  content: z
    .string({ required_error: 'Comment content cannot be empty' })
    .trim()
    .min(1, { message: 'Comment content cannot be empty' })
    .max(1000, { message: 'Comment cannot exceed 1000 characters' })
});

export const bulkTasksSchema = z.object({
  taskIds: z
    .array(objectIdSchema)
    .min(1, { message: 'At least one taskId is required' })
    .max(100, { message: 'Cannot perform bulk operations on more than 100 tasks at once' }),
  operation: z.enum(['status', 'assign', 'delete', 'restore', 'category']),
  payload: z.any().optional()
});
