import Task from '../models/Task.js';
import AuditLog from '../models/AuditLog.js';
import { getTimezoneDayBoundaries, normalizeDueDate, getValidTimezone } from '../utils/timezone.js';
import { getOrgPlan } from '../config/plans.js';

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

    // Specific view filters
    if (view === 'today') {
      // My Day: tasks due today OR overdue pending tasks
      query.$or = [
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
    } else if (view === 'upcoming') {
      // Upcoming: future tasks
      query.$or = [
        { dueDateString: { $gt: todayStr } },
        { dueDate: { $gt: endOfToday } }
      ];
    } else if (view === 'completed') {
      query.status = 'completed';
    }

    // Status filter
    if (status && status !== 'all' && !view) {
      if (status === 'overdue') {
        query.status = 'pending';
        query.$or = [
          { dueDateString: { $lt: todayStr, $ne: null } },
          { dueDate: { $lt: startOfToday, $ne: null } }
        ];
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
      query.category = { $regex: new RegExp(`^${category.trim()}$`, 'i') };
    }

    // Search filter
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$and = query.$and || [];
      query.$and.push({
        $or: [{ title: searchRegex }, { description: searchRegex }]
      });
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
        .populate('user', 'name email avatar'),
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

// @desc    Get dashboard statistics for active organization
// @route   GET /api/tasks/stats
// @access  Private
export const getTaskStats = async (req, res, next) => {
  try {
    const orgId = req.organization._id;
    const clientTz = getValidTimezone(req.headers['x-timezone']);
    const { start: startOfToday, end: endOfToday, dateString: todayStr } = getTimezoneDayBoundaries(clientTz);

    const baseFilter = { organization: orgId, isDeleted: false };

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
        $or: [
          { dueDateString: todayStr },
          { dueDate: { $gte: startOfToday, $lte: endOfToday } }
        ]
      }),
      Task.find(baseFilter).sort({ createdAt: -1 }).limit(5),
      Task.find({
        ...baseFilter,
        status: 'pending',
        $or: [
          { dueDateString: { $gte: todayStr } },
          { dueDate: { $gte: startOfToday } }
        ]
      })
        .sort({ dueDate: 1, dueDateString: 1 })
        .limit(5)
    ]);

    // Priority breakdown via aggregation
    const priorityStats = await Task.aggregate([
      { $match: { organization: orgId, isDeleted: false } },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    const priorityBreakdown = { low: 0, medium: 0, high: 0 };
    priorityStats.forEach((p) => {
      if (p._id && priorityBreakdown[p._id] !== undefined) {
        priorityBreakdown[p._id] = p.count;
      }
    });

    res.status(200).json({
      success: true,
      stats: {
        total,
        pending,
        completed,
        overdue,
        dueToday,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        priorityBreakdown
      },
      recentTasks,
      upcomingDeadlines
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single task
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
      .populate('user', 'name email avatar');

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or has been deleted'
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

// @desc    Create a new task with quota validation
// @route   POST /api/tasks
// @access  Private
export const createTask = async (req, res, next) => {
  try {
    const { title, description, priority, status, dueDate, dueDateString, category, assignedTo } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Task title is required'
      });
    }

    // Check organization plan entitlements
    const orgPlan = getOrgPlan(req.organization);
    const currentTaskCount = await Task.countDocuments({
      organization: req.organization._id,
      isDeleted: false
    });

    if (currentTaskCount >= orgPlan.limits.maxTasks) {
      return res.status(403).json({
        success: false,
        code: 'QUOTA_EXCEEDED_TASKS',
        message: `Plan limit reached: The ${orgPlan.name} plan allows up to ${orgPlan.limits.maxTasks} tasks. Please upgrade to Pro for higher limits.`,
        currentCount: currentTaskCount,
        maxAllowed: orgPlan.limits.maxTasks
      });
    }

    const clientTz = getValidTimezone(req.headers['x-timezone']);
    const dateNorm = normalizeDueDate(dueDateString || dueDate, clientTz);

    const task = await Task.create({
      user: req.user._id,
      organization: req.organization._id,
      title: title.trim(),
      description: description ? description.trim() : '',
      priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
      status: ['pending', 'completed'].includes(status) ? status : 'pending',
      dueDate: dateNorm.dueDate,
      dueDateString: dateNorm.dueDateString,
      category: category && category.trim() ? category.trim() : 'General',
      assignedTo: assignedTo || null
    });

    // Record audit event
    await AuditLog.create({
      organization: req.organization._id,
      actor: req.user._id,
      action: 'task.created',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { title: task.title, priority: task.priority },
      ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a task
// @route   PUT /api/tasks/:id
// @access  Private
export const updateTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.organization._id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or access denied'
      });
    }

    const { title, description, priority, status, dueDate, dueDateString, category, assignedTo } = req.body;

    if (title !== undefined) {
      if (title.trim() === '') {
        return res.status(400).json({ success: false, message: 'Task title cannot be empty' });
      }
      task.title = title.trim();
    }

    if (description !== undefined) {
      task.description = description.trim();
    }

    if (priority !== undefined && ['low', 'medium', 'high'].includes(priority)) {
      task.priority = priority;
    }

    if (status !== undefined && ['pending', 'completed'].includes(status)) {
      task.status = status;
    }

    if (dueDate !== undefined || dueDateString !== undefined) {
      const clientTz = getValidTimezone(req.headers['x-timezone']);
      const dateNorm = normalizeDueDate(dueDateString || dueDate, clientTz);
      task.dueDate = dateNorm.dueDate;
      task.dueDateString = dateNorm.dueDateString;
    }

    if (category !== undefined) {
      task.category = category.trim() || 'General';
    }

    if (assignedTo !== undefined) {
      task.assignedTo = assignedTo || null;
    }

    await task.save();

    res.status(200).json({
      success: true,
      message: 'Task updated successfully',
      task
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle task status (pending <-> completed)
// @route   PATCH /api/tasks/:id/toggle
// @access  Private
export const toggleTaskStatus = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.organization._id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or access denied'
      });
    }

    task.status = task.status === 'completed' ? 'pending' : 'completed';
    await task.save();

    res.status(200).json({
      success: true,
      message: `Task marked as ${task.status}`,
      task
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Soft-delete a task
// @route   DELETE /api/tasks/:id
// @access  Private
export const deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organization: req.organization._id,
      isDeleted: false
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found or already deleted'
      });
    }

    task.isDeleted = true;
    task.deletedAt = new Date();
    await task.save();

    await AuditLog.create({
      organization: req.organization._id,
      actor: req.user._id,
      action: 'task.deleted',
      targetType: 'Task',
      targetId: task._id.toString(),
      details: { title: task.title },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Task moved to trash successfully'
    });
  } catch (error) {
    next(error);
  }
};
