import Task from '../models/Task.js';
import {
  processAiAssistantMessage,
  parseTaskSchedulePrompt,
  generateTaskBreakdown,
  calculateOptimizedSchedule
} from '../services/aiService.js';
import { checkQuota, recordUsage } from '../services/entitlementService.js';
import { broadcastTenantEvent } from '../services/realtimeService.js';
import { getValidTimezone } from '../utils/timezone.js';

// @desc    Process conversational AI chat and task commands
// @route   POST /api/v1/ai/chat
// @access  Private
export const chatWithAi = async (req, res, next) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    const clientTimezone = req.headers['x-timezone'] || 'UTC';
    const activeWorkspaceId = req.headers['x-workspace-id'] || null;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const result = await processAiAssistantMessage({
      message,
      conversationHistory,
      organization: req.organization,
      user: req.user,
      clientTimezone,
      activeWorkspaceId
    });

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Parse natural language text into structured task draft
// @route   POST /api/v1/ai/parse
// @access  Private
export const parseTaskPrompt = async (req, res, next) => {
  try {
    const { prompt } = req.body;
    const clientTimezone = req.headers['x-timezone'] || 'UTC';

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Prompt is required'
      });
    }

    const parsed = parseTaskSchedulePrompt(prompt, clientTimezone);

    res.status(200).json({
      success: true,
      draft: parsed
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate structured project milestones and optionally auto-create them
// @route   POST /api/v1/ai/breakdown
// @access  Private
export const breakdownProject = async (req, res, next) => {
  try {
    const { goal, autoCreate = false } = req.body;
    const clientTimezone = req.headers['x-timezone'] || 'UTC';
    const activeWorkspaceId = req.headers['x-workspace-id'] || null;
    const orgId = req.organization._id;

    if (!goal || typeof goal !== 'string' || goal.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Goal description is required'
      });
    }

    const milestones = generateTaskBreakdown(goal, clientTimezone);

    if (autoCreate && milestones.length > 0) {
      // Check quota before batch creation
      const quotaCheck = await checkQuota(orgId, 'tasks_created');
      if (!quotaCheck.allowed) {
        return res.status(403).json({
          success: false,
          code: 'QUOTA_EXCEEDED',
          message: 'Task creation limit reached for your subscription plan'
        });
      }

      const createdTasks = [];
      for (const m of milestones) {
        const task = await Task.create({
          organization: orgId,
          workspace: activeWorkspaceId,
          user: req.user._id,
          title: m.title,
          description: m.description,
          priority: m.priority,
          category: m.category,
          dueDate: m.dueDate,
          dueDateString: m.dueDateString,
          subtasks: m.subtasks
        });
        createdTasks.push(task);
      }

      await recordUsage(orgId, 'tasks_created', createdTasks.length);

      broadcastTenantEvent(orgId, {
        type: 'TASKS_BATCH_CREATED',
        count: createdTasks.length,
        actor: req.user._id
      });

      return res.status(201).json({
        success: true,
        created: true,
        tasks: createdTasks,
        message: `Successfully created ${createdTasks.length} milestone tasks!`
      });
    }

    res.status(200).json({
      success: true,
      milestones
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Analyze schedule, detect clashes, and optionally apply AI schedule adjustments
// @route   POST /api/v1/ai/optimize
// @access  Private
export const optimizeSchedule = async (req, res, next) => {
  try {
    const { apply = false } = req.body;
    const clientTimezone = req.headers['x-timezone'] || 'UTC';
    const orgId = req.organization._id;

    const analysis = await calculateOptimizedSchedule(orgId, req.user._id, clientTimezone);

    if (apply && analysis.suggestedAdjustments?.length > 0) {
      let appliedCount = 0;
      for (const adj of analysis.suggestedAdjustments) {
        const task = await Task.findOne({ _id: adj.taskId, organization: orgId });
        if (task) {
          task.dueDateString = adj.suggestedDueDateString;
          const [y, m, d] = adj.suggestedDueDateString.split('-').map(Number);
          task.dueDate = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
          await task.save();
          appliedCount++;
        }
      }

      if (appliedCount > 0) {
        broadcastTenantEvent(orgId, {
          type: 'TASKS_SCHEDULE_OPTIMIZED',
          count: appliedCount,
          actor: req.user._id
        });
      }

      return res.status(200).json({
        success: true,
        applied: true,
        appliedCount,
        analysis,
        message: `AI successfully updated and balanced ${appliedCount} tasks in your schedule!`
      });
    }

    res.status(200).json({
      success: true,
      analysis
    });
  } catch (error) {
    next(error);
  }
};
