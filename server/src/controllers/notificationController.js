import Notification from '../models/Notification.js';
import { scanAndDispatchReminders } from '../services/reminderScheduler.js';

// @desc    Get user notifications in active organization with pagination
// @route   GET /api/notifications
// @access  Private
export const getNotifications = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = {
      user: req.user._id,
      organization: req.organization._id
    };

    if (req.query.unreadOnly === 'true') {
      query.isRead = false;
    }

    const [total, unreadCount, notifications] = await Promise.all([
      Notification.countDocuments(query),
      Notification.countDocuments({ user: req.user._id, organization: req.organization._id, isRead: false }),
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('task', 'title status priority dueDateString')
        .lean()
    ]);

    res.status(200).json({
      success: true,
      count: notifications.length,
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      notifications
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Mark a notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
export const markNotificationRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id,
        organization: req.organization._id
      },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      organization: req.organization._id,
      isRead: false
    });

    res.status(200).json({
      success: true,
      notification,
      unreadCount
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Mark all user notifications in active organization as read
// @route   POST /api/notifications/read-all
// @access  Private
export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      {
        user: req.user._id,
        organization: req.organization._id,
        isRead: false
      },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      markedCount: result.modifiedCount,
      unreadCount: 0
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Trigger deadline and overdue reminder scan
// @route   POST /api/notifications/run-reminders
// @access  Private
export const triggerReminderCheck = async (req, res, next) => {
  try {
    const summary = await scanAndDispatchReminders({
      organizationId: req.organization._id
    });

    res.status(200).json({
      success: true,
      message: 'Reminder scan completed successfully',
      notifiedCount: summary?.notifiedCount ?? 0,
      summary
    });
  } catch (err) {
    next(err);
  }
};
