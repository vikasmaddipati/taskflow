import api from './api';

const WAKE_PHRASES = '(?:task\\s*flow|taskflow|task\\s*flo|tasks\\s*flow|tasked\\s*flow|task\\s*low|task\\s*follow|task\\s*floor|task\\s*four|task\\s*for|task\\s*slow|task\\s*glow|task\\s*blow|task\\s*float|task\\s*flaw|task\\s*full|task\\s*show|task\\s*throw|task\\s*though|task\\s*below|task\\s*hello|task\\s*fellow|task\\s*go|task\\s*no|task\\s*off|ask\\s*flow|desk\\s*flow|test\\s*flow|tax\\s*flow|that\\s*flow|the\\s*flow|talk\\s*flow|touch\\s*flow|toss\\s*flow|top\\s*flow|fast\\s*flow|past\\s*flow|pass\\s*flow|last\\s*flow|tusk\\s*flow|tech\\s*flow|text\\s*flow|tack\\s*flow|take\\s*flow)';
const WAKE_WORD_REGEX = new RegExp(`^(?:(?:hey|ok|okay|hi|hello)\\s+)?${WAKE_PHRASES}(?:\\s*[,.:;!?-]|\\s+(?:please|can you|could you)\\b)?\\s*`, 'i');
const WAKE_CONTAINS_REGEX = new RegExp(`\\b${WAKE_PHRASES}\\b`, 'i');

const PRONOUN_TASK_REGEX = /^(?:it|that|that task|the task|this task|the last one|last one|this one)$/i;

const levenshtein = (a, b) => {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
};

const isStrictTaskWord = (w) =>
  levenshtein(w, 'task') <= 1 || w === 'tasks' || w === 'tasked' || w === 'tusk' || w === 'tusks' || w === 'tass';

const isBroadTaskWord = (w) =>
  isStrictTaskWord(w) ||
  ['ask', 'desk', 'test', 'tax', 'that', 'talk', 'touch', 'toss', 'top', 'fast', 'past', 'pass', 'last', 'cast', 'dash', 'tech', 'text', 'tack', 'take', 'tough'].includes(w);

const isStrictFlowWord = (w) =>
  levenshtein(w, 'flow') <= 1 || w === 'floe' || w === 'flo';

const isBroadFlowWord = (w) =>
  isStrictFlowWord(w) ||
  levenshtein(w, 'flow') <= 2 ||
  ['for', 'four', 'floor', 'follow', 'full', 'show', 'throw', 'though', 'below', 'hello', 'fellow', 'float', 'go', 'no', 'off'].includes(w);

const matchFuzzyWakeWord = (candidate) => {
  const words = candidate.trim().split(/\s+/);
  for (let i = 0; i < words.length; i += 1) {
    const w1 = words[i].toLowerCase().replace(/[^a-z]/g, '');
    if (!w1) continue;
    if (w1.length >= 6 && (levenshtein(w1, 'taskflow') <= 2 || w1.startsWith('taskfl') || w1.startsWith('tasklo') || w1 === 'taskfollow' || w1 === 'taskfloor')) {
      return words.slice(i + 1).join(' ');
    }
    if (i + 1 < words.length) {
      const w2 = words[i + 1].toLowerCase().replace(/[^a-z]/g, '');
      if (w2 && ((isStrictTaskWord(w1) && isBroadFlowWord(w2)) || (isBroadTaskWord(w1) && isStrictFlowWord(w2)))) {
        return words.slice(i + 2).join(' ');
      }
    }
  }
  return null;
};

const normalizeVoiceCommand = (raw = '') =>
  String(raw || '')
    .trim()
    .replace(/\b(?:great|creator|created|creating)\s+(?:a\s+|the\s+)?task\b/gi, 'create a task')
    .replace(/\b(?:added|adding)\s+(?:a\s+|the\s+)?task\b/gi, 'add a task')
    .replace(/\b(?:made|making)\s+(?:a\s+|the\s+)?task\b/gi, 'make a task')
    .replace(/\bscheduled\s+(?:a\s+|the\s+)?task\b/gi, 'schedule a task')
    .replace(/\b(?:the\s+lead|deleted)\s+(?:a\s+|the\s+)?task\b/gi, 'delete task')
    .replace(/\bmarket\s+(?:as\s+)?done\b/gi, 'mark it done')
    .replace(/\b(?:can\s+ban|can\s+ben|khan\s+ban|con\s+ban)\b/gi, 'kanban')
    .replace(/\b(?:sittings|sitting|set\s+things)\b/gi, 'settings')
    .replace(/\bdash\s+board\b/gi, 'dashboard')
    .replace(/\bco\s+pilot\b/gi, 'copilot')
    .replace(/\bup\s+coming\b/gi, 'upcoming')
    .replace(/\ball\s+task\b/gi, 'all tasks')
    .replace(/\bmy\s+(?:date|dear)\b/gi, 'my day')
    .trim();

const VIEW_ALIASES = [
  { view: 'dashboard', label: 'Dashboard', patterns: ['dashboard', 'home', 'overview'] },
  { view: 'ai', label: 'AI Assistant', patterns: ['ai assistant', 'ai view', 'assistant', 'scheduler', 'ai'] },
  { view: 'all', label: 'All Tasks', patterns: ['all tasks', 'tasks', 'task list', 'my list'] },
  { view: 'board', label: 'Kanban Board', patterns: ['kanban board', 'kanban', 'board'] },
  { view: 'today', label: 'My Day', patterns: ['my day', 'today view', 'today'] },
  { view: 'upcoming', label: 'Upcoming Tasks', patterns: ['upcoming tasks', 'upcoming', 'upcoming schedule'] },
  { view: 'completed', label: 'Completed Tasks', patterns: ['completed tasks', 'completed', 'done tasks'] },
  { view: 'team', label: 'Team and Members', patterns: ['team and members', 'team members', 'members', 'team', 'teams'] },
  { view: 'billing', label: 'Billing and Plans', patterns: ['billing and plans', 'billing', 'plans', 'subscription'] },
  { view: 'settings', label: 'Settings', patterns: ['account settings', 'settings', 'setting', 'profile', 'preferences'] },
  { view: 'trash', label: 'Trash and Recovery', patterns: ['trash and recovery', 'trash', 'recovery', 'recycle bin'] }
];

export const VOICE_COMMAND_EXAMPLES = [
  { group: 'Tasks, Subtasks & Comments', examples: [
    'Task Flow, I need to finish the Python report tomorrow high priority',
    'Task Flow, schedule a task name PYTHON',
    'Task Flow, I finished Python',
    'Task Flow, reschedule Python to Friday',
    'Task Flow, add subtask write unit tests to Python',
    'Task Flow, add comment waiting for review to Python'
  ] },
  { group: 'AI & Daily Check-ins', examples: [
    'Task Flow, what do I have today',
    'Task Flow, what is upcoming',
    'Task Flow, am I behind on anything',
    'Task Flow, plan my day',
    'Task Flow, optimize schedule',
    'Task Flow, break down launch marketing campaign'
  ] },
  { group: 'Navigation, Board & Bulk Actions', examples: [
    'Task Flow, open kanban board',
    'Task Flow, move Python to in progress',
    'Task Flow, complete all overdue tasks',
    'Task Flow, permanently delete Python',
    'Task Flow, read details of Python',
    'Task Flow, open ai copilot'
  ] },
  { group: 'Team, Billing, Settings & Workspaces', examples: [
    'Task Flow, list team members',
    'Task Flow, invite alex@company.com as admin',
    'Task Flow, what plan am I on',
    'Task Flow, list active sessions',
    'Task Flow, switch workspace General',
    'Task Flow, export tasks as csv'
  ] }
];

const formatDateYMD = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Formats YYYY-MM-DD into natural spoken phrasing ("today", "tomorrow", or "on Thursday, Nov 12").
 */
