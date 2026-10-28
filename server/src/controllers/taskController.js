import Task from '../models/Task.js';
import Membership from '../models/Membership.js';
import Team from '../models/Team.js';
import AuditLog from '../models/AuditLog.js';
import { getTimezoneDayBoundaries, normalizeDueDate, getValidTimezone } from '../utils/timezone.js';
import { getOrgPlan } from '../config/plans.js';
import { ROLES, PERMISSIONS, hasPermission } from '../config/permissions.js';
import { checkQuota, recordUsage } from '../services/entitlementService.js';

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

    // Sorting
    let sortOptions = {};
    if (sortBy === 'dueDate') {
      sortOptions = { dueDate: sortOrder === 'asc' ? 1 : -1, createdAt: -1 };
    } else if (sortBy === 'priority') {
      sortOptions = { priority: sortOrder === 'asc' ? 1 : -1, createdAt: -1 };
    } else {
      sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    }

    if (view === 'upcoming' && !req.query.sortBy) {
      sortOptions = { dueDate: 1, dueDateString: 1 };
    }

    // Run query with bounded pagination and total count in parallel
    const [total, tasks, categories] = await Promise.all([
      Task.countDocuments(query),
      Task.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(parsedLimit)
        .populate('assignedTo', 'name email avatar')
        .populate('collaborators', 'name email avatar')
        .populate('user', 'name email avatar')
        .populate('workspace', 'name isDefault')
        .populate('team', 'name'),
      Task.distinct('category', { organization: orgId, isDeleted: false })
    ]);

    const totalPages = Math.ceil(total / parsedLimit);

    res.status(200).json({
      success: true,
      count: tasks.length,
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages,
      hasMore: parsedPage < totalPages,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        totalPages,
        totalTasks: total,
        hasMore: parsedPage < totalPages
      },
      categories: categories.filter(Boolean),
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
      }
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
      isPrivate
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
      status: ['pending', 'completed'].includes(status) ? status : 'pending',
      dueDate: dateNorm.dueDate,
      dueDateString: dateNorm.dueDateString,
      category: category && category.trim() ? category.trim() : 'General',
      assignedTo: validAssignee,
      collaborators: validCollaborators,
      isPrivate: Boolean(isPrivate)
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
      isPrivate
    } = req.body;

    if (title && title.trim()) {
      task.title = title.trim();
    }

    if (description !== undefined) {
      task.description = description.trim();
    }

    if (priority && ['low', 'medium', 'high'].includes(priority)) {
      task.priority = priority;
    }

    if (status && ['pending', 'completed'].includes(status)) {
      task.status = status;
    }

    if (dueDate !== undefined || dueDateString !== undefined) {
      const clientTz = getValidTimezone(req.headers['x-timezone']);
      const dateNorm = normalizeDueDate(dueDateString || dueDate, clientTz);
      task.dueDate = dateNorm.dueDate;
      task.dueDateString = dateNorm.dueDateString;
    }

    if (category && category.trim()) {
      task.category = category.trim();
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
      details: { title: task.title, status: task.status, priority: task.priority },
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

    task.status = task.status === 'completed' ? 'pending' : 'completed';
    await task.save();

    await AuditLog.create({
      organization: orgId,
      actor: req.user._id,
      action: 'task.toggled',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { newStatus: task.status },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: `Task marked as ${task.status}`,
      task
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

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully'
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
