import Task from '../models/Task.js';

// Helper to get today's start and end boundaries in local time
const getDayBoundaries = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

// @desc    Get all tasks for logged-in user with search, filter, and sorting
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
      sortOrder = 'desc'
    } = req.query;

    const query = { user: req.user._id };
    const { start: startOfToday, end: endOfToday } = getDayBoundaries();

    // Specific view filters
    if (view === 'today') {
      // My Day: tasks due today OR overdue pending tasks
      query.$or = [
        {
          dueDate: { $gte: startOfToday, $lte: endOfToday }
        },
        {
          status: 'pending',
          dueDate: { $lt: startOfToday, $ne: null }
        }
      ];
    } else if (view === 'upcoming') {
      // Upcoming: future tasks ordered by due date (tasks without due date excluded)
      query.dueDate = { $gt: endOfToday };
    } else if (view === 'completed') {
      query.status = 'completed';
    }

    // Status filter (if not overridden by view)
    if (status && status !== 'all' && !view) {
      if (status === 'overdue') {
        query.status = 'pending';
        query.dueDate = { $lt: startOfToday, $ne: null };
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

    // Search filter (title or description)
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
      // For due date, put nulls last if sorting ascending
      sortOptions = { dueDate: sortOrder === 'asc' ? 1 : -1, createdAt: -1 };
    } else if (sortBy === 'priority') {
      // Handled via custom priority mapping or standard index
      sortOptions = { priority: sortOrder === 'asc' ? 1 : -1, createdAt: -1 };
    } else {
      sortOptions = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    }

    // Default upcoming view to sort by dueDate ascending
    if (view === 'upcoming' && !req.query.sortBy) {
      sortOptions = { dueDate: 1 };
    }

    const tasks = await Task.find(query).sort(sortOptions);

    // Get list of unique categories for the user
    const categories = await Task.distinct('category', { user: req.user._id });

    res.status(200).json({
      success: true,
      count: tasks.length,
      categories: categories.filter(Boolean),
      tasks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dashboard statistics for user
// @route   GET /api/tasks/stats
// @access  Private
export const getTaskStats = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { start: startOfToday, end: endOfToday } = getDayBoundaries();

    // Real DB queries
    const [
      total,
      pending,
      completed,
      overdue,
      dueToday,
      recentTasks,
      upcomingDeadlines
    ] = await Promise.all([
      Task.countDocuments({ user: userId }),
      Task.countDocuments({ user: userId, status: 'pending' }),
      Task.countDocuments({ user: userId, status: 'completed' }),
      Task.countDocuments({
        user: userId,
        status: 'pending',
        dueDate: { $lt: startOfToday, $ne: null }
      }),
      Task.countDocuments({
        user: userId,
        dueDate: { $gte: startOfToday, $lte: endOfToday }
      }),
      Task.find({ user: userId }).sort({ createdAt: -1 }).limit(5),
      Task.find({
        user: userId,
        status: 'pending',
        dueDate: { $gte: startOfToday }
      })
        .sort({ dueDate: 1 })
        .limit(5)
    ]);

    // Priority breakdown
    const priorityStats = await Task.aggregate([
      { $match: { user: userId } },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    const priorityBreakdown = {
      low: 0,
      medium: 0,
      high: 0
    };
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
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Verify task ownership
    if (task.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this task'
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

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private
export const createTask = async (req, res, next) => {
  try {
    const { title, description, priority, status, dueDate, category } = req.body;

    if (!title || title.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Task title is required'
      });
    }

    const task = await Task.create({
      user: req.user._id,
      title: title.trim(),
      description: description ? description.trim() : '',
      priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
      status: ['pending', 'completed'].includes(status) ? status : 'pending',
      dueDate: dueDate ? new Date(dueDate) : null,
      category: category && category.trim() ? category.trim() : 'General'
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
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Ensure user owns the task
    if (task.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this task'
      });
    }

    const { title, description, priority, status, dueDate, category } = req.body;

    if (title !== undefined) {
      if (title.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Task title cannot be empty'
        });
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

    if (dueDate !== undefined) {
      task.dueDate = dueDate ? new Date(dueDate) : null;
    }

    if (category !== undefined) {
      task.category = category.trim() || 'General';
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
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    if (task.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this task'
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

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private
export const deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    // Ensure user owns the task
    if (task.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this task'
      });
    }

    await Task.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
