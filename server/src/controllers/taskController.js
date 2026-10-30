import fs from 'fs';
import path from 'path';
import Task from '../models/Task.js';
import Category from '../models/Category.js';
import Membership from '../models/Membership.js';
import Team from '../models/Team.js';
import AuditLog from '../models/AuditLog.js';
import { getTimezoneDayBoundaries, normalizeDueDate, getValidTimezone } from '../utils/timezone.js';
import { getOrgPlan } from '../config/plans.js';
import { ROLES, PERMISSIONS, hasPermission } from '../config/permissions.js';
import { checkQuota, recordUsage } from '../services/entitlementService.js';
import { deleteStoredFile, deleteMultipleStoredFiles } from '../services/storageService.js';
import { dispatchWebhookEvent } from '../services/webhookDispatcher.js';
import { broadcastTenantEvent } from '../services/realtimeService.js';

// @desc    Get paginated tasks for active organization with search, filter, and sorting
// @route   GET /api/tasks
// @access  Private
export const getTasks = async (req, res, next) => {
  try {
    const {
      search,
      status,
      priority,
      category,
      workspaceId,
      teamId,
      view,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 20
    } = req.query;

    const orgId = req.organization._id;
    const clientTz = getValidTimezone(req.headers['x-timezone']);
    const { start: startOfToday, end: endOfToday, dateString: todayStr } = getTimezoneDayBoundaries(clientTz);

    // Bounded pagination: min 1, max 100
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    // Strict multi-tenant query with soft-delete filter
    const query = {
      organization: orgId,
      isDeleted: false
    };

    // Workspace filtering
    const activeWorkspaceId = workspaceId || req.headers['x-workspace-id'];
    if (activeWorkspaceId && activeWorkspaceId.match(/^[0-9a-fA-F]{24}$/)) {
      query.workspace = activeWorkspaceId;
    }

    // Team filtering
    if (teamId && teamId.match(/^[0-9a-fA-F]{24}$/)) {
      query.team = teamId;
    }

    // Role-level resource isolation
    const role = req.membership?.role;
    if (role === ROLES.GUEST) {
      // Guests can only see tasks explicitly created by, assigned to, or shared with them
      query.$or = [
        { user: req.user._id },
        { assignedTo: req.user._id },
        { collaborators: req.user._id }
      ];
    } else if (role === ROLES.BILLING_ADMIN) {
      // Billing Admins are denied access to private tasks
      query.isPrivate = false;
    }

    // Specific view filters
    if (view === 'today') {
      const todayCondition = [
        { dueDateString: todayStr },
        { dueDate: { $gte: startOfToday, $lte: endOfToday } },
        {
          status: 'pending',
          $or: [
            { dueDateString: { $lt: todayStr, $ne: null } },
            { dueDate: { $lt: startOfToday, $ne: null } }
          ]
        }
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: todayCondition }];
        delete query.$or;
      } else {
        query.$or = todayCondition;
      }
    } else if (view === 'upcoming') {
      const upcomingCondition = [
        { dueDateString: { $gt: todayStr } },
        { dueDate: { $gt: endOfToday } }
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: upcomingCondition }];
        delete query.$or;
      } else {
        query.$or = upcomingCondition;
      }
    } else if (view === 'completed') {
      query.status = 'completed';
    }

    // Status filter
    if (status && status !== 'all' && !view) {
      if (status === 'overdue') {
        query.status = 'pending';
        const overdueCondition = [
          { dueDateString: { $lt: todayStr, $ne: null } },
          { dueDate: { $lt: startOfToday, $ne: null } }
        ];
        if (query.$or) {
          query.$and = [{ $or: query.$or }, { $or: overdueCondition }];
          delete query.$or;
        } else {
          query.$or = overdueCondition;
        }
      } else if (status === 'pending' || status === 'completed') {
        query.status = status;
      }
    }

    // Priority filter
    if (priority && priority !== 'all') {
      query.priority = priority.toLowerCase();
    }

    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }

    // Search filter across title and description
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      if (query.$and) {
        query.$and.push({ $or: [{ title: searchRegex }, { description: searchRegex }] });
      } else if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: [{ title: searchRegex }, { description: searchRegex }] }];
        delete query.$or;
      } else {
        query.$or = [{ title: searchRegex }, { description: searchRegex }];
      }
    }

    // Sorting: Whitelist allowed fields to prevent arbitrary injection and ensure deterministic ordering
    const ALLOWED_SORT_FIELDS = ['createdAt', 'dueDate', 'priority', 'title', 'status', 'updatedAt'];
    const validSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const validSortOrder = sortOrder === 'asc' ? 1 : -1;

    let sortOptions = {};
    if (view === 'upcoming' && !req.query.sortBy) {
      sortOptions = { dueDate: 1, dueDateString: 1, _id: 1 };
    } else if (validSortBy === 'dueDate') {
      sortOptions = { dueDate: validSortOrder, createdAt: -1, _id: 1 };
    } else if (validSortBy === 'priority') {
      sortOptions = { priority: validSortOrder, createdAt: -1, _id: 1 };
    } else {
      sortOptions = { [validSortBy]: validSortOrder, _id: 1 };
    }

    // Run query with bounded pagination, lean projection, and category resolution in parallel
    const [total, tasks, distinctCategories, persistentCategories] = await Promise.all([
      Task.countDocuments(query),
      Task.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(parsedLimit)
        .populate('assignedTo', 'name email avatar')
        .populate('collaborators', 'name email avatar')
        .populate('user', 'name email avatar')
        .populate('workspace', 'name isDefault')
        .populate('team', 'name')
        .lean(),
      Task.distinct('category', { organization: orgId, isDeleted: false }),
      Category.find({ organization: orgId, isArchived: false }).select('name').lean()
    ]);

    // Merge persistent categories with distinct task categories so empty categories are preserved
    const mergedCategories = Array.from(
      new Set([
        ...distinctCategories.filter(Boolean),
        ...persistentCategories.map((c) => c.name).filter(Boolean)
      ])
    );

    const totalPages = Math.ceil(total / parsedLimit);

    res.status(200).json({
      success: true,
      count: tasks.length,
      total,
      totalItems: total,
      items: tasks,
      page: parsedPage,
      limit: parsedLimit,
      totalPages,
      hasMore: parsedPage < totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPreviousPage: parsedPage > 1,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        totalPages,
        totalTasks: total,
        hasMore: parsedPage < totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPreviousPage: parsedPage > 1
      },
      categories: mergedCategories,
      tasks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dashboard metrics and counts for active organization
// @route   GET /api/tasks/stats
// @access  Private
export const getTaskStats = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const clientTz = getValidTimezone(req.headers['x-timezone']);
    const { start: startOfToday, end: endOfToday, dateString: todayStr } = getTimezoneDayBoundaries(clientTz);

    const baseFilter = { organization: orgId, isDeleted: false };
    const role = req.membership?.role;

    if (role === ROLES.GUEST) {
      baseFilter.$or = [
        { user: req.user._id },
        { assignedTo: req.user._id },
        { collaborators: req.user._id }
      ];
    } else if (role === ROLES.BILLING_ADMIN) {
      baseFilter.isPrivate = false;
    }

    const [
      total,
      pending,
      completed,
      overdue,
      dueToday,
      recentTasks,
      upcomingDeadlines
    ] = await Promise.all([
      Task.countDocuments(baseFilter),
      Task.countDocuments({ ...baseFilter, status: 'pending' }),
      Task.countDocuments({ ...baseFilter, status: 'completed' }),
      Task.countDocuments({
        ...baseFilter,
        status: 'pending',
        $or: [
          { dueDateString: { $lt: todayStr, $ne: null } },
          { dueDate: { $lt: startOfToday, $ne: null } }
        ]
      }),
      Task.countDocuments({
        ...baseFilter,
        status: 'pending',
        $or: [
          { dueDateString: todayStr },
          { dueDate: { $gte: startOfToday, $lte: endOfToday } }
        ]
      }),
      Task.find(baseFilter)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('assignedTo', 'name email avatar')
        .populate('user', 'name email avatar'),
      Task.find({
        ...baseFilter,
        status: 'pending',
        $or: [
          { dueDateString: { $gte: todayStr, $ne: null } },
          { dueDate: { $gte: startOfToday, $ne: null } }
        ]
      })
        .sort({ dueDate: 1, dueDateString: 1 })
        .limit(5)
        .populate('assignedTo', 'name email avatar')
        .populate('user', 'name email avatar')
    ]);

    // Priority breakdown via aggregation pipeline scoped strictly to tenant
    const priorityStats = await Task.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    const priorityBreakdown = { low: 0, medium: 0, high: 0 };
    priorityStats.forEach((p) => {
      if (priorityBreakdown[p._id] !== undefined) {
        priorityBreakdown[p._id] = p.count;
      }
    });

    // Category breakdown via aggregation pipeline scoped to tenant
    const categoryStats = await Task.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]);

    res.status(200).json({
      success: true,
      stats: {
        total,
        pending,
        completed,
        overdue,
        dueToday,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        priorityBreakdown,
        categoryBreakdown: categoryStats.map((c) => ({
          category: c._id || 'General',
          count: c.count
        })),
        recentTasks,
        upcomingDeadlines
      },
      recentTasks,
      upcomingDeadlines
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single task by ID
// @route   GET /api/tasks/:id
// @access  Private
export const getTaskById = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.organization._id,
      isDeleted: false
    })
      .populate('assignedTo', 'name email avatar')
      .populate('collaborators', 'name email avatar')
      .populate('user', 'name email avatar')
      .populate('workspace', 'name isDefault')
      .populate('team', 'name')
      .populate('comments.user', 'name email avatar');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or has been deleted'
      });
    }

    const role = req.membership?.role;

    // Role-level checks
    if (role === ROLES.GUEST) {
      const isCreator = task.user._id.toString() === req.user._id.toString();
      const isAssignee = task.assignedTo && task.assignedTo._id.toString() === req.user._id.toString();
      const isCollaborator = task.collaborators?.some((c) => c._id.toString() === req.user._id.toString());
      if (!isCreator && !isAssignee && !isCollaborator) {
        return res.status(404).json({
          success: false,
          message: 'Task not found or access denied'
        });
      }
    } else if (role === ROLES.BILLING_ADMIN && task.isPrivate) {
      return res.status(403).json({
        success: false,
        code: 'BILLING_ADMIN_RESTRICTION',
        message: 'Billing administrators are not permitted to view private tasks'
      });
    }

    res.status(200).json({
      success: true,
      task
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new task with quota and assignment validation
// @route   POST /api/tasks
// @access  Private
export const createTask = async (req, res, next) => {
  try {
    const {
      title,
      description,
      priority,
      status,
      dueDate,
      dueDateString,
      category,
      assignedTo,
      collaboratorIds = [],
      workspaceId,
      teamId,
      isPrivate,
      subtasks = [],
      recurrence
    } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Task title is required'
      });
    }

    const orgId = req.organization._id;

    // Check monthly task creation quota via centralized entitlement engine
    const quotaCheck = await checkQuota(orgId, 'tasks_created');
    if (!quotaCheck.allowed) {
      return res.status(403).json({
        success: false,
        code: 'QUOTA_EXCEEDED',
        metric: 'tasks_created',
        currentUsage: quotaCheck.currentUsage,
        limit: quotaCheck.limit,
        message: `Monthly task creation limit reached: Your ${quotaCheck.planName} plan allows up to ${quotaCheck.limit} tasks per month. Upgrade to Pro for more capacity.`
      });
    }

    // Validate assigned user belongs to this organization
    let validAssignee = null;
    if (assignedTo) {
      const isMember = await Membership.findOne({ organization: orgId, user: assignedTo });
      if (!isMember) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_ASSIGNEE',
          message: 'Assigned user is not an active member of this organization'
        });
      }
      validAssignee = assignedTo;
    }

    // Validate collaborators belong to this organization
    let validCollaborators = [];
    if (Array.isArray(collaboratorIds) && collaboratorIds.length > 0) {
      const validMemberships = await Membership.find({
        organization: orgId,
        user: { $in: collaboratorIds }
      });
      validCollaborators = validMemberships.map((m) => m.user);
    }

    // Validate team belongs to organization
    let validTeam = null;
    if (teamId) {
      const team = await Team.findOne({ organization: orgId, _id: teamId });
      if (!team) {
        return res.status(400).json({
          success: false,
          message: 'Team not found in this organization'
        });
      }
      validTeam = teamId;
    }

    // Resolve workspace (provided or active default)
    const targetWorkspaceId = workspaceId || (req.workspace ? req.workspace._id : null);

    const clientTz = getValidTimezone(req.headers['x-timezone']);
    const dateNorm = normalizeDueDate(dueDateString || dueDate, clientTz);

    const task = await Task.create({
      user: req.user._id,
      organization: orgId,
      workspace: targetWorkspaceId,
      team: validTeam,
      title: title.trim(),
      description: description ? description.trim() : '',
      priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
      status: ['pending', 'in_progress', 'review', 'completed'].includes(status) ? status : 'pending',
      dueDate: dateNorm.dueDate,
      dueDateString: dateNorm.dueDateString,
      category: category && category.trim() ? category.trim() : 'General',
      assignedTo: validAssignee,
      collaborators: validCollaborators,
      isPrivate: Boolean(isPrivate),
      subtasks: Array.isArray(subtasks)
        ? subtasks
            .filter((st) => (typeof st === 'string' ? st.trim() : st?.title?.trim()))
            .map((st) => ({
              title: typeof st === 'string' ? st.trim() : st.title.trim(),
              isCompleted: Boolean(st.isCompleted)
            }))
        : [],
      recurrence: {
        isRecurring: Boolean(recurrence?.isRecurring),
        frequency: ['none', 'daily', 'weekly', 'monthly'].includes(recurrence?.frequency)
          ? recurrence.frequency
          : 'none',
        interval: Math.max(1, parseInt(recurrence?.interval, 10) || 1),
        nextRunDate: recurrence?.nextRunDate ? new Date(recurrence.nextRunDate) : null
      }
    });

    // Record atomic usage in monthly ledger
    await recordUsage(orgId, 'tasks_created', 1);

    // Record audit event
    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'task.created',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { title: task.title, priority: task.priority, assignedTo: validAssignee },
      ipAddress: req.ip
    });

    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email avatar')
      .populate('collaborators', 'name email avatar')
      .populate('user', 'name email avatar')
      .populate('workspace', 'name isDefault');

    broadcastTenantEvent(orgId, 'task.created', { task: populatedTask });
    dispatchWebhookEvent(orgId, 'task.created', { task: populatedTask });

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task: populatedTask
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update task details with role and assignment checks
// @route   PUT /api/tasks/:id
// @access  Private
export const updateTask = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const task = await Task.findOne({
      _id: req.params.id,
      organization: orgId,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or has been deleted'
      });
    }

    const role = req.membership?.role;

    // Guest check
    if (role === ROLES.GUEST) {
      const isAssignee = task.assignedTo && task.assignedTo.toString() === req.user._id.toString();
      const isCollaborator = task.collaborators?.some((c) => c.toString() === req.user._id.toString());
      if (!isAssignee && !isCollaborator) {
        return res.status(403).json({
          success: false,
          message: 'Guests may only update tasks explicitly assigned or shared with them'
        });
      }
    }

    const {
      title,
      description,
      priority,
      status,
      dueDate,
      dueDateString,
      category,
      assignedTo,
      collaboratorIds,
      workspaceId,
      teamId,
      isPrivate,
      subtasks,
      recurrence
    } = req.body;

    const changes = {};

    if (title && title.trim() && title.trim() !== task.title) {
      changes.title = { old: task.title, new: title.trim() };
      task.title = title.trim();
    }

    if (description !== undefined && description.trim() !== task.description) {
      changes.description = { old: task.description, new: description.trim() };
      task.description = description.trim();
    }

    if (priority && ['low', 'medium', 'high'].includes(priority) && priority !== task.priority) {
      changes.priority = { old: task.priority, new: priority };
      task.priority = priority;
    }

    if (
      status &&
      ['pending', 'in_progress', 'review', 'completed'].includes(status) &&
      status !== task.status
    ) {
      changes.status = { old: task.status, new: status };
      task.status = status;
    }

    if (dueDate !== undefined || dueDateString !== undefined) {
      const clientTz = getValidTimezone(req.headers['x-timezone']);
      const dateNorm = normalizeDueDate(dueDateString || dueDate, clientTz);
      if (dateNorm.dueDateString !== task.dueDateString) {
        changes.dueDate = { old: task.dueDateString, new: dateNorm.dueDateString };
      }
      task.dueDate = dateNorm.dueDate;
      task.dueDateString = dateNorm.dueDateString;
    }

    if (category && category.trim() && category.trim() !== task.category) {
      changes.category = { old: task.category, new: category.trim() };
      task.category = category.trim();
    }

    if (Array.isArray(subtasks)) {
      task.subtasks = subtasks
        .filter((st) => (typeof st === 'string' ? st.trim() : st?.title?.trim()))
        .map((st) => ({
          title: typeof st === 'string' ? st.trim() : st.title.trim(),
          isCompleted: Boolean(st.isCompleted),
          completedAt: st.isCompleted ? st.completedAt || new Date() : null
        }));
      changes.subtasks = { count: task.subtasks.length };
    }

    if (recurrence) {
      task.recurrence = {
        isRecurring: Boolean(recurrence.isRecurring),
        frequency: ['none', 'daily', 'weekly', 'monthly'].includes(recurrence.frequency)
          ? recurrence.frequency
          : 'none',
        interval: Math.max(1, parseInt(recurrence.interval, 10) || 1),
        nextRunDate: recurrence.nextRunDate ? new Date(recurrence.nextRunDate) : null
      };
      changes.recurrence = task.recurrence;
    }

    // Assignment handling: check permission and tenant membership
    if (assignedTo !== undefined) {
      if (!hasPermission(role, PERMISSIONS.TASKS_ASSIGN)) {
        return res.status(403).json({
          success: false,
          code: 'PERMISSION_DENIED',
          message: `Role '${role}' does not have permission to assign tasks`
        });
      }
      if (assignedTo) {
        const isMember = await Membership.findOne({ organization: orgId, user: assignedTo });
        if (!isMember) {
          return res.status(400).json({
            success: false,
            code: 'INVALID_ASSIGNEE',
            message: 'Assigned user is not an active member of this organization'
          });
        }
        task.assignedTo = assignedTo;
      } else {
        task.assignedTo = null;
      }
    }

    if (Array.isArray(collaboratorIds)) {
      const validMemberships = await Membership.find({
        organization: orgId,
        user: { $in: collaboratorIds }
      });
      task.collaborators = validMemberships.map((m) => m.user);
    }

    if (workspaceId && workspaceId.match(/^[0-9a-fA-F]{24}$/)) {
      task.workspace = workspaceId;
    }

    if (teamId !== undefined) {
      task.team = teamId || null;
    }

    if (isPrivate !== undefined) {
      task.isPrivate = Boolean(isPrivate);
    }

    await task.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'task.updated',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { changes, title: task.title, status: task.status, priority: task.priority },
      ipAddress: req.ip
    });

    const updatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name email avatar')
      .populate('collaborators', 'name email avatar')
      .populate('user', 'name email avatar')
      .populate('workspace', 'name isDefault');

    res.status(200).json({
      success: true,
      message: 'Task updated successfully',
      task: updatedTask
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle task completion status
// @route   PATCH /api/tasks/:id/toggle
// @access  Private
export const toggleTaskStatus = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const task = await Task.findOne({
      _id: req.params.id,
      organization: orgId,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or has been deleted'
      });
    }

    const previousStatus = task.status;
    task.status = task.status === 'completed' ? 'pending' : 'completed';
    await task.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'task.status_changed',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { oldStatus: previousStatus, newStatus: task.status },
      ipAddress: req.ip
    });

    let nextOccurrence = null;
    // Auto-generate next recurrence cycle task upon completion
    if (
      task.status === 'completed' &&
      task.recurrence?.isRecurring &&
      task.recurrence?.frequency &&
      task.recurrence.frequency !== 'none'
    ) {
      const freq = task.recurrence.frequency;
      const interval = Math.max(1, task.recurrence.interval || 1);
      const baseDate = task.dueDate ? new Date(task.dueDate) : new Date();
      const nextDate = new Date(baseDate);

      if (freq === 'daily') {
        nextDate.setDate(nextDate.getDate() + interval);
      } else if (freq === 'weekly') {
        nextDate.setDate(nextDate.getDate() + 7 * interval);
      } else if (freq === 'monthly') {
        nextDate.setMonth(nextDate.getMonth() + interval);
      }

      const clientTz = getValidTimezone(req.headers['x-timezone']);
      const norm = normalizeDueDate(nextDate.toISOString(), clientTz);

      nextOccurrence = await Task.create({
        user: task.user,
        organization: orgId,
        workspace: task.workspace,
        team: task.team,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: 'pending',
        category: task.category,
        assignedTo: task.assignedTo,
        collaborators: task.collaborators,
        isPrivate: task.isPrivate,
        dueDate: norm.dueDate,
        dueDateString: norm.dueDateString,
        recurrence: {
          isRecurring: true,
          frequency: task.recurrence.frequency,
          interval: task.recurrence.interval,
          nextRunDate: nextDate
        },
        subtasks: Array.isArray(task.subtasks)
          ? task.subtasks.map((st) => ({ title: st.title, isCompleted: false }))
          : []
      });

      await AuditLog.create({
        organization: orgId,
        actor: req.user._id,
        action: 'task.recurrence_spawned',
        targetType: 'Task',
        targetId: nextOccurrence._id.toString(),
        details: { parentTaskId: task._id.toString(), nextDueDate: norm.dueDateString },
        ipAddress: req.ip
      });
    }

    res.status(200).json({
      success: true,
      message: `Task marked as ${task.status}`,
      task,
      ...(nextOccurrence && { nextOccurrence })
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Soft delete task
// @route   DELETE /api/tasks/:id
// @access  Private
export const deleteTask = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const task = await Task.findOne({
      _id: req.params.id,
      organization: orgId,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or has already been deleted'
      });
    }

    task.isDeleted = true;
    task.deletedAt = new Date();
    task.deletedBy = req.user._id;
    await task.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'task.deleted',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { title: task.title },
      ipAddress: req.ip
    });

    broadcastTenantEvent(orgId, 'task.deleted', { taskId: task._id });
    dispatchWebhookEvent(orgId, 'task.deleted', { taskId: task._id });

    res.status(200).json({
      success: true,
      message: 'Task moved to trash successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get paginated trash (soft-deleted tasks) for active organization
// @route   GET /api/tasks/trash
// @access  Private
export const getTrashTasks = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const orgId = req.organization._id;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (parsedPage - 1) * parsedLimit;

    const query = {
      organization: orgId,
      isDeleted: true
    };

    const role = req.membership?.role;
    if (role === ROLES.GUEST) {
      query.$or = [
        { user: req.user._id },
        { assignedTo: req.user._id },
        { collaborators: req.user._id }
      ];
    } else if (role === ROLES.BILLING_ADMIN) {
      query.isPrivate = false;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: [{ title: searchRegex }, { description: searchRegex }] }];
        delete query.$or;
      } else {
        query.$or = [{ title: searchRegex }, { description: searchRegex }];
      }
    }

    const [total, tasks] = await Promise.all([
      Task.countDocuments(query),
      Task.find(query)
        .sort({ deletedAt: -1, _id: 1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate('assignedTo', 'name email avatar')
        .populate('collaborators', 'name email avatar')
        .populate('user', 'name email avatar')
        .populate('deletedBy', 'name email')
        .populate('workspace', 'name isDefault')
        .lean()
    ]);

    const totalPages = Math.ceil(total / parsedLimit);

    res.status(200).json({
      success: true,
      count: tasks.length,
      total,
      totalItems: total,
      items: tasks,
      page: parsedPage,
      limit: parsedLimit,
      totalPages,
      hasMore: parsedPage < totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPreviousPage: parsedPage > 1,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        totalPages,
        totalTasks: total,
        hasMore: parsedPage < totalPages,
        hasNextPage: parsedPage < totalPages,
        hasPreviousPage: parsedPage > 1
      },
      tasks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Restore a soft-deleted task from trash
// @route   PATCH /api/tasks/:id/restore
// @access  Private
export const restoreTask = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const task = await Task.findOne({
      _id: req.params.id,
      organization: orgId,
      isDeleted: true
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found in trash or has already been restored'
      });
    }

    const role = req.membership?.role;
    if (role === ROLES.GUEST) {
      const isCreator = task.user.toString() === req.user._id.toString();
      const isAssignee = task.assignedTo && task.assignedTo.toString() === req.user._id.toString();
      const isCollaborator = task.collaborators?.some((c) => c.toString() === req.user._id.toString());
      if (!isCreator && !isAssignee && !isCollaborator) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied: cannot restore this task'
        });
      }
    }

    task.isDeleted = false;
    task.deletedAt = null;
    task.deletedBy = null;
    await task.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'task.restored',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { title: task.title },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Task restored successfully',
      task
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Permanently delete a single task from trash
// @route   DELETE /api/tasks/:id/permanent
// @access  Private
export const permanentlyDeleteTask = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const task = await Task.findOne({
      _id: req.params.id,
      organization: orgId,
      isDeleted: true
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found in trash'
      });
    }

    const role = req.membership?.role;
    if (role === ROLES.GUEST) {
      const isCreator = task.user.toString() === req.user._id.toString();
      if (!isCreator) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied: only task creator or organization administrators can permanently delete'
        });
      }
    }

    // Clean up physical attachment files from disk storage
    if (task.attachments && task.attachments.length > 0) {
      const filenames = task.attachments.map((a) => a.filename).filter(Boolean);
      await deleteMultipleStoredFiles(filenames);
    }

    await Task.deleteOne({ _id: task._id });

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'task.permanently_deleted',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { title: task.title },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Task permanently deleted'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Empty trash (permanently delete all soft-deleted tasks for active tenant)
// @route   DELETE /api/tasks/trash/empty
// @access  Private
export const emptyTrash = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const role = req.membership?.role;

    const query = {
      organization: orgId,
      isDeleted: true
    };

    if (role === ROLES.GUEST) {
      query.user = req.user._id;
    }

    // Clean up physical attachment files from disk storage for all matching tasks
    const tasksToPurge = await Task.find(query).select('attachments').lean();
    const allFilenames = tasksToPurge.flatMap((t) => (t.attachments || []).map((a) => a.filename)).filter(Boolean);
    if (allFilenames.length > 0) {
      await deleteMultipleStoredFiles(allFilenames);
    }

    const result = await Task.deleteMany(query);

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'trash.emptied',
      targetType: 'Task',
      details: { deletedCount: result.deletedCount },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: `Trash emptied successfully (${result.deletedCount} task(s) permanently removed)`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export active tasks as CSV or JSON (GDPR Art. 20 Data Portability)
