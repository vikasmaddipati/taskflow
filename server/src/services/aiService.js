import Task from '../models/Task.js';
import Category from '../models/Category.js';
import { getTimezoneDayBoundaries, getValidTimezone, normalizeDueDate } from '../utils/timezone.js';
import { recordUsage, checkQuota } from './entitlementService.js';
import { broadcastTenantEvent } from './realtimeService.js';

/**
 * Natural language relative date & time parser.
 * Converts phrases like "tomorrow at 3pm", "next monday", "in 2 days", "today 5pm", etc.
 * to JavaScript Date and ISO date string (YYYY-MM-DD).
 */
export const parseNaturalDateTime = (text, clientTimezone = 'UTC') => {
  if (!text || typeof text !== 'string') return null;

  const now = new Date();
  const lower = text.toLowerCase().trim();

  let targetDate = new Date(now.getTime());
  let matched = false;

  // Extract explicit time if present (e.g., "at 3:30pm", "at 15:00", "4pm", "10am")
  let targetHours = 17; // default end-of-day 5 PM
  let targetMinutes = 0;

  const timeMatch = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3];

    if (meridiem === 'pm' && h < 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;

    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      targetHours = h;
      targetMinutes = m;
      matched = true;
    }
  }

  // Days relative parsing
  if (lower.includes('today') || lower.includes('tonight')) {
    matched = true;
    if (lower.includes('tonight') && !timeMatch) {
      targetHours = 20;
    }
  } else if (lower.includes('day after tomorrow')) {
    targetDate.setDate(targetDate.getDate() + 2);
    matched = true;
  } else if (lower.includes('tomorrow')) {
    targetDate.setDate(targetDate.getDate() + 1);
    matched = true;
  } else if (/in\s+(\d+)\s+days?/.test(lower)) {
    const days = parseInt(lower.match(/in\s+(\d+)\s+days?/)[1], 10);
    targetDate.setDate(targetDate.getDate() + days);
    matched = true;
  } else if (/in\s+(\d+)\s+weeks?/.test(lower)) {
    const weeks = parseInt(lower.match(/in\s+(\d+)\s+weeks?/)[1], 10);
    targetDate.setDate(targetDate.getDate() + weeks * 7);
    matched = true;
  } else if (/in\s+(\d+)\s+hours?/.test(lower)) {
    const hours = parseInt(lower.match(/in\s+(\d+)\s+hours?/)[1], 10);
    targetDate.setHours(targetDate.getHours() + hours);
    return {
      date: targetDate,
      dateString: targetDate.toISOString().split('T')[0],
      hasTime: true
    };
  } else if (lower.includes('next week')) {
    targetDate.setDate(targetDate.getDate() + 7);
    matched = true;
  } else if (lower.includes('this weekend') || lower.includes('weekend')) {
    const day = targetDate.getDay();
    const diffToSaturday = (6 - day + 7) % 7 || 7;
    targetDate.setDate(targetDate.getDate() + diffToSaturday);
    matched = true;
  } else {
    // Specific weekdays: monday, tuesday, etc.
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < dayNames.length; i++) {
      const dayName = dayNames[i];
      if (lower.includes(dayName)) {
        const currentDay = targetDate.getDay();
        let daysToAdd = (i - currentDay + 7) % 7;
        if (daysToAdd === 0 || lower.includes('next ' + dayName)) {
          daysToAdd += 7;
        }
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        matched = true;
        break;
      }
    }
  }

  // Explicit YYYY-MM-DD or DD/MM/YYYY or Month Name (e.g. "Nov 15", "December 20")
  if (!matched) {
    const isoDateMatch = lower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (isoDateMatch) {
      targetDate = new Date(parseInt(isoDateMatch[1], 10), parseInt(isoDateMatch[2], 10) - 1, parseInt(isoDateMatch[3], 10));
      matched = true;
    } else {
      const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      for (let mIdx = 0; mIdx < monthNames.length; mIdx++) {
        const mRegex = new RegExp(`\\b${monthNames[mIdx]}[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
        const mMatch = lower.match(mRegex);
        if (mMatch) {
          const dayNum = parseInt(mMatch[1], 10);
          targetDate.setMonth(mIdx);
          targetDate.setDate(dayNum);
          if (targetDate < now) {
            targetDate.setFullYear(now.getFullYear() + 1);
          }
          matched = true;
          break;
        }
      }
    }
  }

  if (!matched) return null;

  targetDate.setHours(targetHours, targetMinutes, 0, 0);
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${day}`;

  return {
    date: targetDate,
    dateString,
    hasTime: !!timeMatch
  };
};

/**
 * Parses user natural language scheduling prompt into structured task attributes.
 */
export const parseTaskSchedulePrompt = (prompt, clientTimezone = 'UTC') => {
  if (!prompt || typeof prompt !== 'string') {
    return { title: 'Untitled Task', priority: 'medium', category: 'General' };
  }

  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();

  // 1. Detect Priority
  let priority = 'medium';
  if (/\b(urgent|critical|asap|high priority|highest priority|p1|important)\b/i.test(cleanPrompt)) {
    priority = 'high';
  } else if (/\b(low priority|whenever|backlog|p3|trivial|optional)\b/i.test(cleanPrompt)) {
    priority = 'low';
  }

  // 2. Detect Recurrence
  let recurrence = { isRecurring: false, frequency: 'none', interval: 1 };
  if (/\b(every day|daily)\b/i.test(cleanPrompt)) {
    recurrence = { isRecurring: true, frequency: 'daily', interval: 1 };
  } else if (/\b(every week|weekly|every (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(cleanPrompt)) {
    recurrence = { isRecurring: true, frequency: 'weekly', interval: 1 };
  } else if (/\b(every month|monthly)\b/i.test(cleanPrompt)) {
    recurrence = { isRecurring: true, frequency: 'monthly', interval: 1 };
  }

  // 3. Detect Due Date / Time
  const parsedTime = parseNaturalDateTime(cleanPrompt, clientTimezone);

  // 4. Detect Category
  let category = 'General';
  const catKeywords = {
    Work: ['work', 'meeting', 'project', 'client', 'sprint', 'presentation', 'report', 'code', 'deploy', 'audit', 'review'],
    Personal: ['personal', 'home', 'groceries', 'gym', 'workout', 'shopping', 'health', 'doctor', 'family'],
    Development: ['dev', 'bug', 'fix', 'backend', 'frontend', 'database', 'api', 'refactor', 'feature'],
    Marketing: ['marketing', 'campaign', 'launch', 'newsletter', 'social', 'blog', 'seo', 'ads'],
    Finance: ['finance', 'tax', 'invoice', 'payroll', 'expense', 'budget', 'billing']
  };

  for (const [catName, keywords] of Object.entries(catKeywords)) {
    if (keywords.some((kw) => new RegExp(`\\b${kw}\\b`, 'i').test(cleanPrompt))) {
      category = catName;
      break;
    }
  }

  // 5. Extract Subtasks if provided
  const subtasks = [];
  const subtasksBlockMatch = cleanPrompt.match(/(?:subtasks|steps|checklist|todos?)[:\s]+([\s\S]+)/i);
  if (subtasksBlockMatch) {
    const rawItems = subtasksBlockMatch[1].split(/[\n,;]|\d+\.\s+|- /).map((s) => s.trim()).filter((s) => s.length > 1);
    rawItems.slice(0, 8).forEach((title) => {
      // Avoid taking whole prompt leftovers
      if (title.length < 150) {
        subtasks.push({ title, isCompleted: false });
      }
    });
  }

  // 6. Extract Clean Title
  let title = cleanPrompt;
  // Strip common command prefixes
  title = title.replace(/^(schedule|create|add|make|plan|set up|please schedule|please create)\s+(a\s+)?(task\s+)?(to\s+)?/i, '');
  // Strip subtasks block from title
  if (subtasksBlockMatch) {
    title = title.replace(subtasksBlockMatch[0], '');
  }
  // Strip category indicators
  title = title.replace(/\b(under|in|category:?)\s+(work|personal|development|marketing|finance|general)\b/i, '');
  // Strip trailing priority words
  title = title.replace(/\b(with\s+)?(high|medium|low)\s+priority\b/i, '');
  title = title.replace(/\b(urgent|asap|critical)\b/i, '');
  // Strip recurrence phrases
  title = title.replace(/\b(every\s+(day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|daily|weekly|monthly)\b/i, '');
  // Strip timing phrases if safely at the end
  title = title.replace(/\b(due\s+(by\s+|on\s+|at\s+)?.*)$/i, '');
  title = title.replace(/\b(tomorrow|tonight|next\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|today)\b/i, '');
  title = title.replace(/\b(at\s+\d{1,2}(:\d{2})?\s*(am|pm)?)\b/i, '');
  title = title.replace(/\bwith\s*$/i, '');
  title = title.replace(/\s{2,}/g, ' ');

  title = title.replace(/^[\s,:-]+|[\s,:-]+$/g, '').trim();
  if (!title) {
    title = cleanPrompt.slice(0, 60);
  }

  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return {
    title,
    description: `Auto-scheduled via TaskFlow AI from: "${cleanPrompt}"`,
    priority,
    category,
    dueDate: parsedTime ? parsedTime.date : null,
    dueDateString: parsedTime ? parsedTime.dateString : null,
    recurrence,
    subtasks
  };
};

/**
 * Intelligent project breakdown generator.
 * Decomposes complex goals into actionable, sequenced milestones.
 */
export const generateTaskBreakdown = (goalText, clientTimezone = 'UTC') => {
  const cleanGoal = (goalText || '').trim();
  const today = new Date();

  // Heuristic step generators based on domain keywords
  const goalLower = cleanGoal.toLowerCase();
  let templates = [];

  if (goalLower.includes('launch') || goalLower.includes('release') || goalLower.includes('product')) {
    templates = [
      { title: `Define launch scope & success metrics for ${cleanGoal}`, daysOffset: 1, priority: 'high', category: 'Work' },
      { title: `Final QA audit, performance benchmarks & regression testing`, daysOffset: 3, priority: 'high', category: 'Development' },
      { title: `Prepare deployment scripts & production environment checklist`, daysOffset: 5, priority: 'medium', category: 'Development' },
      { title: `Publish release notes, documentation & user announcement`, daysOffset: 7, priority: 'medium', category: 'Marketing' }
    ];
  } else if (goalLower.includes('design') || goalLower.includes('website') || goalLower.includes('ui') || goalLower.includes('redesign')) {
    templates = [
      { title: `Gather requirements & competitive benchmark research for ${cleanGoal}`, daysOffset: 1, priority: 'medium', category: 'Work' },
      { title: `Draft UX wireframes & interactive mockups in Figma`, daysOffset: 3, priority: 'high', category: 'Work' },
      { title: `Design review with stakeholders & incorporate revisions`, daysOffset: 5, priority: 'medium', category: 'Work' },
      { title: `Export assets & hand off component library to frontend`, daysOffset: 7, priority: 'medium', category: 'Development' }
    ];
  } else if (goalLower.includes('marketing') || goalLower.includes('campaign') || goalLower.includes('social')) {
    templates = [
      { title: `Define target audience, messaging & budget for ${cleanGoal}`, daysOffset: 1, priority: 'high', category: 'Marketing' },
      { title: `Draft copy, ad creatives, and promotional assets`, daysOffset: 3, priority: 'medium', category: 'Marketing' },
      { title: `Schedule publication calendar & setup conversion tracking`, daysOffset: 4, priority: 'high', category: 'Marketing' },
      { title: `Review early campaign analytics & optimize budget allocation`, daysOffset: 8, priority: 'medium', category: 'Marketing' }
    ];
  } else if (goalLower.includes('hire') || goalLower.includes('onboard') || goalLower.includes('team')) {
    templates = [
      { title: `Draft job description & publish to candidate channels`, daysOffset: 1, priority: 'high', category: 'Work' },
      { title: `Screen incoming applicants & schedule introductory interviews`, daysOffset: 4, priority: 'medium', category: 'Work' },
      { title: `Conduct technical interview & evaluate work samples`, daysOffset: 7, priority: 'high', category: 'Work' },
      { title: `Prepare offer letter & welcome onboarding package`, daysOffset: 10, priority: 'medium', category: 'Work' }
    ];
  } else {
    templates = [
      { title: `Phase 1: Planning & discovery for ${cleanGoal}`, daysOffset: 1, priority: 'high', category: 'Work' },
      { title: `Phase 2: Core execution & implementation of ${cleanGoal}`, daysOffset: 4, priority: 'high', category: 'Work' },
      { title: `Phase 3: Review, feedback & quality assurance`, daysOffset: 7, priority: 'medium', category: 'Work' },
      { title: `Phase 4: Final delivery, retrospective & celebration`, daysOffset: 10, priority: 'low', category: 'Work' }
    ];
  }

  return templates.map((item) => {
    const d = new Date(today.getTime());
    d.setDate(d.getDate() + item.daysOffset);
    d.setHours(17, 0, 0, 0);
    const dateString = d.toISOString().split('T')[0];
    return {
      title: item.title,
      description: `Milestone of plan: "${cleanGoal}"`,
      priority: item.priority,
      category: item.category,
      dueDate: d,
      dueDateString: dateString,
      subtasks: [
        { title: 'Kickoff task & verify requirements', isCompleted: false },
        { title: 'Execute primary deliverables', isCompleted: false },
        { title: 'Review and sign-off', isCompleted: false }
      ]
    };
  });
};

/**
 * Schedule Optimizer:
 * Evaluates pending tasks, scores urgency & importance, detects date clashes,
 * and proposes an optimized, balanced work schedule.
 */
export const calculateOptimizedSchedule = async (organizationId, userId, clientTimezone = 'UTC') => {
  const tz = getValidTimezone(clientTimezone);
  const { start: todayStart, dateString: todayStr } = getTimezoneDayBoundaries(tz);

  const tasks = await Task.find({
    organization: organizationId,
    isDeleted: false,
    status: { $in: ['pending', 'in_progress'] }
  }).sort({ priority: -1, dueDate: 1 });

  const overdue = [];
  const dueToday = [];
  const upcoming = [];
  const unscheduled = [];

  const now = new Date();

  tasks.forEach((task) => {
    if (!task.dueDate) {
      unscheduled.push(task);
    } else if (new Date(task.dueDate) < todayStart) {
      overdue.push(task);
    } else if (task.dueDateString === todayStr) {
      dueToday.push(task);
    } else {
      upcoming.push(task);
    }
  });

  // Generate suggested optimizations
  const recommendations = [];
  const suggestionsToApply = [];

  // 1. Address Overdue tasks
  if (overdue.length > 0) {
    recommendations.push({
      type: 'warning',
      message: `You have ${overdue.length} overdue task(s). We recommend rescheduling them to today or tomorrow.`
    });
    overdue.slice(0, 3).forEach((t) => {
      suggestionsToApply.push({
        taskId: t._id,
        title: t.title,
        currentDueDate: t.dueDateString,
        suggestedDueDateString: todayStr,
        reason: 'Overdue recovery — scheduled for today'
      });
    });
  }

  // 2. Distribute high-priority unscheduled tasks
  if (unscheduled.length > 0) {
    recommendations.push({
      type: 'info',
      message: `Found ${unscheduled.length} unscheduled task(s). Auto-allocating sensible target dates.`
    });

    let currentDayOffset = 1;
    unscheduled.slice(0, 5).forEach((t) => {
      const target = new Date(now.getTime() + currentDayOffset * 24 * 60 * 60 * 1000);
      const ds = target.toISOString().split('T')[0];
      suggestionsToApply.push({
        taskId: t._id,
        title: t.title,
        currentDueDate: null,
        suggestedDueDateString: ds,
        reason: t.priority === 'high' ? 'High priority — scheduled within 48h' : 'Workload balance'
      });
      currentDayOffset++;
    });
  }

  // 3. Workload summary
  const totalActive = tasks.length;
  const highPriorityCount = tasks.filter((t) => t.priority === 'high').length;

  return {
    metrics: {
      totalActive,
      highPriorityCount,
      overdueCount: overdue.length,
      dueTodayCount: dueToday.length,
      unscheduledCount: unscheduled.length
    },
    recommendations,
    suggestedAdjustments: suggestionsToApply,
    proposedDayPlan: {
      focusForToday: dueToday.slice(0, 4).map((t) => ({ id: t._id, title: t.title, priority: t.priority })),
      urgentActionItems: overdue.map((t) => ({ id: t._id, title: t.title, daysOverdue: Math.ceil((now - new Date(t.dueDate)) / (1000 * 60 * 60 * 24)) }))
    }
  };
};

/**
 * Main AI Assistant Conversation & Command Processor:
 * Interprets user intent (chat, schedule, query, complete, reschedule, breakdown, optimize),
 * executes the appropriate action in the database within tenant boundaries,
 * and formats a rich, human-like response with interactive action cards.
 */
export const processAiAssistantMessage = async ({
  message,
  conversationHistory = [],
  organization,
  user,
  clientTimezone = 'UTC',
  activeWorkspaceId = null
}) => {
  const cleanMsg = (message || '').trim();
  const lower = cleanMsg.toLowerCase();
  const orgId = organization._id;
  const tz = getValidTimezone(clientTimezone);
  const { dateString: todayStr } = getTimezoneDayBoundaries(tz);

  // 1. INTENT: Schedule / Create a task
  if (
    /^(schedule|create|add|make|set up|remind me to|plan a task)\b/i.test(cleanMsg) ||
    (lower.includes('schedule') && (lower.includes('tomorrow') || lower.includes('at') || lower.includes('task') || lower.includes('meeting'))) ||
    /\b(due tomorrow|due next|due on|due at)\b/i.test(lower)
  ) {
    const quotaCheck = await checkQuota(orgId, 'tasks_created');
    if (!quotaCheck.allowed) {
      return {
        reply: `⚠️ Monthly task limit reached for your **${quotaCheck.planName}** plan (${quotaCheck.currentUsage}/${quotaCheck.limit}). Please upgrade in **Billing & Plans** to schedule more tasks with AI.`,
        action: 'quota_exceeded'
      };
    }

    const taskData = parseTaskSchedulePrompt(cleanMsg, clientTimezone);

    const newTask = await Task.create({
      organization: orgId,
      workspace: activeWorkspaceId,
      user: user._id,
      title: taskData.title,
      description: taskData.description,
      priority: taskData.priority,
      category: taskData.category,
      dueDate: taskData.dueDate,
      dueDateString: taskData.dueDateString,
      recurrence: taskData.recurrence,
      subtasks: taskData.subtasks
    });

    await recordUsage(orgId, 'tasks_created', 1);

    broadcastTenantEvent(orgId, {
      type: 'TASK_CREATED',
      taskId: newTask._id,
      task: newTask,
      actor: user._id
    });

    const timingNote = taskData.dueDateString
      ? `📅 Scheduled for **${taskData.dueDateString}**`
      : '📌 No due date specified (added to backlog)';
    const priorityNote = `⚡ Priority: **${taskData.priority.toUpperCase()}**`;
    const categoryNote = `📁 Category: **${taskData.category}**`;
    const subtaskNote = taskData.subtasks.length > 0 ? `\n📋 Included **${taskData.subtasks.length} subtasks**` : '';

    return {
      reply: `✨ **Task scheduled successfully!**\n\n**${newTask.title}**\n- ${timingNote}\n- ${priorityNote}\n- ${categoryNote}${subtaskNote}\n\nWould you like me to add subtasks, adjust the date, or schedule another task?`,
      action: 'task_created',
      task: newTask,
      suggestedReplies: [
        'Plan my day',
        'Show all tasks due today',
        'Break down this task into more steps'
      ]
    };
  }

  // 2. INTENT: Project Roadmap / Breakdown
  if (
    lower.includes('break down') ||
    lower.includes('project roadmap') ||
    lower.includes('plan project') ||
    lower.includes('create milestones')
  ) {
    const goal = cleanMsg
      .replace(/^(break down|project roadmap|plan project|create milestones|plan)\s+(for\s+)?/i, '')
      .replace(/^the\s+/i, '');

    const milestones = generateTaskBreakdown(goal || 'New Project', clientTimezone);

    return {
      reply: `🚀 Here is the AI-generated execution roadmap for **"${goal || 'Project'}"**:\n\n` +
        milestones
          .map((m, idx) => `${idx + 1}. **${m.title}** — 📅 *${m.dueDateString}* (${m.priority} priority)`)
          .join('\n') +
        `\n\nClick **"Create All Milestones"** below to automatically add all ${milestones.length} tasks to your workspace!`,
      action: 'project_breakdown',
      milestones,
      suggestedReplies: [
        'Add all milestones to my workspace',
        'Optimize my schedule',
        'Show my tasks'
      ]
    };
  }

  // 3. INTENT: Optimize Schedule / Plan Day
  if (
    lower.includes('optimize') ||
    lower.includes('plan my day') ||
    lower.includes('organize my day') ||
    lower.includes('schedule optimizer')
  ) {
    const optimization = await calculateOptimizedSchedule(orgId, user._id, clientTimezone);

    let reply = `🧠 **AI Schedule Analysis & Optimization**:\n\n`;
    reply += `📊 **Workload Status**:\n`;
    reply += `- 🚨 **${optimization.metrics.overdueCount}** Overdue tasks\n`;
    reply += `- 🎯 **${optimization.metrics.dueTodayCount}** Tasks due today\n`;
    reply += `- ⚡ **${optimization.metrics.highPriorityCount}** High priority tasks\n`;
    reply += `- 📦 **${optimization.metrics.unscheduledCount}** Unscheduled tasks\n\n`;

    if (optimization.recommendations.length > 0) {
      reply += `💡 **AI Recommendations**:\n`;
      optimization.recommendations.forEach((r) => {
        reply += `- ${r.message}\n`;
      });
      reply += `\n`;
    }

    if (optimization.suggestedAdjustments.length > 0) {
      reply += `🗓️ **Proposed Schedule Adjustments**:\n`;
      optimization.suggestedAdjustments.slice(0, 4).forEach((adj) => {
        reply += `- **${adj.title}** ➔ Schedule for **${adj.suggestedDueDateString}** (${adj.reason})\n`;
      });
      reply += `\nClick **"Apply AI Schedule"** below to automatically sync these dates.`;
    } else {
      reply += `🎉 Your schedule is currently well-balanced! No urgent conflicts found.`;
    }

    return {
      reply,
      action: 'schedule_optimized',
      optimization,
      suggestedReplies: [
        'Show overdue tasks',
        'Schedule a new task',
        'Show completed tasks'
      ]
    };
  }

  // 4. INTENT: Query Tasks (Show overdue, due today, high priority, etc.)
  if (
    lower.includes('show') ||
    lower.includes('what are') ||
    lower.includes('list') ||
    lower.includes('get tasks')
  ) {
    const query = { organization: orgId, isDeleted: false };

    let filterLabel = 'active tasks';
    if (lower.includes('overdue')) {
      query.status = { $ne: 'completed' };
      query.dueDateString = { $lt: todayStr };
      filterLabel = 'overdue tasks';
    } else if (lower.includes('today') || lower.includes('my day')) {
      query.dueDateString = todayStr;
      filterLabel = 'tasks due today';
    } else if (lower.includes('high priority') || lower.includes('urgent')) {
      query.priority = 'high';
      query.status = { $ne: 'completed' };
      filterLabel = 'high priority tasks';
    } else if (lower.includes('completed') || lower.includes('done')) {
      query.status = 'completed';
      filterLabel = 'completed tasks';
    } else {
      query.status = { $ne: 'completed' };
    }

    const tasks = await Task.find(query).limit(8).sort({ dueDate: 1, priority: -1 });

    if (tasks.length === 0) {
      return {
        reply: `✨ Great news! You have no **${filterLabel}** right now.\n\nWould you like me to help schedule your next goals?`,
        action: 'task_list',
        tasks: [],
        suggestedReplies: ['Schedule a task for tomorrow', 'Plan my day', 'Break down a project']
      };
    }

    let reply = `📋 Here are your **${filterLabel}** (${tasks.length}):\n\n`;
    tasks.forEach((t, i) => {
      const dueInfo = t.dueDateString ? `📅 ${t.dueDateString}` : 'No date';
      const statusIcon = t.status === 'completed' ? '✅' : '⏳';
      reply += `${i + 1}. ${statusIcon} **${t.title}** — ${dueInfo} [${t.priority.toUpperCase()}]\n`;
    });

    return {
      reply,
      action: 'task_list',
      tasks,
      suggestedReplies: [
        'Complete the first task',
        'Plan my day',
        'Schedule a new task'
      ]
    };
  }

  // 5. INTENT: Complete Task
  if (
    lower.startsWith('complete ') ||
    lower.startsWith('finish ') ||
    lower.startsWith('done ') ||
    lower.includes('mark as completed') ||
    lower.includes('mark as done')
  ) {
    let searchTitle = cleanMsg
      .replace(/^(complete|finish|done|mark as completed|mark as done)\s+(task\s+)?/i, '')
      .replace(/['"]/g, '')
      .trim();

    if (!searchTitle) searchTitle = '';

    const task = await Task.findOne({
      organization: orgId,
      isDeleted: false,
      status: { $ne: 'completed' },
      title: { $regex: new RegExp(searchTitle, 'i') }
    });

    if (task) {
      task.status = 'completed';
      await task.save();

      broadcastTenantEvent(orgId, {
        type: 'TASK_UPDATED',
        taskId: task._id,
        task,
        actor: user._id
      });

      return {
        reply: `✅ Task **"${task.title}"** marked as completed! Excellent work! 🎉`,
        action: 'task_completed',
        task,
        suggestedReplies: ['Show remaining tasks', 'Plan my day', 'Schedule next task']
      };
    } else {
      return {
        reply: `🤔 I couldn't find an open task matching "${searchTitle}". Would you like to view your active tasks?`,
        suggestedReplies: ['Show all tasks', 'Show tasks due today']
      };
    }
  }

  // 6. DEFAULT / GENERAL AI PRODUCTIVITY ASSISTANT
  // If user greets or asks general question
  const greeting = `👋 Hello ${user.name || 'there'}! I am **TaskFlow AI**, your intelligent task manager & scheduling assistant.\n\n` +
    `Here is what I can do for you:\n` +
    `- **Natural Language Scheduling**: Type *"Schedule client demo next Thursday at 2pm high priority"*\n` +
    `- **Smart Daily Planning**: Ask *"Plan my day"* or *"Optimize my schedule"*\n` +
    `- **Project Breakdowns**: Say *"Break down project launch beta website"*\n` +
    `- **Task Management**: Ask *"Show overdue tasks"* or *"Complete task [title]"*\n\n` +
    `How can I help you today?`;

  return {
    reply: greeting,
    action: 'greeting',
    suggestedReplies: [
      '📅 Plan my day',
      '⚡ Schedule a task for tomorrow at 10am',
      '⚠️ Show overdue tasks',
      '🚀 Break down a project'
    ]
  };
};