export const formatHumanDate = (ymd) => {
  if (!ymd || typeof ymd !== 'string') return '';
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return ymd;

  const now = new Date();
  const todayStr = formatDateYMD(now);
  const tomorrow = new Date(now.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDateYMD(tomorrow);

  if (ymd === todayStr) return 'today';
  if (ymd === tomorrowStr) return 'tomorrow';

  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const formatted = target.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
  return `on ${formatted}`;
};

/**
 * Checks whether a spoken transcript (or alternative matches) contains the "Task Flow" wake phrase.
 * Returns { woke, wakeOnly, command }.
 */
export const extractWakeCommand = (transcript = '', requireWakeWord = true, alternatives = []) => {
  const candidates = [transcript, ...(Array.isArray(alternatives) ? alternatives : [])]
    .map((s) => String(s || '').trim())
    .filter(Boolean);

  if (candidates.length === 0) {
    return { woke: false, wakeOnly: false, command: '' };
  }

  for (const candidate of candidates) {
    if (WAKE_WORD_REGEX.test(candidate)) {
      const remainder = candidate
        .replace(WAKE_WORD_REGEX, '')
        .replace(/^(?:please|can you|could you)\s+/i, '')
        .trim();
      if (!remainder) {
        return { woke: true, wakeOnly: true, command: '' };
      }
      return { woke: true, wakeOnly: false, command: remainder };
    }

    const inlineMatch = candidate.match(WAKE_CONTAINS_REGEX);
    if (inlineMatch) {
      const idx = inlineMatch.index ?? 0;
      const after = candidate
        .slice(idx + inlineMatch[0].length)
        .replace(/^[,.:;!?-\s]+/, '')
        .replace(/^(?:please|can you|could you)\s+/i, '')
        .trim();
      if (!after) {
        return { woke: true, wakeOnly: true, command: '' };
      }
      return { woke: true, wakeOnly: false, command: after };
    }

    const fuzzyRemainder = matchFuzzyWakeWord(candidate);
    if (fuzzyRemainder !== null) {
      const cleaned = fuzzyRemainder
        .replace(/^[,.:;!?-\s]+/, '')
        .replace(/^(?:please|can you|could you)\s+/i, '')
        .trim();
      if (!cleaned) {
        return { woke: true, wakeOnly: true, command: '' };
      }
      return { woke: true, wakeOnly: false, command: cleaned };
    }
  }

  if (!requireWakeWord) {
    return { woke: true, wakeOnly: false, command: candidates[0] };
  }

  return { woke: false, wakeOnly: false, command: '' };
};

const stripPoliteFillers = (text) =>
  text
    .replace(/^(?:hey|hi|hello|okay|ok|alright|actually|well|um|uh)(?:,\s*|\s+|$)/i, '')
    .replace(/^(?:can you|could you|would you|will you|please|kindly)\s+/i, '')
    .replace(/^(?:please|just)\s+/i, '')
    .replace(/\s+(?:for me|please)$/i, '')
    .trim();

/**
 * Local fallback natural-language parser so voice task creation/scheduling works
 * even when offline or if /v1/ai/parse is unavailable.
 */
export const parseTaskPromptLocal = (prompt) => {
  const cleanPrompt = String(prompt || '').trim();
  const lower = cleanPrompt.toLowerCase();

  let priority = 'medium';
  let hasExplicitPriority = false;
  if (/\b(urgent|critical|asap|high priority|highest priority|p1|important)\b/i.test(cleanPrompt)) {
    priority = 'high';
    hasExplicitPriority = true;
  } else if (/\b(medium priority|normal priority|p2)\b/i.test(cleanPrompt)) {
    priority = 'medium';
    hasExplicitPriority = true;
  } else if (/\b(low priority|whenever|backlog|p3|optional)\b/i.test(cleanPrompt)) {
    priority = 'low';
    hasExplicitPriority = true;
  }

  let recurrence = { isRecurring: false, frequency: 'none', interval: 1 };
  if (/\b(every day|daily)\b/i.test(cleanPrompt)) {
    recurrence = { isRecurring: true, frequency: 'daily', interval: 1 };
  } else if (/\b(every week|weekly|every (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(cleanPrompt)) {
    recurrence = { isRecurring: true, frequency: 'weekly', interval: 1 };
  } else if (/\b(every month|monthly)\b/i.test(cleanPrompt)) {
    recurrence = { isRecurring: true, frequency: 'monthly', interval: 1 };
  }

  let category = 'General';
  const catKeywords = {
    Work: ['work', 'meeting', 'project', 'client', 'sprint', 'presentation', 'report', 'review', 'standup'],
    Personal: ['personal', 'home', 'groceries', 'gym', 'workout', 'shopping', 'health', 'doctor', 'family', 'mom', 'dad'],
    Development: ['dev', 'bug', 'fix', 'backend', 'frontend', 'database', 'api', 'code', 'deploy', 'python'],
    Marketing: ['marketing', 'campaign', 'launch', 'newsletter', 'social', 'blog', 'seo'],
    Finance: ['finance', 'tax', 'invoice', 'payroll', 'expense', 'budget', 'billing']
  };
  for (const [catName, words] of Object.entries(catKeywords)) {
    if (words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(cleanPrompt))) {
      category = catName;
      break;
    }
  }

  const now = new Date();
  let targetDate = new Date(now.getTime());
  let dateMatched = false;

  if (lower.includes('day after tomorrow')) {
    targetDate.setDate(targetDate.getDate() + 2);
    dateMatched = true;
  } else if (lower.includes('tomorrow')) {
    targetDate.setDate(targetDate.getDate() + 1);
    dateMatched = true;
  } else if (lower.includes('today') || lower.includes('tonight')) {
    dateMatched = true;
  } else if (/\bin\s+(\d+)\s+days?\b/.test(lower)) {
    const days = parseInt(lower.match(/\bin\s+(\d+)\s+days?\b/)[1], 10);
    targetDate.setDate(targetDate.getDate() + days);
    dateMatched = true;
  } else if (lower.includes('next week')) {
    targetDate.setDate(targetDate.getDate() + 7);
    dateMatched = true;
  } else {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < dayNames.length; i += 1) {
      if (lower.includes(dayNames[i])) {
        const diff = (i - targetDate.getDay() + 7) % 7 || 7;
        targetDate.setDate(targetDate.getDate() + diff);
        dateMatched = true;
        break;
      }
    }
  }

  let dueTime = '';
  const timeMatch = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (timeMatch) {
    const rawHour = parseInt(timeMatch[1], 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    let h = rawHour;
    if (timeMatch[3] === 'pm' && h < 12) h += 12;
    if (timeMatch[3] === 'am' && h === 12) h = 0;
    targetDate.setHours(h, m, 0, 0);
    dateMatched = true;
    const minStr = m > 0 ? `:${String(m).padStart(2, '0')}` : '';
    dueTime = `${rawHour}${minStr} ${timeMatch[3].toUpperCase()}`;
  } else if (dateMatched) {
    targetDate.setHours(17, 0, 0, 0);
  }

  let title = cleanPrompt
    .replace(/^(?:i need to|i have to|i want to|i would like to|i gotta|help me|let'?s|don't let me forget to|remember to|put)\s+/i, '')
    .replace(/^(?:schedule|create|add|make|new|start|set up|remind me to|set reminder(?:\s+to)?)\s+(?:(?:a|an|the)\s+)?(?:new\s+)?(?:task\s+)?(?:for\s+me\s+)?(?:called\s+|named\s+|name\s+|titled\s+|to\s+)?/i, '')
    .replace(/\s+on my (?:task\s+)?list$/i, '')
    .replace(/\b(?:with\s+)?(?:high|medium|low)\s+priority\b/gi, '')
    .replace(/\b(?:urgent|critical|asap)\b/gi, '')
    .replace(/\b(?:every\s+(?:day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|daily|weekly|monthly)\b/gi, '')
    .replace(/\b(?:for\s+|on\s+|by\s+|in\s+)?(?:day after tomorrow|tomorrow|tonight|today|next\s+(?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in\s+\d+\s+days?)(?:\s+(?:morning|afternoon|evening|night))?\b/gi, '')
    .replace(/\b(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,:-]+|[\s,:-]+$/g, '')
    .trim();

  const hasExplicitTitle = Boolean(title) && !/^(?:a\s+task|task|new\s+task)$/i.test(title);
  if (!title) title = 'New Voice Task';
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return {
    title,
    description: `Created via TaskFlow Voice Assistant: "${cleanPrompt}"`,
    priority,
    category,
    dueDate: dateMatched ? targetDate.toISOString() : null,
    dueDateString: dateMatched ? formatDateYMD(targetDate) : null,
    dueTime,
    hasExplicitTitle,
    hasExplicitDate: dateMatched,
    hasExplicitPriority,
    recurrence
  };
};

const stripTaskQueryPrefix = (text, regex) =>
  text
    .replace(regex, '')
    .replace(/^(?:a|the)\s+task\s*/i, '')
    .replace(/^(?:called|named|name|titled)\s+/i, '')
    .replace(/['"]/g, '')
    .trim();

/**
 * Pure intent parser mapping conversational human speech to structured actions across the app.
 */
export const parseVoiceIntent = (rawCommand = '') => {
  const command = stripPoliteFillers(normalizeVoiceCommand(rawCommand));
  const lower = command.toLowerCase();

  if (!command) {
    return { type: 'EMPTY' };
  }

  // 1. Voice assistant controls & human courtesy / small talk
  if (/^(?:stop listening|pause listening|mute voice|go to sleep|sleep|never mind|cancel)$/i.test(lower)) {
    return { type: 'VOICE_STOP' };
  }
  if (/^(?:thank you|thanks|thanks a lot|thank you so much|awesome|great job|good job|bye|goodbye|see you|that's all|thats all)$/i.test(lower)) {
    return { type: 'SMALL_TALK_THANKS' };
  }
  if (/^(?:good morning|good afternoon|good evening|hi|hello|hey there|hey)$/i.test(lower)) {
    return { type: 'SMALL_TALK_GREETING' };
  }
  if (/^(?:how are you|how are you doing|how's it going|what's up|whats up)\??$/i.test(lower)) {
    return { type: 'SMALL_TALK_HOW_ARE_YOU' };
  }
  if (/^(?:who are you|what is your name|what's your name)\??$/i.test(lower)) {
    return { type: 'SMALL_TALK_IDENTITY' };
  }
  if (/^(?:help|voice commands|what can you do|show commands|commands)$/i.test(lower)) {
    return { type: 'VOICE_HELP' };
  }

  // 2. Schedule task vs Create task (including conversational "I need to...", "remind me to...")
  if (/^(?:schedule(?:\s+a)?\s+task|schedule|remind me to|don't let me forget to|dont let me forget to|set(?:\s+a)?\s+reminder(?:\s+to)?)\b/i.test(lower)) {
    const details = command
      .replace(/^(?:schedule(?:\s+a)?\s+task|schedule|remind me to|don't let me forget to|dont let me forget to|set(?:\s+a)?\s+reminder(?:\s+to)?)\s*/i, '')
      .trim();
    if (!details) {
      return { type: 'OPEN_SCHEDULER' };
    }
    return { type: 'TASK_SCHEDULE', prompt: command };
  }

  if (
    /^(?:(?:i\s+(?:want|would\s+like|need)\s+to|help\s+me|let'?s)\s+)?(?:create|add|new|make|start)(?:\s+(?:a|an|the))?(?:\s+new)?\s+task\b/i.test(lower) ||
    /^(?:new task|add task|create task|make task)$/i.test(lower) ||
    /^(?:i need to|i have to|i want to|i gotta|put)\s+.+/i.test(lower)
  ) {
    const details = command
      .replace(/^(?:(?:i\s+(?:want|would\s+like|need)\s+to|help\s+me|let'?s)\s+)?(?:create|add|new|make|start)(?:\s+(?:a|an|the))?(?:\s+new)?\s+task\s*/i, '')
      .replace(/^(?:for\s+me\s+)?(?:called|named|name|titled)\s+/i, '')
      .replace(/^for\s+me$/i, '')
      .trim();
    if (!details) {
      return { type: 'OPEN_CREATE_TASK_MODAL' };
    }
    return { type: 'TASK_CREATE', prompt: command };
  }

  // 3. AI Breakdown & Optimization
  if (/^(?:break\s*down|plan project|create milestones(?:\s+for)?)\b/i.test(lower)) {
    const goal = command
      .replace(/^(?:break\s*down|plan project|create milestones(?:\s+for)?)\s*(?:for\s+)?/i, '')
      .trim();
    return { type: 'AI_BREAKDOWN', goal: goal || 'New Project' };
  }

  if (/\b(?:optimize schedule|balance schedule|apply ai schedule|apply schedule)\b/i.test(lower)) {
    return { type: 'AI_OPTIMIZE' };
  }

  if (/\b(?:plan my day|organize my day|daily plan)\b/i.test(lower)) {
    return { type: 'AI_PLAN_DAY' };
  }

  // 4. Subtasks & Comments
  if (/^(?:add|create|new)\s+(?:a\s+)?subtask\s+/i.test(lower)) {
    const m = command.match(/^(?:add|create|new)\s+(?:a\s+)?subtask\s+(.+)\s+(?:to|for|on|under)\s+(.+)$/i);
    if (m) return { type: 'SUBTASK_ADD', subtaskTitle: m[1].trim(), taskQuery: m[2].trim() };
    const title = command.replace(/^(?:add|create|new)\s+(?:a\s+)?subtask\s+/i, '').trim();
    return { type: 'SUBTASK_ADD', subtaskTitle: title, taskQuery: 'it' };
  }

  if (/^(?:complete|finish|check off|toggle)\s+subtask\s+/i.test(lower)) {
    const m = command.match(/^(?:complete|finish|check off|toggle)\s+subtask\s+(.+)\s+(?:on|of|in|for|from)\s+(.+)$/i);
    if (m) return { type: 'SUBTASK_COMPLETE', subtaskQuery: m[1].trim(), taskQuery: m[2].trim() };
    const sub = command.replace(/^(?:complete|finish|check off|toggle)\s+subtask\s+/i, '').trim();
    return { type: 'SUBTASK_COMPLETE', subtaskQuery: sub, taskQuery: 'it' };
  }

  if (/^(?:delete|remove)\s+subtask\s+/i.test(lower)) {
    const m = command.match(/^(?:delete|remove)\s+subtask\s+(.+)\s+(?:from|on|of|in)\s+(.+)$/i);
    if (m) return { type: 'SUBTASK_DELETE', subtaskQuery: m[1].trim(), taskQuery: m[2].trim() };
    const sub = command.replace(/^(?:delete|remove)\s+subtask\s+/i, '').trim();
    return { type: 'SUBTASK_DELETE', subtaskQuery: sub, taskQuery: 'it' };
  }

  if (/^(?:add\s+(?:a\s+)?comment|comment)\s+/i.test(lower)) {
    const m = command.match(/^(?:add\s+(?:a\s+)?comment|comment)\s+(.+)\s+(?:to|on|for)\s+(.+)$/i);
    if (m) return { type: 'COMMENT_ADD', content: m[1].trim(), taskQuery: m[2].trim() };
    const content = command.replace(/^(?:add\s+(?:a\s+)?comment|comment)\s+/i, '').trim();
    return { type: 'COMMENT_ADD', content, taskQuery: 'it' };
  }

  if (/^(?:read|show|check)\s+comments(?:\s+(?:on|of|for)\s+(.+))?$/i.test(lower)) {
    const m = command.match(/^(?:read|show|check)\s+comments(?:\s+(?:on|of|for)\s+(.+))?$/i);
    return { type: 'COMMENT_READ', taskQuery: m?.[1]?.trim() || 'it' };
  }

  // 5. Task status mutations, reschedule, rename, category, assign, details, bulk, delete, restore, trash, export
  if (/^(?:complete|mark)\s+all\s+(overdue|today|pending)\s+tasks(?:\s+(?:as\s+)?(?:done|completed))?$/i.test(lower)) {
    const m = lower.match(/^(?:complete|mark)\s+all\s+(overdue|today|pending)\s+tasks/i);
    return { type: 'TASK_BULK', action: 'complete', scope: m[1].toLowerCase() };
  }

  if (/^(?:delete|clear)\s+all\s+(completed|overdue)\s+tasks$/i.test(lower)) {
    const m = lower.match(/^(?:delete|clear)\s+all\s+(completed|overdue)\s+tasks$/i);
    return { type: 'TASK_BULK', action: 'delete', scope: m[1].toLowerCase() };
  }

  if (/^(?:permanently\s+delete|delete\s+permanently|forever\s+delete)\s+/i.test(lower)) {
    const query = stripTaskQueryPrefix(command, /^(?:permanently\s+delete|delete\s+permanently|forever\s+delete)\s+/i);
    return { type: 'TASK_PERMANENT_DELETE', query };
  }

  if (/^(?:reschedule|postpone|defer)\s+(.+?)\s+(?:to|for)\s+(.+)$/i.test(lower)) {
    const m = command.match(/^(?:reschedule|postpone|defer)\s+(.+?)\s+(?:to|for)\s+(.+)$/i);
    return { type: 'TASK_RESCHEDULE', query: stripTaskQueryPrefix(m[1], /^$/), dateText: m[2].trim() };
  }

  if (/^(?:set|change)\s+due\s+date\s+(?:of\s+)?(.+?)\s+to\s+(.+)$/i.test(lower)) {
    const m = command.match(/^(?:set|change)\s+due\s+date\s+(?:of\s+)?(.+?)\s+to\s+(.+)$/i);
    return { type: 'TASK_RESCHEDULE', query: stripTaskQueryPrefix(m[1], /^$/), dateText: m[2].trim() };
  }

  if (/^rename\s+(.+?)\s+to\s+(.+)$/i.test(lower)) {
    const m = command.match(/^rename\s+(.+?)\s+to\s+(.+)$/i);
    return { type: 'TASK_RENAME', query: stripTaskQueryPrefix(m[1], /^$/), newTitle: m[2].trim() };
  }

  if (/^(?:set|change)\s+category\s+(?:of\s+)?(.+?)\s+to\s+(.+)$/i.test(lower)) {
    const m = command.match(/^(?:set|change)\s+category\s+(?:of\s+)?(.+?)\s+to\s+(.+)$/i);
    return { type: 'TASK_SET_CATEGORY', query: stripTaskQueryPrefix(m[1], /^$/), category: m[2].trim() };
  }

  if (/^assign\s+(.+?)\s+to\s+(.+)$/i.test(lower)) {
    const m = command.match(/^assign\s+(.+?)\s+to\s+(.+)$/i);
    return { type: 'TASK_ASSIGN', query: stripTaskQueryPrefix(m[1], /^$/), assigneeQuery: m[2].trim() };
  }

  if (/^(?:move|set)\s+(.+?)\s+(?:to|as)\s+(todo|to do|pending|in progress|review|completed|done)$/i.test(lower)) {
    const m = command.match(/^(?:move|set)\s+(.+?)\s+(?:to|as)\s+(todo|to do|pending|in progress|review|completed|done)$/i);
    const rawStatus = m[2].toLowerCase();
    const status = rawStatus === 'in progress'
      ? 'in_progress'
      : rawStatus === 'review'
        ? 'review'
        : (rawStatus === 'completed' || rawStatus === 'done' ? 'completed' : 'pending');
    return { type: 'TASK_MOVE_STATUS', query: stripTaskQueryPrefix(m[1], /^$/), status };
  }

  if (/^(?:read|show|get)\s+(?:details|info)(?:\s+(?:of|for|about)\s+(.+))?$/i.test(lower) || /^what is\s+(.+?)\s+about\??$/i.test(lower)) {
    const m = command.match(/^(?:read|show|get)\s+(?:details|info)(?:\s+(?:of|for|about)\s+(.+))?$/i)
      || command.match(/^what is\s+(.+?)\s+about\??$/i);
    return { type: 'TASK_DETAILS', query: m?.[1] ? stripTaskQueryPrefix(m[1], /^$/) : 'it' };
  }

  if (/^(?:read|show)\s+activity(?:\s+(?:of|for|on)\s+(.+))?$/i.test(lower)) {
    const m = command.match(/^(?:read|show)\s+activity(?:\s+(?:of|for|on)\s+(.+))?$/i);
    return { type: 'TASK_ACTIVITY', query: m?.[1] ? stripTaskQueryPrefix(m[1], /^$/) : 'it' };
  }

  if (
    /^(?:complete|finish|done|i finished|i completed|i'm done with|im done with|check off|mark(?:\s+task)?\s+as\s+(?:completed|done))\b/i.test(lower) ||
    /^mark\s+.+\s+(?:as\s+)?(?:done|completed)$/i.test(lower)
  ) {
    const query = /^mark\s+/i.test(lower)
      ? command.replace(/^mark\s+(?:task\s+)?/i, '').replace(/\s+(?:as\s+)?(?:done|completed)$/i, '').trim()
      : stripTaskQueryPrefix(
          command,
          /^(?:complete|finish|done|i finished|i completed|i'm done with|im done with|check off|mark(?:\s+task)?\s+as\s+(?:completed|done))\s+(?:task\s+)?/i
        );
    return { type: 'TASK_COMPLETE', query };
  }

  if (/^(?:reopen|uncomplete|undo complete)\b/i.test(lower)) {
    const query = stripTaskQueryPrefix(command, /^(?:reopen|uncomplete|undo complete)\s+(?:task\s+)?/i);
    return { type: 'TASK_REOPEN', query };
  }

  if (/^(?:start|begin)\s+(?:a\s+)?(?:task\s*)?/i.test(lower) || /^(?:move|set)\s+.+\s+(?:to\s+)?in\s+progress$/i.test(lower)) {
    const query = /^(?:move|set)\s+/i.test(lower)
      ? command.replace(/^(?:move|set)\s+(?:task\s+)?/i, '').replace(/\s+(?:to\s+)?in\s+progress$/i, '').trim()
      : stripTaskQueryPrefix(command, /^(?:start|begin)\s+/i);
    return { type: 'TASK_IN_PROGRESS', query };
  }

  if (/^(?:make|set|change)\s+(.+?)\s+(?:to\s+)?(high|medium|low)\s+priority$/i.test(lower)) {
    const m = command.match(/^(?:make|set|change)\s+(.+?)\s+(?:to\s+)?(high|medium|low)\s+priority$/i);
    return { type: 'TASK_SET_PRIORITY', query: m[1].trim(), priority: m[2].toLowerCase() };
  }

  if (/^(?:edit|modify|update)\s+(?:task\s+)?/i.test(lower)) {
    const priorityMatch = command.match(/\bpriority\s+(?:to\s+)?(high|medium|low)\b/i);
    if (priorityMatch) {
      const query = command
        .replace(/^(?:edit|modify|update)\s+(?:task\s+)?/i, '')
        .replace(/\b(?:set\s+)?priority\s+(?:to\s+)?(?:high|medium|low)\b/i, '')
        .trim();
      return { type: 'TASK_SET_PRIORITY', query, priority: priorityMatch[1].toLowerCase() };
    }
    const query = stripTaskQueryPrefix(command, /^(?:edit|modify|update)\s+(?:task\s+)?/i);
    return { type: 'TASK_EDIT', query };
  }

  if (/^(?:set|change)\s+priority\s+(?:of\s+)?(.+?)\s+(?:to\s+)?(high|medium|low)$/i.test(lower)) {
    const m = command.match(/^(?:set|change)\s+priority\s+(?:of\s+)?(.+?)\s+(?:to\s+)?(high|medium|low)$/i);
    return { type: 'TASK_SET_PRIORITY', query: m[1].trim(), priority: m[2].toLowerCase() };
  }

  if (/^(?:delete|remove|trash|cancel|get rid of)\s+/i.test(lower)) {
    const query = stripTaskQueryPrefix(command, /^(?:delete|remove|trash|cancel|get rid of)\s+/i);
    return { type: 'TASK_DELETE', query };
  }

  if (/^(?:restore|recover)\s+/i.test(lower)) {
    const query = stripTaskQueryPrefix(command, /^(?:restore|recover)\s+/i);
    return { type: 'TASK_RESTORE', query };
  }

  if (/^(?:empty|clear)\s+trash$/i.test(lower)) {
    return { type: 'TRASH_EMPTY' };
  }

  if (/^(?:export\s+tasks|download\s+tasks)/i.test(lower)) {
    const format = lower.includes('csv') ? 'csv' : 'json';
    return { type: 'TASK_EXPORT', format };
  }

  // 5. Conversational Queries & Summaries
  if (/\b(?:task summary|dashboard summary|how many tasks|show stats|task stats|my stats|how am i doing)\b/i.test(lower)) {
    return { type: 'STATS_SUMMARY' };
  }

  if (/\b(?:overdue tasks|what is overdue|what's overdue|show overdue|read overdue|am i behind|anything overdue)\b/i.test(lower)) {
    return { type: 'QUERY_OVERDUE' };
  }

  if (/\b(?:what is due today|what's due today|what do i have today|what's on my plate|anything due today|today's tasks|read my day|show today tasks)\b/i.test(lower)) {
    return { type: 'QUERY_TODAY' };
  }

  if (/\b(?:upcoming tasks|what is upcoming|what's upcoming|show upcoming|read upcoming)\b/i.test(lower)) {
    return { type: 'QUERY_UPCOMING' };
  }

  if (/\b(?:read completed|show completed tasks|what did i complete|what have i completed)\b/i.test(lower)) {
    return { type: 'QUERY_COMPLETED' };
  }

  if (/^(?:list|show)\s+(?:all\s+)?categories$/i.test(lower)) {
    return { type: 'CATEGORIES_LIST' };
  }

  if (/^(?:list|show)\s+(?:all\s+)?organizations$/i.test(lower)) {
    return { type: 'ORGS_LIST' };
  }

  if (/^(?:list|show)\s+(?:all\s+)?workspaces$/i.test(lower)) {
    return { type: 'WORKSPACES_LIST' };
  }

  if (/^(?:search|find)\s+(?:tasks?\s+)?/i.test(lower)) {
    const query = stripTaskQueryPrefix(command, /^(?:search|find)\s+(?:tasks?\s+)?/i);
    return { type: 'TASK_SEARCH', query };
  }

  // 6. Team, Members, Billing, Settings, Sessions, Webhooks
  if (/^(?:list|show)\s+(?:team\s+)?members$/i.test(lower) || /^who is on (?:my|the) team\??$/i.test(lower)) {
    return { type: 'TEAM_MEMBERS_LIST' };
  }

  if (/^(?:list|show)\s+teams$/i.test(lower)) {
    return { type: 'TEAMS_LIST' };
  }

  if (/^(?:create|new|add)\s+(?:a\s+)?team\s+/i.test(lower)) {
    const name = command.replace(/^(?:create|new|add)\s+(?:a\s+)?team\s*(?:called|named|name)?\s*/i, '').trim();
    return { type: 'TEAM_CREATE', name };
  }

  if (/^(?:delete|remove)\s+team\s+/i.test(lower)) {
    const name = command.replace(/^(?:delete|remove)\s+team\s+/i, '').trim();
    return { type: 'TEAM_DELETE', name };
  }

  if (/^invite\s+(\S+@\S+\.\S+)(?:\s+as\s+(admin|member|viewer))?$/i.test(lower)) {
    const m = command.match(/^invite\s+(\S+@\S+\.\S+)(?:\s+as\s+(admin|member|viewer))?$/i);
    return { type: 'MEMBER_INVITE', email: m[1].trim(), role: (m[2] || 'member').toLowerCase() };
  }

  if (/^(?:change|set)\s+role\s+(?:of\s+)?(.+?)\s+to\s+(admin|member|viewer)$/i.test(lower)) {
    const m = command.match(/^(?:change|set)\s+role\s+(?:of\s+)?(.+?)\s+to\s+(admin|member|viewer)$/i);
    return { type: 'MEMBER_ROLE_UPDATE', memberQuery: m[1].trim(), role: m[2].toLowerCase() };
  }

  if (/^(?:remove|kick)\s+member\s+(.+)$/i.test(lower)) {
    const m = command.match(/^(?:remove|kick)\s+member\s+(.+)$/i);
    return { type: 'MEMBER_REMOVE', memberQuery: m[1].trim() };
  }

  if (/\b(?:what plan am i on|billing status|subscription status|show billing|current plan)\b/i.test(lower)) {
    return { type: 'BILLING_STATUS' };
  }

  if (/\b(?:list billing plans|show plans|available plans|subscription plans)\b/i.test(lower)) {
    return { type: 'BILLING_PLANS' };
  }

  if (/^cancel\s+(?:my\s+)?subscription$/i.test(lower)) {
    return { type: 'BILLING_CANCEL' };
  }

  if (/^resume\s+(?:my\s+)?subscription$/i.test(lower)) {
    return { type: 'BILLING_RESUME' };
  }

  if (/^upgrade\s+(?:my\s+)?plan(?:\s+to\s+(.+))?$/i.test(lower)) {
    const m = command.match(/^upgrade\s+(?:my\s+)?plan(?:\s+to\s+(.+))?$/i);
    return { type: 'BILLING_UPGRADE', plan: m?.[1]?.trim() || '' };
  }

  if (/^(?:list|show)\s+(?:active\s+)?sessions$/i.test(lower)) {
    return { type: 'SESSIONS_LIST' };
  }

  if (/^(?:log\s*out|sign\s*out)\s+(?:of\s+)?all\s+devices|sign\s*out\s+everywhere$/i.test(lower)) {
    return { type: 'LOGOUT_ALL' };
  }

  if (/^(?:list|show)\s+webhooks$/i.test(lower)) {
    return { type: 'WEBHOOKS_LIST' };
  }

  if (/^(?:create|add|new)\s+webhook\s+(\S+)$/i.test(lower)) {
    const m = command.match(/^(?:create|add|new)\s+webhook\s+(\S+)$/i);
    return { type: 'WEBHOOK_CREATE', url: m[1].trim() };
  }

  if (/^test\s+webhook(?:\s+(.+))?$/i.test(lower)) {
    const m = command.match(/^test\s+webhook(?:\s+(.+))?$/i);
    return { type: 'WEBHOOK_TEST', query: m?.[1]?.trim() || '' };
  }

  if (/^(?:delete|remove)\s+webhook(?:\s+(.+))?$/i.test(lower)) {
    const m = command.match(/^(?:delete|remove)\s+webhook(?:\s+(.+))?$/i);
    return { type: 'WEBHOOK_DELETE', query: m?.[1]?.trim() || '' };
  }

  // 6. Organizations & Workspaces
  if (/^(?:create|new|add)\s+(?:an?\s+)?organization\b/i.test(lower)) {
    const name = command.replace(/^(?:create|new|add)\s+(?:an?\s+)?organization\s*(?:called|named|name)?\s*/i, '').trim();
    return { type: 'ORG_CREATE', name };
  }

  if (/^(?:switch|change)\s+organization\b/i.test(lower)) {
    const name = command.replace(/^(?:switch|change)\s+organization\s*(?:to)?\s*/i, '').trim();
    return { type: 'ORG_SWITCH', name };
  }

  if (/^(?:create|new|add)\s+(?:a\s+)?workspace\b/i.test(lower)) {
    const name = command.replace(/^(?:create|new|add)\s+(?:a\s+)?workspace\s*(?:called|named|name)?\s*/i, '').trim();
    return { type: 'WORKSPACE_CREATE', name };
  }

  if (/^(?:switch|change)\s+workspace\b/i.test(lower)) {
    const name = command.replace(/^(?:switch|change)\s+workspace\s*(?:to)?\s*/i, '').trim();
    return { type: 'WORKSPACE_SWITCH', name };
  }

  // 7. Notifications & Reminders
  if (/\b(?:check reminders|run reminders|trigger reminders)\b/i.test(lower)) {
    return { type: 'REMINDERS_RUN' };
  }

  if (/\b(?:mark all notifications read|clear notifications|read all notifications)\b/i.test(lower)) {
    return { type: 'NOTIFICATIONS_READ_ALL' };
  }

  if (/\b(?:show notifications|read notifications|check notifications|any notifications|notifications)\b/i.test(lower)) {
    return { type: 'NOTIFICATIONS_READ' };
  }

  // 8. Copilot & Sidebar toggles
  if (/\b(?:close|hide)\s+(?:ai\s+)?copilot\b/i.test(lower)) {
    return { type: 'COPILOT_SET', open: false };
  }
  if (/\b(?:open|show)\s+(?:ai\s+)?copilot\b/i.test(lower)) {
    return { type: 'COPILOT_SET', open: true };
  }
  if (/\b(?:close|hide)\s+(?:menu|sidebar)\b/i.test(lower)) {
    return { type: 'SIDEBAR_SET', open: false };
  }
  if (/\b(?:open|show)\s+(?:menu|sidebar)\b/i.test(lower)) {
    return { type: 'SIDEBAR_SET', open: true };
  }

  // 9. View navigation (all views, including natural phrases)
  const navClean = lower
    .replace(/^(?:open|go to|show me|show|navigate to|switch to|take me to|let's check|lets check|check|view)\s+(?:the\s+)?/i, '')
    .trim();

  for (const item of VIEW_ALIASES) {
    if (item.patterns.some((p) => navClean === p || lower === p)) {
      return { type: 'NAVIGATE', view: item.view, label: item.label };
    }
  }

  // 10. Refresh & Sign Out
  if (/^(?:refresh|sync|reload|sync tasks)$/i.test(lower)) {
    return { type: 'APP_REFRESH' };
  }
  if (/^(?:sign out|log out|logout)$/i.test(lower)) {
    return { type: 'APP_LOGOUT' };
  }

  // 11. Unclear short/ambiguous input vs Natural language AI chat
  const wordCount = command.split(/\s+/).filter(Boolean).length;
  const looksLikeQuestionOrRequest = /\?$|\b(?:what|when|where|who|why|how|which|tell|show|give|summarize|explain|help|suggest|recommend|list|check|do i|are there|is there)\b/i.test(lower);
  if (wordCount < 3 && !looksLikeQuestionOrRequest) {
    return { type: 'UNCLEAR', raw: command };
  }

  return { type: 'AI_CHAT', message: command };
};

const findBestTaskMatch = (tasks = [], query = '') => {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;
  const q = query.trim().toLowerCase();
  if (!q) return tasks[0];
  return (
    tasks.find((t) => t.title?.toLowerCase() === q) ||
    tasks.find((t) => t.title?.toLowerCase().includes(q)) ||
    tasks.find((t) => q.split(/\s+/).every((word) => t.title?.toLowerCase().includes(word))) ||
    null
  );
};

const findBestNamedItem = (items = [], name = '') => {
  if (!Array.isArray(items) || items.length === 0 || !name) return null;
  const q = name.trim().toLowerCase();
  return (
    items.find((item) => item.name?.toLowerCase() === q) ||
    items.find((item) => item.name?.toLowerCase().includes(q)) ||
    null
  );
};

const findBestSubtask = (subtasks = [], query = '') => {
  if (!Array.isArray(subtasks) || subtasks.length === 0) return null;
  const q = String(query || '').trim().toLowerCase();
  if (!q) return subtasks[0];
  return (
    subtasks.find((s) => s.title?.toLowerCase() === q) ||
    subtasks.find((s) => s.title?.toLowerCase().includes(q)) ||
    null
  );
};

const findBestMember = (members = [], query = '') => {
  if (!Array.isArray(members) || members.length === 0 || !query) return null;
  const q = query.trim().toLowerCase();
  return (
    members.find((m) => m.user?.email?.toLowerCase() === q || m.user?.name?.toLowerCase() === q) ||
    members.find((m) => m.user?.name?.toLowerCase().includes(q) || m.user?.email?.toLowerCase().includes(q)) ||
    null
  );
};

const resolveOrgWebhook = async (orgId, query = '') => {
  const res = await api.get(`/organizations/${orgId}/webhooks`);
  const hooks = res.data?.webhooks || [];
  if (hooks.length === 0) return null;
  const q = String(query || '').trim().toLowerCase();
  if (!q) return hooks[0];
  return hooks.find((h) => h.url?.toLowerCase().includes(q) || h._id?.toLowerCase() === q) || null;
};

const parseTaskViaServerOrLocal = async (prompt) => {
  try {
    const res = await api.post('/v1/ai/parse', { prompt });
    if (res.data?.success && res.data.draft?.title) {
      const cleanedTitle = res.data.draft.title
        .replace(/^(?:called|named|name|titled)\s+/i, '')
        .trim();
      return {
        ...res.data.draft,
        title: cleanedTitle || parseTaskPromptLocal(prompt).title
      };
    }
  } catch {
    // Fall back to local parser when offline or if parse endpoint fails
  }
  return parseTaskPromptLocal(prompt);
};

const resolveTaskReference = async (query, lastTask, extraParams = {}) => {
  const clean = String(query || '').trim();
  if (PRONOUN_TASK_REGEX.test(clean) && lastTask?._id) {
    return lastTask;
  }
  const res = await api.get('/tasks', { params: { search: clean || undefined, limit: 25, ...extraParams } });
  const tasks = res.data?.tasks || [];
  let match = findBestTaskMatch(tasks, clean);
  if (!match && clean) {
    const allRes = await api.get('/tasks', { params: { limit: 50, ...extraParams } });
    match = findBestTaskMatch(allRes.data?.tasks || [], clean);
  }
  return match;
};

const askForClarification = async (actionType, questionLead) => {
  try {
    const res = await api.get('/tasks', { params: { limit: 3 } });
    const openTasks = (res.data?.tasks || []).filter((t) => t.status !== 'completed');
    if (openTasks.length > 0) {
      const names = openTasks.slice(0, 3).map((t) => t.title).join(', ');
      return {
        speech: `${questionLead} Your pending tasks are: ${names}.`,
        toastType: 'info',
        pendingAction: actionType,
        keepListening: true
      };
    }
  } catch {
    // ignore
  }
  return {
    speech: questionLead,
    toastType: 'info',
    pendingAction: actionType,
    keepListening: true
  };
};

const getTimeGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

/**
 * Executes a parsed voice intent against the app state and backend APIs,
 * returning { speech, toastType, keepListening, pendingAction, lastTask }.
 */
export const executeVoiceIntent = async (intent, ctx) => {
  const {
    user,
    lastTask = null,
    setLastTask,
    navigateToView,
    openCreateModal,
    openEditModal,
    openCreateOrgModal,
    setAiCopilotOpen,
    setMobileSidebarOpen,
    refreshData,
    syncOffline,
    organizations = [],
    workspaces = [],
    currentOrg,
    fetchOrganizations,
    switchOrganization,
    switchWorkspace,
    fetchWorkspaces,
    logout,
    openVoiceHelp,
    stopVoice
  } = ctx;

  switch (intent.type) {
    case 'EMPTY':
      return { speech: "I'm listening. What would you like me to do?", keepListening: true };

    case 'SMALL_TALK_GREETING': {
      const firstName = user?.name ? `, ${user.name.split(' ')[0]}` : '';
      return {
        speech: `${getTimeGreeting()}${firstName}! I'm ready to help with your tasks. What would you like to do?`,
        toastType: 'info',
        keepListening: true
      };
    }

    case 'SMALL_TALK_HOW_ARE_YOU':
      return {
        speech: "I'm doing great and ready to keep your day organized! How can I help you?",
        toastType: 'info',
        keepListening: true
      };

    case 'SMALL_TALK_IDENTITY':
      return {
        speech: "I'm TaskFlow, your personal voice assistant. Tell me to schedule tasks, check your day, or open any screen.",
        toastType: 'info',
        keepListening: true
      };

    case 'SMALL_TALK_THANKS':
      return {
        speech: "You're welcome! Just say Task Flow whenever you need me.",
        toastType: 'info',
        keepListening: false
      };

    case 'VOICE_STOP':
      await stopVoice?.();
      return { speech: 'Okay, pausing voice assistant.', toastType: 'info', keepListening: false };

    case 'VOICE_HELP':
      openVoiceHelp?.();
      return {
        speech: 'Just talk naturally! For example, say I need to finish Python tomorrow, I finished Python, what do I have today, or open settings.',
        toastType: 'info'
      };

    case 'OPEN_CREATE_TASK_MODAL':
      openCreateModal?.();
      return { speech: 'Sure, opening the create task form for you.', toastType: 'info' };

    case 'OPEN_SCHEDULER':
      navigateToView?.('ai');
      return { speech: 'Sure, opening the task scheduler.', toastType: 'info' };

    case 'TASK_CREATE':
    case 'TASK_SCHEDULE': {
      const draft = await parseTaskViaServerOrLocal(intent.prompt);
      const payload = {
        title: draft.title,
        description: draft.description,
        priority: draft.priority || 'medium',
        category: draft.category || 'General',
        dueDate: draft.dueDate || undefined,
        dueDateString: draft.dueDateString || undefined,
        recurrence: draft.recurrence
      };
      const res = await api.post('/tasks', payload);
      const created = res.data?.task || payload;
      if (created?._id || created?.title) {
        setLastTask?.(created);
      }
      refreshData?.();

      const isSchedule = intent.type === 'TASK_SCHEDULE';
      const humanDate = created.dueDateString ? formatHumanDate(created.dueDateString) : '';
      const datePhrase = humanDate ? (humanDate.startsWith('on ') ? ` ${humanDate}` : ` for ${humanDate}`) : '';
      const speech = isSchedule
        ? `All set! I've scheduled ${created.title}${datePhrase}.`
        : `Got it! I've created the task ${created.title}${datePhrase}.`;
      return { speech, toastType: 'success', lastTask: created };
    }

    case 'AI_BREAKDOWN': {
      const res = await api.post('/v1/ai/breakdown', { goal: intent.goal, autoCreate: true });
      refreshData?.();
      const count = res.data?.tasks?.length || res.data?.milestones?.length || 0;
      return {
        speech: count > 0
          ? `Done! I've created ${count} milestones for ${intent.goal}.`
          : `I've put together a breakdown for ${intent.goal}.`,
        toastType: 'success'
      };
    }

    case 'AI_OPTIMIZE': {
      const res = await api.post('/v1/ai/optimize', { apply: true });
      refreshData?.();
      const count = res.data?.appliedCount || 0;
      return {
        speech: count > 0
          ? `All done! I optimized your schedule and updated ${count} ${count === 1 ? 'task' : 'tasks'}.`
          : 'Your schedule already looks well balanced!',
        toastType: 'success'
      };
    }

    case 'AI_PLAN_DAY': {
      const res = await api.post('/v1/ai/optimize', { apply: false });
      const m = res.data?.analysis?.metrics;
      navigateToView?.('today');
      if (m) {
        return {
          speech: `Here is your day. You have ${m.dueTodayCount} due today, ${m.overdueCount} overdue, and ${m.highPriorityCount} high priority tasks.`,
          toastType: 'info'
        };
      }
      return { speech: 'Opened My Day for you.', toastType: 'info' };
    }

    case 'TASK_COMPLETE': {
      if (!intent.query) {
        return askForClarification('TASK_COMPLETE', 'Sure, which task did you finish?');
      }
      const match = await resolveTaskReference(intent.query, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task called ${intent.query}.`, toastType: 'error' };
      }
      if (match.status === 'completed') {
        return { speech: `${match.title} is already marked as completed.`, toastType: 'info', lastTask: match };
      }
      await api.patch(`/tasks/${match._id}/toggle`);
      setLastTask?.(match);
      refreshData?.();
      return { speech: `Nice job! I've marked ${match.title} as completed.`, toastType: 'success', lastTask: match };
    }

    case 'TASK_REOPEN': {
      if (!intent.query) {
        return { speech: 'Which completed task would you like me to reopen?', toastType: 'info', pendingAction: 'TASK_REOPEN', keepListening: true };
      }
      const match = await resolveTaskReference(intent.query, lastTask, { status: 'completed' });
      if (!match) {
        return { speech: `I couldn't find a completed task matching ${intent.query}.`, toastType: 'error' };
      }
      await api.patch(`/tasks/${match._id}/toggle`);
      setLastTask?.(match);
      refreshData?.();
      return { speech: `Okay, I've reopened ${match.title}.`, toastType: 'success', lastTask: match };
    }

    case 'TASK_IN_PROGRESS': {
      if (!intent.query) {
        return askForClarification('TASK_IN_PROGRESS', 'Which task would you like to start?');
      }
      const match = await resolveTaskReference(intent.query, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.query}.`, toastType: 'error' };
      }
      await api.patch(`/tasks/${match._id}/status`, { status: 'in_progress' });
      setLastTask?.(match);
      refreshData?.();
      return { speech: `Got it! I moved ${match.title} to in progress.`, toastType: 'success', lastTask: match };
    }

    case 'TASK_EDIT': {
      if (!intent.query) {
        return askForClarification('TASK_EDIT', 'Which task would you like to edit?');
      }
      const match = await resolveTaskReference(intent.query, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.query}.`, toastType: 'error' };
      }
      setLastTask?.(match);
      openEditModal?.(match);
      return { speech: `Opening ${match.title} so you can edit it.`, toastType: 'info', lastTask: match };
    }

    case 'TASK_SET_PRIORITY': {
      const match = await resolveTaskReference(intent.query, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.query}.`, toastType: 'error' };
      }
      await api.put(`/tasks/${match._id}`, { priority: intent.priority });
      setLastTask?.(match);
      refreshData?.();
      return { speech: `Sure! I changed ${match.title} to ${intent.priority} priority.`, toastType: 'success', lastTask: match };
    }

    case 'TASK_DELETE': {
      if (!intent.query) {
        return askForClarification('TASK_DELETE', 'Which task should I move to the trash?');
      }
      const match = await resolveTaskReference(intent.query, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.query}.`, toastType: 'error' };
      }
      await api.delete(`/tasks/${match._id}`);
      setLastTask?.(match);
      refreshData?.();
      return { speech: `Okay, I've moved ${match.title} to the trash.`, toastType: 'success', lastTask: match };
    }

    case 'TASK_RESTORE': {
      const res = await api.get('/tasks/trash', { params: { limit: 50 } });
      const match = findBestTaskMatch(res.data?.tasks || [], intent.query);
      if (!match) {
        return { speech: `I couldn't find a deleted task matching ${intent.query || 'your request'}.`, toastType: 'error' };
      }
      await api.patch(`/tasks/${match._id}/restore`);
      setLastTask?.(match);
      refreshData?.();
      return { speech: `Done! I've restored ${match.title}.`, toastType: 'success', lastTask: match };
    }

    case 'TRASH_EMPTY': {
      await api.delete('/tasks/trash/empty');
      refreshData?.();
      return { speech: 'Your trash is now empty.', toastType: 'success' };
    }

    case 'TASK_EXPORT': {
      const res = await api.get(`/tasks/export?format=${intent.format}`, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', `taskflow-tasks.${intent.format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      return { speech: `I've exported your tasks as ${intent.format.toUpperCase()}.`, toastType: 'success' };
    }

    case 'SUBTASK_ADD': {
      const match = await resolveTaskReference(intent.taskQuery, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.taskQuery}.`, toastType: 'error' };
      }
      await api.post(`/tasks/${match._id}/subtasks`, { title: intent.subtaskTitle });
      setLastTask?.(match);
      refreshData?.();
      return { speech: `Added subtask ${intent.subtaskTitle} to ${match.title}.`, toastType: 'success', lastTask: match };
    }

    case 'SUBTASK_COMPLETE': {
      const match = await resolveTaskReference(intent.taskQuery, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.taskQuery}.`, toastType: 'error' };
      }
      const taskRes = await api.get(`/tasks/${match._id}`);
      const fullTask = taskRes.data?.task || match;
      const sub = findBestSubtask(fullTask.subtasks, intent.subtaskQuery);
      if (!sub) {
        return { speech: `I couldn't find a subtask matching ${intent.subtaskQuery} on ${fullTask.title}.`, toastType: 'error' };
      }
      await api.patch(`/tasks/${fullTask._id}/subtasks/${sub._id}`, { isCompleted: !sub.isCompleted });
      setLastTask?.(fullTask);
      refreshData?.();
      return {
        speech: `Marked subtask ${sub.title} as ${sub.isCompleted ? 'incomplete' : 'completed'} on ${fullTask.title}.`,
        toastType: 'success',
        lastTask: fullTask
      };
    }

    case 'SUBTASK_DELETE': {
      const match = await resolveTaskReference(intent.taskQuery, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.taskQuery}.`, toastType: 'error' };
      }
      const taskRes = await api.get(`/tasks/${match._id}`);
      const fullTask = taskRes.data?.task || match;
      const sub = findBestSubtask(fullTask.subtasks, intent.subtaskQuery);
      if (!sub) {
        return { speech: `I couldn't find a subtask matching ${intent.subtaskQuery} on ${fullTask.title}.`, toastType: 'error' };
      }
      await api.delete(`/tasks/${fullTask._id}/subtasks/${sub._id}`);
      setLastTask?.(fullTask);
      refreshData?.();
      return { speech: `Removed subtask ${sub.title} from ${fullTask.title}.`, toastType: 'success', lastTask: fullTask };
    }

    case 'COMMENT_ADD': {
      const match = await resolveTaskReference(intent.taskQuery, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.taskQuery}.`, toastType: 'error' };
      }
      await api.post(`/tasks/${match._id}/comments`, { content: intent.content });
      setLastTask?.(match);
      refreshData?.();
      return { speech: `Added your comment to ${match.title}.`, toastType: 'success', lastTask: match };
    }

    case 'COMMENT_READ': {
      const match = await resolveTaskReference(intent.taskQuery, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.taskQuery}.`, toastType: 'error' };
      }
      const taskRes = await api.get(`/tasks/${match._id}`);
      const comments = taskRes.data?.task?.comments || [];
      setLastTask?.(match);
      if (comments.length === 0) {
        return { speech: `${match.title} has no comments yet.`, toastType: 'info', lastTask: match };
      }
      const latest = comments[comments.length - 1];
      return {
        speech: `${match.title} has ${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}. Latest: ${latest.content}.`,
        toastType: 'info',
        lastTask: match
      };
    }

    case 'TASK_RESCHEDULE': {
      const match = await resolveTaskReference(intent.query, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.query}.`, toastType: 'error' };
      }
      const draft = await parseTaskViaServerOrLocal(`schedule task ${intent.dateText}`);
      if (!draft.dueDate && !draft.dueDateString) {
        return { speech: `I couldn't tell what date "${intent.dateText}" is. Try saying tomorrow, today, or next Monday.`, toastType: 'error' };
      }
      await api.put(`/tasks/${match._id}`, {
        dueDate: draft.dueDate || undefined,
        dueDateString: draft.dueDateString || undefined
      });
      setLastTask?.(match);
      refreshData?.();
      const human = draft.dueDateString ? formatHumanDate(draft.dueDateString) : intent.dateText;
      return { speech: `Rescheduled ${match.title} to ${human}.`, toastType: 'success', lastTask: match };
    }

    case 'TASK_RENAME': {
      const match = await resolveTaskReference(intent.query, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.query}.`, toastType: 'error' };
      }
      const updatedTitle = intent.newTitle.charAt(0).toUpperCase() + intent.newTitle.slice(1);
      await api.put(`/tasks/${match._id}`, { title: updatedTitle });
      const updated = { ...match, title: updatedTitle };
      setLastTask?.(updated);
      refreshData?.();
      return { speech: `Renamed ${match.title} to ${updatedTitle}.`, toastType: 'success', lastTask: updated };
    }

    case 'TASK_SET_CATEGORY': {
      const match = await resolveTaskReference(intent.query, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.query}.`, toastType: 'error' };
      }
      const cat = intent.category.charAt(0).toUpperCase() + intent.category.slice(1);
      await api.put(`/tasks/${match._id}`, { category: cat });
      setLastTask?.(match);
      refreshData?.();
      return { speech: `Updated category of ${match.title} to ${cat}.`, toastType: 'success', lastTask: match };
    }

    case 'TASK_ASSIGN': {
      const match = await resolveTaskReference(intent.query, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.query}.`, toastType: 'error' };
      }
      if (!currentOrg?._id) {
        return { speech: 'Please select an organization first to assign tasks.', toastType: 'error' };
      }
      const memRes = await api.get(`/organizations/${currentOrg._id}/members`);
      const member = findBestMember(memRes.data?.members || [], intent.assigneeQuery);
      if (!member?.user?._id) {
        return { speech: `I couldn't find a team member matching ${intent.assigneeQuery}.`, toastType: 'error' };
      }
      await api.put(`/tasks/${match._id}`, { assignedTo: member.user._id });
      setLastTask?.(match);
      refreshData?.();
      return { speech: `Assigned ${match.title} to ${member.user.name || member.user.email}.`, toastType: 'success', lastTask: match };
    }

    case 'TASK_MOVE_STATUS': {
      const match = await resolveTaskReference(intent.query, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.query}.`, toastType: 'error' };
      }
      await api.patch(`/tasks/${match._id}/status`, { status: intent.status });
      setLastTask?.(match);
      refreshData?.();
      return { speech: `Moved ${match.title} to ${intent.status.replace(/[_-]/g, ' ')}.`, toastType: 'success', lastTask: match };
    }

    case 'TASK_DETAILS': {
      const match = await resolveTaskReference(intent.query, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.query}.`, toastType: 'error' };
      }
      const res = await api.get(`/tasks/${match._id}`);
      const t = res.data?.task || match;
      setLastTask?.(t);
      const due = t.dueDateString ? `, due ${formatHumanDate(t.dueDateString)}` : '';
      const subCount = t.subtasks?.length || 0;
      const subPart = subCount > 0 ? `, with ${subCount} subtasks` : '';
      return {
        speech: `${t.title} is ${(t.status || 'pending').replace(/[_-]/g, ' ')} with ${t.priority || 'medium'} priority${due}${subPart}.`,
        toastType: 'info',
        lastTask: t
      };
    }

    case 'TASK_ACTIVITY': {
      const match = await resolveTaskReference(intent.query, lastTask);
      if (!match) {
        return { speech: `Sorry, I couldn't find a task matching ${intent.query}.`, toastType: 'error' };
      }
      const res = await api.get(`/tasks/${match._id}/activity`);
      const logs = res.data?.activities || res.data?.logs || [];
      setLastTask?.(match);
      if (logs.length === 0) {
        return { speech: `There is no recent activity recorded for ${match.title}.`, toastType: 'info', lastTask: match };
      }
      const latest = logs[0];
      return {
        speech: `${match.title} has ${logs.length} activity entries. Most recent: ${latest.action || latest.description || 'updated'}.`,
        toastType: 'info',
        lastTask: match
      };
    }

    case 'TASK_BULK': {
      const params = intent.scope === 'overdue'
        ? { view: 'overdue', limit: 100 }
        : intent.scope === 'completed'
          ? { status: 'completed', limit: 100 }
          : intent.scope === 'today'
            ? { view: 'today', limit: 100 }
            : { status: 'pending', limit: 100 };
      const listRes = await api.get('/tasks', { params });
      const taskIds = (listRes.data?.tasks || []).map((t) => t._id);
      if (taskIds.length === 0) {
        return { speech: `You have no ${intent.scope} tasks right now.`, toastType: 'info' };
      }
      const bulkBody = intent.action === 'delete'
        ? { taskIds, operation: 'delete' }
        : { taskIds, operation: 'status', payload: 'completed' };
      await api.post('/tasks/bulk', bulkBody);
      refreshData?.();
      return {
        speech: `${intent.action === 'delete' ? 'Deleted' : 'Completed'} ${taskIds.length} ${intent.scope} ${taskIds.length === 1 ? 'task' : 'tasks'}.`,
        toastType: 'success'
      };
    }

    case 'TASK_PERMANENT_DELETE': {
      const res = await api.get('/tasks/trash', { params: { limit: 50 } });
      const match = findBestTaskMatch(res.data?.tasks || [], intent.query);
      if (!match) {
        return { speech: `I couldn't find a deleted task matching ${intent.query || 'that'} in the trash.`, toastType: 'error' };
      }
      await api.delete(`/tasks/${match._id}/permanent`);
      refreshData?.();
      return { speech: `Permanently deleted ${match.title}.`, toastType: 'success' };
    }

    case 'STATS_SUMMARY': {
      const res = await api.get('/tasks/stats');
      const s = res.data?.stats || {};
      return {
        speech: `Right now you have ${s.total ?? 0} tasks in total: ${s.pending ?? 0} pending, ${s.dueToday ?? 0} due today, ${s.overdue ?? 0} overdue, and ${s.completed ?? 0} completed.`,
        toastType: 'info'
      };
    }

    case 'QUERY_OVERDUE': {
      const res = await api.get('/tasks', { params: { view: 'overdue', limit: 10 } });
      const tasks = res.data?.tasks || [];
      if (tasks.length === 0) {
        return { speech: "Good news! You're completely caught up with no overdue tasks.", toastType: 'success' };
      }
      const names = tasks.slice(0, 3).map((t) => t.title).join(', ');
      return {
        speech: `You have ${tasks.length} overdue ${tasks.length === 1 ? 'task' : 'tasks'}, including ${names}.`,
        toastType: 'info'
      };
    }

    case 'QUERY_TODAY': {
      navigateToView?.('today');
      const res = await api.get('/tasks', { params: { view: 'today', limit: 10 } });
      const tasks = res.data?.tasks || [];
      if (tasks.length === 0) {
        return { speech: "Your schedule is clear today! You have no tasks due today.", toastType: 'info' };
      }
      const names = tasks.slice(0, 3).map((t) => t.title).join(', ');
      return {
        speech: `Today you have ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}: ${names}.`,
        toastType: 'info'
      };
    }

    case 'QUERY_UPCOMING': {
      navigateToView?.('upcoming');
      const res = await api.get('/tasks', { params: { view: 'upcoming', sortBy: 'dueDate', sortOrder: 'asc', limit: 10 } });
      const tasks = res.data?.tasks || [];
      if (tasks.length === 0) {
        return { speech: 'You have no upcoming scheduled tasks.', toastType: 'info' };
      }
      const names = tasks.slice(0, 3).map((t) => t.title).join(', ');
      return {
        speech: `You have ${tasks.length} upcoming ${tasks.length === 1 ? 'task' : 'tasks'}, starting with ${names}.`,
        toastType: 'info'
      };
    }

    case 'QUERY_COMPLETED': {
      navigateToView?.('completed');
      const res = await api.get('/tasks', { params: { status: 'completed', sortBy: 'updatedAt', sortOrder: 'desc', limit: 10 } });
      const tasks = res.data?.tasks || [];
      if (tasks.length === 0) {
        return { speech: 'You have no completed tasks yet.', toastType: 'info' };
      }
      const names = tasks.slice(0, 3).map((t) => t.title).join(', ');
      return {
        speech: `You've completed ${tasks.length} recent ${tasks.length === 1 ? 'task' : 'tasks'}, including ${names}.`,
        toastType: 'info'
      };
    }

    case 'CATEGORIES_LIST': {
      const res = await api.get('/categories');
      const cats = res.data?.categories || [];
      if (cats.length === 0) {
        return { speech: 'No custom categories found yet.', toastType: 'info' };
      }
      const names = cats.slice(0, 6).map((c) => c.name || c).join(', ');
      return { speech: `Your categories are: ${names}.`, toastType: 'info' };
    }

    case 'ORGS_LIST': {
      if (!organizations.length) {
        return { speech: 'You have no organizations yet.', toastType: 'info' };
      }
      const names = organizations.map((o) => o.name).join(', ');
      return { speech: `Your organizations are: ${names}.`, toastType: 'info' };
    }

    case 'WORKSPACES_LIST': {
      if (!workspaces.length) {
        return { speech: 'You have no workspaces in this organization yet.', toastType: 'info' };
      }
      const names = workspaces.map((w) => w.name).join(', ');
      return { speech: `Your workspaces are: ${names}.`, toastType: 'info' };
    }

    case 'TEAM_MEMBERS_LIST': {
      if (!currentOrg?._id) {
        return { speech: 'No active organization selected.', toastType: 'error' };
      }
      navigateToView?.('team');
      const res = await api.get(`/organizations/${currentOrg._id}/members`);
      const members = res.data?.members || [];
      if (members.length === 0) {
        return { speech: 'There are no members in this organization yet.', toastType: 'info' };
      }
      const names = members.slice(0, 5).map((m) => m.user?.name || m.user?.email).join(', ');
      return { speech: `Your team has ${members.length} ${members.length === 1 ? 'member' : 'members'}: ${names}.`, toastType: 'info' };
    }

    case 'TEAMS_LIST': {
      navigateToView?.('team');
      const res = await api.get('/teams');
      const teams = res.data?.teams || [];
      if (teams.length === 0) {
        return { speech: 'You have no teams created yet.', toastType: 'info' };
      }
      const names = teams.map((t) => t.name).join(', ');
      return { speech: `Your teams are: ${names}.`, toastType: 'info' };
    }

    case 'TEAM_CREATE': {
      if (!intent.name) {
        return { speech: 'What would you like to name the team?', toastType: 'info', keepListening: true };
      }
      await api.post('/teams', { name: intent.name });
      refreshData?.();
      return { speech: `Created team ${intent.name}.`, toastType: 'success' };
    }

    case 'TEAM_DELETE': {
      const res = await api.get('/teams');
      const team = findBestNamedItem(res.data?.teams || [], intent.name);
      if (!team) {
        return { speech: `I couldn't find a team named ${intent.name}.`, toastType: 'error' };
      }
      await api.delete(`/teams/${team._id}`);
      refreshData?.();
      return { speech: `Deleted team ${team.name}.`, toastType: 'success' };
    }

    case 'MEMBER_INVITE': {
      if (!currentOrg?._id) {
        return { speech: 'No active organization selected.', toastType: 'error' };
      }
      await api.post(`/organizations/${currentOrg._id}/invitations`, { email: intent.email, role: intent.role });
      refreshData?.();
      return { speech: `Sent an invitation to ${intent.email} as ${intent.role}.`, toastType: 'success' };
    }

    case 'MEMBER_ROLE_UPDATE': {
      if (!currentOrg?._id) {
        return { speech: 'No active organization selected.', toastType: 'error' };
      }
      const memRes = await api.get(`/organizations/${currentOrg._id}/members`);
      const member = findBestMember(memRes.data?.members || [], intent.memberQuery);
      if (!member?.user?._id) {
        return { speech: `I couldn't find a member matching ${intent.memberQuery}.`, toastType: 'error' };
      }
      await api.patch(`/organizations/${currentOrg._id}/members/${member.user._id}`, { role: intent.role });
      refreshData?.();
      return { speech: `Updated ${member.user.name || member.user.email}'s role to ${intent.role}.`, toastType: 'success' };
    }

    case 'MEMBER_REMOVE': {
      if (!currentOrg?._id) {
        return { speech: 'No active organization selected.', toastType: 'error' };
      }
      const memRes = await api.get(`/organizations/${currentOrg._id}/members`);
      const member = findBestMember(memRes.data?.members || [], intent.memberQuery);
      if (!member?.user?._id) {
        return { speech: `I couldn't find a member matching ${intent.memberQuery}.`, toastType: 'error' };
      }
      await api.delete(`/organizations/${currentOrg._id}/members/${member.user._id}`);
      refreshData?.();
      return { speech: `Removed ${member.user.name || member.user.email} from the organization.`, toastType: 'success' };
    }

    case 'BILLING_STATUS': {
      navigateToView?.('billing');
      const res = await api.get('/billing/status');
      const sub = res.data?.subscription || res.data || {};
      const plan = sub.planName || sub.plan || 'Free';
      const status = sub.status || 'active';
      return { speech: `You are currently on the ${plan} plan (${status}).`, toastType: 'info' };
    }

    case 'BILLING_PLANS': {
      navigateToView?.('billing');
      const res = await api.get('/billing/plans');
      const plans = res.data?.plans || [];
      if (plans.length === 0) {
        return { speech: 'Opened billing plans.', toastType: 'info' };
      }
      const names = plans.map((p) => p.name || p.id).join(', ');
      return { speech: `Available plans are: ${names}.`, toastType: 'info' };
    }

    case 'BILLING_CANCEL': {
      await api.post('/billing/cancel');
      refreshData?.();
      return { speech: 'Your subscription has been scheduled for cancellation.', toastType: 'success' };
    }

    case 'BILLING_RESUME': {
      await api.post('/billing/resume');
      refreshData?.();
      return { speech: 'Your subscription has been resumed.', toastType: 'success' };
    }

    case 'BILLING_UPGRADE': {
      navigateToView?.('billing');
      return {
        speech: intent.plan
          ? `Opened Billing and Plans so you can complete upgrading to ${intent.plan}.`
          : 'Opened Billing and Plans so you can choose a plan to upgrade.',
        toastType: 'info'
      };
    }

    case 'SESSIONS_LIST': {
      navigateToView?.('settings');
      const res = await api.get('/auth/sessions');
      const sessions = res.data?.sessions || [];
      return {
        speech: `You currently have ${sessions.length} active ${sessions.length === 1 ? 'session' : 'sessions'}.`,
        toastType: 'info'
      };
    }

    case 'LOGOUT_ALL': {
      await api.post('/auth/logout-all');
      await stopVoice?.();
      await logout?.();
      return { speech: 'Signed out of all devices.', toastType: 'success', keepListening: false };
    }

    case 'WEBHOOKS_LIST': {
      if (!currentOrg?._id) {
        return { speech: 'No active organization selected.', toastType: 'error' };
      }
      navigateToView?.('settings');
      const res = await api.get(`/organizations/${currentOrg._id}/webhooks`);
      const hooks = res.data?.webhooks || [];
      return {
        speech: hooks.length === 0
          ? 'You have no webhooks configured.'
          : `You have ${hooks.length} ${hooks.length === 1 ? 'webhook' : 'webhooks'} configured.`,
        toastType: 'info'
      };
    }

    case 'WEBHOOK_CREATE': {
      if (!currentOrg?._id) {
        return { speech: 'No active organization selected.', toastType: 'error' };
      }
      await api.post(`/organizations/${currentOrg._id}/webhooks`, { url: intent.url, events: ['task.created', 'task.completed'] });
      refreshData?.();
      return { speech: `Created webhook for ${intent.url}.`, toastType: 'success' };
    }

    case 'WEBHOOK_TEST': {
      if (!currentOrg?._id) {
        return { speech: 'No active organization selected.', toastType: 'error' };
      }
      const hook = await resolveOrgWebhook(currentOrg._id, intent.query);
      if (!hook) {
        return { speech: 'No matching webhook found to test.', toastType: 'error' };
      }
      await api.post(`/organizations/${currentOrg._id}/webhooks/${hook._id}/test`);
      return { speech: `Sent a test payload to webhook ${hook.url}.`, toastType: 'success' };
    }

    case 'WEBHOOK_DELETE': {
      if (!currentOrg?._id) {
        return { speech: 'No active organization selected.', toastType: 'error' };
      }
      const hook = await resolveOrgWebhook(currentOrg._id, intent.query);
      if (!hook) {
        return { speech: 'No matching webhook found to delete.', toastType: 'error' };
      }
      await api.delete(`/organizations/${currentOrg._id}/webhooks/${hook._id}`);
      refreshData?.();
      return { speech: `Deleted webhook ${hook.url}.`, toastType: 'success' };
    }

    case 'TASK_SEARCH': {
      if (!intent.query) {
        navigateToView?.('all');
        return { speech: 'Here are all your tasks.', toastType: 'info' };
      }
      const res = await api.get('/tasks', { params: { search: intent.query, limit: 10 } });
      const tasks = res.data?.tasks || [];
      navigateToView?.('all');
      if (tasks.length === 0) {
        return { speech: `I didn't find any tasks matching ${intent.query}.`, toastType: 'info' };
      }
      const names = tasks.slice(0, 3).map((t) => t.title).join(', ');
      return {
        speech: `I found ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} matching ${intent.query}: ${names}.`,
        toastType: 'info'
      };
    }

    case 'ORG_CREATE': {
      if (!intent.name) {
        openCreateOrgModal?.();
        return { speech: 'Sure, opening the create organization form.', toastType: 'info' };
      }
      const res = await api.post('/organizations', { name: intent.name });
      const org = res.data?.organization;
      await fetchOrganizations?.();
      if (org?._id) {
        await switchOrganization?.(org._id);
        window.dispatchEvent(new Event('org:changed'));
      }
      refreshData?.();
      return { speech: `Done! I created the organization ${intent.name} and switched to it.`, toastType: 'success' };
    }

    case 'ORG_SWITCH': {
      const target = findBestNamedItem(organizations, intent.name);
      if (!target) {
        return { speech: `Sorry, I couldn't find an organization named ${intent.name || 'that'}.`, toastType: 'error' };
      }
      await switchOrganization?.(target._id);
      refreshData?.();
      return { speech: `Switched over to ${target.name}.`, toastType: 'success' };
    }

    case 'WORKSPACE_CREATE': {
      if (!intent.name) {
        return { speech: 'What would you like to name the new workspace?', toastType: 'info', pendingAction: 'WORKSPACE_CREATE', keepListening: true };
      }
      const res = await api.post('/workspaces', { name: intent.name });
      await fetchWorkspaces?.(currentOrg?._id);
      if (res.data?.workspace?._id) {
        switchWorkspace?.(res.data.workspace._id);
      }
      refreshData?.();
      return { speech: `Done! I created the workspace ${intent.name}.`, toastType: 'success' };
    }

    case 'WORKSPACE_SWITCH': {
      const target = findBestNamedItem(workspaces, intent.name);
      if (!target) {
        return { speech: `Sorry, I couldn't find a workspace named ${intent.name || 'that'}.`, toastType: 'error' };
      }
      switchWorkspace?.(target._id);
      refreshData?.();
      return { speech: `Switched to the ${target.name} workspace.`, toastType: 'success' };
    }

    case 'REMINDERS_RUN': {
      await api.post('/notifications/run-reminders');
      refreshData?.();
      return { speech: "I've checked your task reminders.", toastType: 'success' };
    }

    case 'NOTIFICATIONS_READ_ALL': {
      await api.post('/notifications/read-all');
      refreshData?.();
      return { speech: 'All caught up! I marked your notifications as read.', toastType: 'success' };
    }

    case 'NOTIFICATIONS_READ': {
      const res = await api.get('/notifications');
      const unread = res.data?.unreadCount ?? 0;
      const latest = res.data?.notifications?.[0];
      if (unread === 0) {
        return { speech: "You're all caught up with no unread notifications.", toastType: 'info' };
      }
      return {
        speech: `You have ${unread} unread ${unread === 1 ? 'notification' : 'notifications'}.${latest ? ` The latest says: ${latest.title}.` : ''}`,
        toastType: 'info'
      };
    }

    case 'COPILOT_SET':
      setAiCopilotOpen?.(intent.open);
      return { speech: intent.open ? 'Opened the AI Copilot.' : 'Closed the AI Copilot.', toastType: 'info' };

    case 'SIDEBAR_SET':
      setMobileSidebarOpen?.(intent.open);
      return { speech: intent.open ? 'Opened the menu.' : 'Closed the menu.', toastType: 'info' };

    case 'NAVIGATE':
      navigateToView?.(intent.view);
      return { speech: `Opening ${intent.label}.`, toastType: 'info' };

    case 'APP_REFRESH':
      await syncOffline?.();
      refreshData?.();
      return { speech: 'Your workspace is refreshed.', toastType: 'success' };

    case 'APP_LOGOUT':
      await stopVoice?.();
      await logout?.();
      return { speech: 'Okay, signing you out now. Goodbye!', toastType: 'info', keepListening: false };

    case 'UNCLEAR':
      return {
        speech: "I didn't quite understand that. Could you explain what you'd like me to do?",
        toastType: 'info',
        keepListening: true
      };

    case 'AI_CHAT':
    default: {
      const res = await api.post('/v1/ai/chat', { message: intent.message, source: 'voice' });
      if (['task_created', 'task_completed', 'schedule_optimized'].includes(res.data?.action)) {
        refreshData?.();
      }
      if (res.data?.task) {
        setLastTask?.(res.data.task);
      }
      return {
        speech: res.data?.reply || 'Done.',
        toastType: 'success'
      };
    }
  }
};

const CONV_CANCEL_REGEX = /^(?:cancel|stop|never\s*mind|nevermind|forget\s+it|abort|quit|exit|don't\s+create|do\s+not\s+create)$/i;
const CONV_CONFIRM_REGEX = /^(?:yes|yeah|yep|yup|sure|confirm|create\s+it|schedule\s+it|go\s+ahead|do\s+it|ok|okay|correct|please\s+do|yes\s+please|sounds\s+good)$/i;
const CONV_NO_REGEX = /^(?:no|nope|nah|skip|none|nothing|no\s+thanks|not\s+now|no\s+due\s+date|that's\s+all|thats\s+all|done|finish|review)$/i;

export const formatTaskReadback = (draft) => {
  const parts = [`Your task is '${draft.title}'`];
  if (draft.dueDateString) {
    const human = formatHumanDate(draft.dueDateString);
    const timePart = draft.dueTime ? ` at ${draft.dueTime}` : '';
    parts.push(`due ${human}${timePart}`);
  }
  parts.push(`with ${draft.priority || 'medium'} priority`);
  if (draft.category && draft.category !== 'General') {
    parts.push(`in ${draft.category}`);
  }
  if (draft.assigneeName) {
    parts.push(`assigned to ${draft.assigneeName}`);
  }
  if (draft.customDescription) {
    parts.push(`description '${draft.customDescription}'`);
  }
  if (Array.isArray(draft.subtasks) && draft.subtasks.length > 0) {
    parts.push(`with ${draft.subtasks.length} ${draft.subtasks.length === 1 ? 'subtask' : 'subtasks'}`);
  }
  const verb = draft.mode === 'schedule' ? 'schedule' : 'create';
  return `${parts.join(', ')}. Should I ${verb} it?`;
};

const nextMissingStepPrompt = (draft) => {
  if (!draft.hasTitle) {
    return { step: 'ASK_TITLE', speech: 'Sure! What should I name the task?' };
  }
  if (!draft.hasDueDate && !draft.dueDateSkipped) {
    return { step: 'ASK_DUE_DATE', speech: 'When should I complete it? You can say a date and time, or say skip.' };
  }
  if (!draft.hasPriority) {
    return { step: 'ASK_PRIORITY', speech: 'What priority should I set: high, medium, or low?' };
  }
  if (!draft.extraDetailsDone) {
    return {
      step: 'ASK_EXTRA_DETAILS',
      speech: "Would you like to add a description, category, assignee, or subtasks? Say what to add, or say 'no' to review."
    };
  }
  return { step: 'CONFIRM', speech: formatTaskReadback(draft) };
};

export const startTaskConversation = (initialPrompt = '', mode = 'create') => {
  const trimmed = String(initialPrompt || '').trim();
  const parsed = trimmed ? parseTaskPromptLocal(trimmed) : null;

  const draft = {
    mode: mode === 'schedule' ? 'schedule' : 'create',
    title: parsed?.hasExplicitTitle ? parsed.title : '',
    hasTitle: Boolean(parsed?.hasExplicitTitle),
    dueDate: parsed?.hasExplicitDate ? parsed.dueDate : null,
    dueDateString: parsed?.hasExplicitDate ? parsed.dueDateString : null,
    dueTime: parsed?.dueTime || '',
    hasDueDate: Boolean(parsed?.hasExplicitDate),
    dueDateSkipped: false,
    priority: parsed?.hasExplicitPriority ? parsed.priority : 'medium',
    hasPriority: Boolean(parsed?.hasExplicitPriority),
    category: parsed?.category || 'General',
    customDescription: '',
    assignedTo: null,
    assigneeName: '',
    subtasks: [],
    extraDetailsDone: false,
    recurrence: parsed?.recurrence || { isRecurring: false, frequency: 'none', interval: 1 }
  };

  const next = nextMissingStepPrompt(draft);
  return {
    state: { step: next.step, draft },
    speech: next.speech,
    toastType: 'info',
    keepListening: true
  };
};

const applyExtraDetailUtterance = async (draft, answer, ctx = {}) => {
  const clean = answer.trim();
  const lower = clean.toLowerCase();

  const descMatch = clean.match(/^(?:add\s+)?description(?:\s+is|:)?\s+(.+)$/i);
  if (descMatch) {
    draft.customDescription = descMatch[1].trim();
    return { matched: true, note: 'Added description.' };
  }

  const catMatch = clean.match(/^(?:set\s+|change\s+)?category(?:\s+to|\s+is|:)?\s+(.+)$/i);
  if (catMatch) {
    const cat = catMatch[1].trim();
    draft.category = cat.charAt(0).toUpperCase() + cat.slice(1);
    return { matched: true, note: `Set category to ${draft.category}.` };
  }

  const subMatch = clean.match(/^(?:add\s+(?:a\s+)?)?subtask(?:\s+is|:)?\s+(.+)$/i);
  if (subMatch) {
    const subTitle = subMatch[1].trim();
    draft.subtasks = [...(draft.subtasks || []), { title: subTitle, isCompleted: false }];
    return { matched: true, note: `Added subtask ${subTitle}.` };
  }

  const assignMatch = clean.match(/^assign(?:\s+it)?\s+to\s+(.+)$/i);
  if (assignMatch) {
    const query = assignMatch[1].trim();
    if (ctx.currentOrg?._id) {
      try {
        const memRes = await api.get(`/organizations/${ctx.currentOrg._id}/members`);
        const member = findBestMember(memRes.data?.members || [], query);
        if (member?.user?._id) {
          draft.assignedTo = member.user._id;
          draft.assigneeName = member.user.name || member.user.email;
          return { matched: true, note: `Assigned to ${draft.assigneeName}.` };
        }
        return { matched: false, error: `I couldn't find a team member named ${query}. Try another name, or say 'no' to review.` };
      } catch {
        return { matched: false, error: 'Could not look up team members right now. Say another detail or say no to review.' };
      }
    }
    return { matched: false, error: 'No active organization is selected for assignment. Say another detail or say no to review.' };
  }

  if (/^(?:high|medium|low)(?:\s+priority)?$/i.test(lower)) {
    draft.priority = lower.replace(/\s+priority$/i, '');
    draft.hasPriority = true;
    return { matched: true, note: `Updated priority to ${draft.priority}.` };
  }

  return { matched: false };
};

export const advanceTaskConversation = async (convState, rawReply, ctx = {}) => {
  if (!convState || !convState.draft) {
    return { nextState: null, speech: "I'm not sure what we were working on. How can I help?", toastType: 'info', keepListening: false };
  }

  const reply = stripPoliteFillers(normalizeVoiceCommand(rawReply || ''));
  const lower = reply.toLowerCase();
  const draft = { ...convState.draft };

  if (!reply) {
    return {
      nextState: convState,
      speech: "I didn't hear anything. Please repeat your answer, or say 'cancel' to stop.",
      toastType: 'info',
      keepListening: true
    };
  }

  if (CONV_CANCEL_REGEX.test(lower)) {
    return {
      nextState: null,
      speech: 'Okay, I cancelled creating the task.',
      toastType: 'info',
      keepListening: false
    };
  }

  switch (convState.step) {
    case 'ASK_TITLE': {
      const cleanedTitle = reply
        .replace(/^(?:call\s+it|name\s+it|title\s+it|it's|its|task\s+name\s+is|name\s+is|title\s+is)\s+/i, '')
        .trim();
      if (!cleanedTitle || CONV_CONFIRM_REGEX.test(cleanedTitle) || CONV_NO_REGEX.test(cleanedTitle) || /^(?:task|a task)$/i.test(cleanedTitle)) {
        return {
          nextState: convState,
          speech: "I didn't catch a valid task name. What would you like to name the task?",
          toastType: 'info',
          keepListening: true
        };
      }
      draft.title = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
      draft.hasTitle = true;
      const next = nextMissingStepPrompt(draft);
      return {
        nextState: { step: next.step, draft },
        speech: next.speech,
        toastType: 'info',
        keepListening: true
      };
    }

    case 'ASK_DUE_DATE': {
      if (CONV_NO_REGEX.test(lower)) {
        draft.dueDateSkipped = true;
        const next = nextMissingStepPrompt(draft);
        return {
          nextState: { step: next.step, draft },
          speech: next.speech,
          toastType: 'info',
          keepListening: true
        };
      }

      const parsedDate = parseTaskPromptLocal(`schedule task ${reply}`);
      if (!parsedDate.hasExplicitDate) {
        return {
          nextState: convState,
          speech: "I didn't catch a date or time. Please say something like 'tomorrow at 5 PM', 'Friday', or 'skip'.",
          toastType: 'info',
          keepListening: true
        };
      }

      draft.dueDate = parsedDate.dueDate;
      draft.dueDateString = parsedDate.dueDateString;
      draft.dueTime = parsedDate.dueTime || '';
      draft.hasDueDate = true;
      const next = nextMissingStepPrompt(draft);
      return {
        nextState: { step: next.step, draft },
        speech: next.speech,
        toastType: 'info',
        keepListening: true
      };
    }

    case 'ASK_PRIORITY': {
      if (/\b(high|urgent|critical|asap|important|p1)\b/i.test(lower)) {
        draft.priority = 'high';
      } else if (/\b(medium|normal|moderate|p2|skip|default)\b/i.test(lower)) {
        draft.priority = 'medium';
      } else if (/\b(low|whenever|optional|p3)\b/i.test(lower)) {
        draft.priority = 'low';
      } else {
        return {
          nextState: convState,
          speech: 'Please say high, medium, or low priority.',
          toastType: 'info',
          keepListening: true
        };
      }
      draft.hasPriority = true;
      const next = nextMissingStepPrompt(draft);
      return {
        nextState: { step: next.step, draft },
        speech: next.speech,
        toastType: 'info',
        keepListening: true
      };
    }

    case 'ASK_EXTRA_DETAILS': {
      if (CONV_NO_REGEX.test(lower)) {
        draft.extraDetailsDone = true;
        return {
          nextState: { step: 'CONFIRM', draft },
          speech: formatTaskReadback(draft),
          toastType: 'info',
          keepListening: true
        };
      }
      if (/^(?:yes|yeah|yep|sure|ok|okay)$/i.test(lower)) {
        return {
          nextState: convState,
          speech: "What would you like to add? For example, 'description ...', 'category Work', 'assign to Alex', or 'subtask ...'.",
          toastType: 'info',
          keepListening: true
        };
      }
      const applied = await applyExtraDetailUtterance(draft, reply, ctx);
      if (!applied.matched) {
        return {
          nextState: convState,
          speech: applied.error || "I didn't catch that. Say 'description ...', 'category ...', 'assign to ...', 'subtask ...', or 'no' to review.",
          toastType: 'info',
          keepListening: true
        };
      }
      return {
        nextState: { step: 'ASK_EXTRA_DETAILS', draft },
        speech: `${applied.note} Anything else, or say 'no' to review?`,
        toastType: 'info',
        keepListening: true
      };
    }

    case 'CONFIRM': {
      if (CONV_NO_REGEX.test(lower) || /^(?:no|don't|dont)$/i.test(lower)) {
        return {
          nextState: null,
          speech: 'Okay, I cancelled creating the task.',
          toastType: 'info',
          keepListening: false
        };
      }

      // Allow inline edits before confirming
      const renameM = reply.match(/^(?:change\s+(?:title|name)\s+to|rename\s+(?:it\s+)?to)\s+(.+)$/i);
      if (renameM) {
        const nextTitle = renameM[1].trim();
        draft.title = nextTitle.charAt(0).toUpperCase() + nextTitle.slice(1);
        return {
          nextState: { step: 'CONFIRM', draft },
          speech: formatTaskReadback(draft),
          toastType: 'info',
          keepListening: true
        };
      }
      const dateEditM = reply.match(/^(?:change\s+(?:due\s+)?date\s+to|reschedule\s+(?:it\s+)?to)\s+(.+)$/i);
      if (dateEditM) {
        const parsedDate = parseTaskPromptLocal(`schedule task ${dateEditM[1].trim()}`);
        if (parsedDate.hasExplicitDate) {
          draft.dueDate = parsedDate.dueDate;
          draft.dueDateString = parsedDate.dueDateString;
          draft.dueTime = parsedDate.dueTime || '';
          draft.hasDueDate = true;
          return {
            nextState: { step: 'CONFIRM', draft },
            speech: formatTaskReadback(draft),
            toastType: 'info',
            keepListening: true
          };
        }
      }
      const prioEditM = reply.match(/^(?:change\s+|set\s+)?priority\s+(?:to\s+)?(high|medium|low)$/i);
      if (prioEditM) {
        draft.priority = prioEditM[1].toLowerCase();
        draft.hasPriority = true;
        return {
          nextState: { step: 'CONFIRM', draft },
          speech: formatTaskReadback(draft),
          toastType: 'info',
          keepListening: true
        };
      }

      if (!CONV_CONFIRM_REGEX.test(lower)) {
        return {
          nextState: convState,
          speech: `I didn't catch a clear confirmation. Should I create '${draft.title}'? Say 'yes' to confirm or 'cancel' to discard.`,
          toastType: 'info',
          keepListening: true
        };
      }

      const payload = {
        title: draft.title,
        description: draft.customDescription || `Created via TaskFlow Voice Assistant`,
        priority: draft.priority || 'medium',
        category: draft.category || 'General',
        dueDate: draft.dueDate || undefined,
        dueDateString: draft.dueDateString || undefined,
        assignedTo: draft.assignedTo || undefined,
        subtasks: Array.isArray(draft.subtasks) && draft.subtasks.length > 0 ? draft.subtasks : undefined,
        recurrence: draft.recurrence
      };

      const res = await api.post('/tasks', payload);
      const created = res.data?.task || payload;
      if (created?._id || created?.title) {
        ctx.setLastTask?.(created);
      }
      ctx.refreshData?.();

      const actionWord = draft.mode === 'schedule' ? 'scheduled' : 'created';
      return {
        nextState: null,
        lastTask: created,
        speech: `Your task '${created.title}' has been ${actionWord} successfully.`,
        toastType: 'success',
        keepListening: false
      };
    }

    default:
      return { nextState: null, speech: 'Okay, starting over.', toastType: 'info', keepListening: false };
  }
};