// @route   GET /api/tasks/export
// @access  Private
export const exportTasks = async (req, res, next) => {
  try {
    const { format = 'json' } = req.query;
    const orgId = req.organization._id;

    const query = {
      organization: orgId,
      isDeleted: false
    };

    const role = req.membership?.role;
    if (role === ROLES.GUEST) {
      query.$or = [
        { user: req.user._id },
        { assignedTo: req.user._id },
        { collaborators: req.user._id }
      ];
    } else if (role === ROLES.BILLING_ADMIN) {
      query.isPrivate = false;
    }

    const tasks = await Task.find(query)
      .sort({ createdAt: -1 })
      .populate('assignedTo', 'name email')
      .populate('user', 'name email')
      .lean();

    if (format === 'csv') {
      const headers = ['Title', 'Description', 'Priority', 'Status', 'Category', 'Due Date', 'Created At'];
      const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""')}"`;

      const rows = tasks.map((t) => [
        escapeCsv(t.title),
        escapeCsv(t.description),
        escapeCsv(t.priority),
        escapeCsv(t.status),
        escapeCsv(t.category),
        escapeCsv(t.dueDateString || t.dueDate || ''),
        escapeCsv(t.createdAt ? new Date(t.createdAt).toISOString() : '')
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="taskflow_tasks_export.csv"');
      return res.status(200).send(csvContent);
    }

    // Default JSON export
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="taskflow_tasks_export.json"');
    res.status(200).json({
      success: true,
      exportedAt: new Date().toISOString(),
      organization: req.organization.name,
      totalCount: tasks.length,
      tasks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add a collaborative comment to a task
// @route   POST /api/tasks/:id/comments
// @access  Private
export const addTaskComment = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Comment content cannot be empty' });
    }

    const task = await Task.findOne({
      _id: req.params.id,
      organization: orgId,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const newComment = {
      user: req.user._id,
      content: content.trim(),
      createdAt: new Date()
    };

    task.comments.push(newComment);
    await task.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'task.comment_added',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { commentLength: content.trim().length },
      ipAddress: req.ip
    });

    const populatedTask = await Task.findById(task._id).populate('comments.user', 'name email avatar');

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      comments: populatedTask.comments
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a task comment
// @route   PATCH /api/tasks/:id/comments/:commentId
// @access  Private (Author or Admin)
export const updateTaskComment = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { id, commentId } = req.params;
    const { content } = req.body;

    const task = await Task.findOne({
      _id: id,
      organization: orgId,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const comment = task.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const isAuthor = comment.user.toString() === req.user._id.toString();
    const isAdmin = [ROLES.OWNER, ROLES.ADMIN].includes(req.membership?.role);

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: only the comment author or administrators can edit this comment'
      });
    }

    comment.content = content.trim();
    await task.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'task.comment_updated',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { commentId },
      ipAddress: req.ip
    });

    const populatedTask = await Task.findById(task._id).populate('comments.user', 'name email avatar');

    res.status(200).json({
      success: true,
      message: 'Comment updated successfully',
      comment,
      comments: populatedTask.comments
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a task comment
// @route   DELETE /api/tasks/:id/comments/:commentId
// @access  Private (Author or Admin)
export const deleteTaskComment = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { id, commentId } = req.params;

    const task = await Task.findOne({
      _id: id,
      organization: orgId,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const comment = task.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const isAuthor = comment.user.toString() === req.user._id.toString();
    const isAdmin = [ROLES.OWNER, ROLES.ADMIN].includes(req.membership?.role);

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied: only the comment author or administrators can delete this comment'
      });
    }

    task.comments.pull({ _id: commentId });
    await task.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'task.comment_deleted',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { commentId },
      ipAddress: req.ip
    });

    const populatedTask = await Task.findById(task._id).populate('comments.user', 'name email avatar');

    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
      comments: populatedTask.comments
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk task operations (batch status, assign, delete, restore, category)
// @route   POST /api/tasks/bulk
// @access  Private (Member+)
export const bulkTaskOperations = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { taskIds, operation, payload } = req.body;
    const role = req.membership?.role;

    if (role === ROLES.GUEST) {
      return res.status(403).json({
        success: false,
        message: 'Guests are not permitted to perform bulk operations'
      });
    }

    const baseQuery = {
      _id: { $in: taskIds },
      organization: orgId
    };

    let modifiedCount = 0;

    if (operation === 'status') {
      const newStatus = typeof payload === 'string' ? payload : payload?.status;
      const result = await Task.updateMany(baseQuery, { status: newStatus });
      modifiedCount = result.modifiedCount;
    } else if (operation === 'assign') {
      const assigneeId = typeof payload === 'string' ? payload : payload?.assignedTo;
      const result = await Task.updateMany(baseQuery, { assignedTo: assigneeId || null });
      modifiedCount = result.modifiedCount;
    } else if (operation === 'category') {
      const category = typeof payload === 'string' ? payload : payload?.category;
      const result = await Task.updateMany(baseQuery, { category });
      modifiedCount = result.modifiedCount;
    } else if (operation === 'delete') {
      const result = await Task.updateMany(baseQuery, {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id
      });
      modifiedCount = result.modifiedCount;
    } else if (operation === 'restore') {
      const result = await Task.updateMany(baseQuery, {
        isDeleted: false,
        deletedAt: null
      });
      modifiedCount = result.modifiedCount;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid bulk operation specified' });
    }

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'task.bulk_operation',
      targetType: 'Task',
      details: { operation, modifiedCount, requestedCount: taskIds.length },
      ipAddress: req.ip
    });

    dispatchWebhookEvent(orgId, 'task.updated', {
      operation: `bulk_${operation}`,
      modifiedCount,
      taskIds
    });

    res.status(200).json({
      success: true,
      message: `Bulk ${operation} completed successfully`,
      operation,
      modifiedCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update task collaborators
// @route   POST /api/tasks/:id/collaborators
// @access  Private
export const updateCollaborators = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const { collaboratorIds } = req.body;

    if (!Array.isArray(collaboratorIds)) {
      return res.status(400).json({ success: false, message: 'collaboratorIds must be an array' });
    }

    const task = await Task.findOne({
      _id: req.params.id,
      organization: orgId,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    // Validate that all collaborator users are members of the organization
    const validMemberships = await Membership.find({
      organization: orgId,
      user: { $in: collaboratorIds }
    });
    task.collaborators = validMemberships.map((m) => m.user);
    await task.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'task.collaborators_updated',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { count: task.collaborators.length },
      ipAddress: req.ip
    });

    const populatedTask = await Task.findById(task._id).populate('collaborators', 'name email avatar');

    res.status(200).json({
      success: true,
      message: 'Collaborators updated successfully',
      collaborators: populatedTask.collaborators
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update task status directly (for Kanban columns and board drag-and-drop)
// @route   PATCH /api/tasks/:id/status
// @access  Private
export const updateTaskStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'in_progress', 'review', 'completed'];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values: ${allowed.join(', ')}`
      });
    }

    const orgId = req.organization._id;
    const task = await Task.findOne({
      _id: req.params.id,
      organization: orgId,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const oldStatus = task.status;
    task.status = status;
    await task.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'task.status_changed',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { oldStatus, newStatus: status },
      ipAddress: req.ip
    });

    broadcastTenantEvent(orgId, 'task.status_changed', { taskId: task._id, oldStatus, newStatus: status });
    dispatchWebhookEvent(orgId, 'task.status_changed', { taskId: task._id, oldStatus, newStatus: status });

    res.status(200).json({
      success: true,
      message: `Task status updated to ${status}`,
      task
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Add a subtask to a task
// @route   POST /api/tasks/:id/subtasks
// @access  Private
export const addSubtask = async (req, res, next) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Subtask title is required' });
    }

    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.organization._id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    task.subtasks.push({
      title: title.trim(),
      isCompleted: false
    });

    await task.save();

    await AuditLog.create({
      organization: req.organization._id,
      actor: req.user._id,
      action: 'task.subtask_added',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { title: title.trim() },
      ipAddress: req.ip
    });

    const addedSubtask = task.subtasks[task.subtasks.length - 1];

    res.status(201).json({
      success: true,
      message: 'Subtask added successfully',
      subtask: addedSubtask,
      subtasks: task.subtasks,
      task
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update or toggle a subtask
// @route   PATCH /api/tasks/:id/subtasks/:subtaskId
// @access  Private
export const updateSubtask = async (req, res, next) => {
  try {
    const { title, isCompleted } = req.body;
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.organization._id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const subtask = task.subtasks.id(req.params.subtaskId);
    if (!subtask) {
      return res.status(404).json({ success: false, message: 'Subtask not found' });
    }

    if (title !== undefined) subtask.title = title.trim();
    if (isCompleted !== undefined) {
      subtask.isCompleted = Boolean(isCompleted);
      subtask.completedAt = isCompleted ? new Date() : null;
    }

    await task.save();

    await AuditLog.create({
      organization: req.organization._id,
      actor: req.user._id,
      action: 'task.subtask_updated',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { subtaskId: req.params.subtaskId, isCompleted: subtask.isCompleted },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Subtask updated successfully',
      subtask,
      subtasks: task.subtasks,
      task
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete a subtask
// @route   DELETE /api/tasks/:id/subtasks/:subtaskId
// @access  Private
export const deleteSubtask = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.organization._id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    task.subtasks.pull({ _id: req.params.subtaskId });
    await task.save();

    await AuditLog.create({
      organization: req.organization._id,
      actor: req.user._id,
      action: 'task.subtask_deleted',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { subtaskId: req.params.subtaskId },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Subtask removed successfully',
      subtasks: task.subtasks,
      task
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Upload an attachment to a task
// @route   POST /api/tasks/:id/attachments
// @access  Private
export const uploadAttachment = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.organization._id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    let attachmentData;

    // Handle multipart file upload via multer
    if (req.file) {
      attachmentData = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: `/api/v1/tasks/${task._id}/attachments/${req.file.filename}/download`,
        uploadedBy: req.user._id,
        uploadedAt: new Date()
      };
    }
    // Handle base64 JSON upload fallback
    else if ((req.body?.contentBase64 || req.body?.base64Data) && (req.body?.filename || req.body?.originalName)) {
      const filename = req.body.filename || req.body.originalName;
      const contentBase64 = req.body.contentBase64 || req.body.base64Data;
      const mimeType = req.body.mimeType || 'application/octet-stream';
      const buffer = Buffer.from(contentBase64, 'base64');
      const safeFilename = `${Date.now()}-${path.basename(filename)}`;
      const uploadDir = path.resolve(process.cwd(), 'uploads/attachments');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadDir, safeFilename), buffer);

      attachmentData = {
        filename: safeFilename,
        originalName: filename,
        mimeType,
        size: buffer.length,
        url: `/api/v1/tasks/${task._id}/attachments/${safeFilename}/download`,
        uploadedBy: req.user._id,
        uploadedAt: new Date()
      };
    } else {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please supply a file attachment or base64 payload.'
      });
    }

    task.attachments.push(attachmentData);
    await task.save();

    const addedAttachment = task.attachments[task.attachments.length - 1];

    await AuditLog.create({
      organization: req.organization._id,
      actor: req.user._id,
      action: 'task.attachment_added',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { originalName: attachmentData.originalName, size: attachmentData.size },
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Attachment uploaded successfully',
      attachment: addedAttachment,
      attachments: task.attachments,
      task
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Download task attachment
// @route   GET /api/tasks/:id/attachments/:attachmentId/download
// @access  Private
export const downloadAttachment = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.organization._id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const attachment =
      task.attachments.id(req.params.attachmentId) ||
      task.attachments.find((a) => a.filename === req.params.attachmentId);

    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const uploadDir = path.resolve(process.cwd(), 'uploads/attachments');
    const filePath = path.join(uploadDir, attachment.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Attachment file missing from storage' });
    }

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(attachment.originalName)}"`
    );
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
};

// @desc    Delete task attachment
// @route   DELETE /api/tasks/:id/attachments/:attachmentId
// @access  Private
export const deleteAttachment = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.organization._id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const attachment =
      task.attachments.id(req.params.attachmentId) ||
      task.attachments.find((a) => a.filename === req.params.attachmentId);

    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const filename = attachment.filename;
    task.attachments.pull({ _id: attachment._id });
    await task.save();

    // Remove file from disk
    const uploadDir = path.resolve(process.cwd(), 'uploads/attachments');
    const filePath = path.join(uploadDir, filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore disk deletion failure
      }
    }

    await AuditLog.create({
      organization: req.organization._id,
      actor: req.user._id,
      action: 'task.attachment_deleted',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { filename },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Attachment deleted successfully',
      attachments: task.attachments,
      task
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get activity changelog for a specific task
// @route   GET /api/tasks/:id/activity
// @access  Private
export const getTaskActivity = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.organization._id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const activity = await AuditLog.find({
      organization: req.organization._id,
      targetId: task._id.toString()
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('actor', 'name email avatar')
      .lean();

    res.status(200).json({
      success: true,
      count: activity.length,
      activity
    });
  } catch (err) {
    next(err);
  }
};
