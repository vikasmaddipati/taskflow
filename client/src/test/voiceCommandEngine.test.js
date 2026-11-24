import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractWakeCommand,
  formatHumanDate,
  parseTaskPromptLocal,
  parseVoiceIntent,
  executeVoiceIntent,
  startTaskConversation,
  advanceTaskConversation,
  formatTaskReadback
} from '../services/voiceCommandEngine';
import api from '../services/api';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

describe('Voice Command Engine (Human Conversational Wake Word, Intent Parsing & Execution)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractWakeCommand', () => {
    it('extracts inline command after "Mate", "Task Mate", and "Task Flow"', () => {
      const res0 = extractWakeCommand('Mate create task buy milk', true);
      expect(res0).toEqual({ woke: true, wakeOnly: false, command: 'create task buy milk' });

      const res1 = extractWakeCommand('Task Flow create task buy milk', true);
      expect(res1).toEqual({ woke: true, wakeOnly: false, command: 'create task buy milk' });

      const res2 = extractWakeCommand('Task Mate create task buy milk', true);
      expect(res2).toEqual({ woke: true, wakeOnly: false, command: 'create task buy milk' });
    });

    it('supports "Hey Mate,", "Hey TaskMate,", and wake-only activation', () => {
      expect(extractWakeCommand('Hey Mate, schedule meeting tomorrow at 3pm', true)).toEqual({
        woke: true,
        wakeOnly: false,
        command: 'schedule meeting tomorrow at 3pm'
      });

      expect(extractWakeCommand('Mate', true)).toEqual({
        woke: true,
        wakeOnly: true,
        command: ''
      });

      expect(extractWakeCommand('Hey Mate', true)).toEqual({
        woke: true,
        wakeOnly: true,
        command: ''
      });

      expect(extractWakeCommand('Ok Mate', true)).toEqual({
        woke: true,
        wakeOnly: true,
        command: ''
      });

      expect(extractWakeCommand('Hey TaskFlow, schedule meeting tomorrow at 3pm', true)).toEqual({
        woke: true,
        wakeOnly: false,
        command: 'schedule meeting tomorrow at 3pm'
      });

      expect(extractWakeCommand('Hey TaskMate, schedule meeting tomorrow at 3pm', true)).toEqual({
        woke: true,
        wakeOnly: false,
        command: 'schedule meeting tomorrow at 3pm'
      });

      expect(extractWakeCommand('Task Mate', true)).toEqual({
        woke: true,
        wakeOnly: true,
        command: ''
      });

      expect(extractWakeCommand('Task Flow', true)).toEqual({
        woke: true,
        wakeOnly: true,
        command: ''
      });
    });

    it('ignores speech without wake word when requireWakeWord is true', () => {
      expect(extractWakeCommand('create task buy milk', true)).toEqual({
        woke: false,
        wakeOnly: false,
        command: ''
      });
    });

    it('accepts direct commands when requireWakeWord is false', () => {
      expect(extractWakeCommand('open settings', false)).toEqual({
        woke: true,
        wakeOnly: false,
        command: 'open settings'
      });
    });

    it('matches close phonetic misrecognitions of "Task Flow" without false positives', () => {
      expect(extractWakeCommand('task four create task python', true)).toEqual({
        woke: true,
        wakeOnly: false,
        command: 'create task python'
      });
      expect(extractWakeCommand('desk flow', true)).toEqual({
        woke: true,
        wakeOnly: true,
        command: ''
      });
      expect(extractWakeCommand('watching a video on youtube', true)).toEqual({
        woke: false,
        wakeOnly: false,
        command: ''
      });
    });
  });

  describe('formatHumanDate', () => {
    it('formats today and tomorrow naturally instead of raw YYYY-MM-DD', () => {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const tom = new Date(now.getTime());
      tom.setDate(tom.getDate() + 1);
      const tomStr = `${tom.getFullYear()}-${pad(tom.getMonth() + 1)}-${pad(tom.getDate())}`;

      expect(formatHumanDate(todayStr)).toBe('today');
      expect(formatHumanDate(tomStr)).toBe('tomorrow');
    });
  });

  describe('parseTaskPromptLocal', () => {
    it('extracts clean title, priority, category, and due date', () => {
      const parsed = parseTaskPromptLocal('create task client review meeting tomorrow at 3pm high priority');
      expect(parsed.title).toBe('Client review meeting');
      expect(parsed.priority).toBe('high');
      expect(parsed.category).toBe('Work');
      expect(parsed.dueDateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('strips "name" keyword and conversational leads cleanly', () => {
      const wake = extractWakeCommand('TASK FLOW schedule a task name PYTHON', true);
      expect(wake).toEqual({
        woke: true,
        wakeOnly: false,
        command: 'schedule a task name PYTHON'
      });
      expect(parseTaskPromptLocal(wake.command).title).toBe('PYTHON');

      const natural = parseTaskPromptLocal('I need to finish the Python report tomorrow evening');
      expect(natural.title).toBe('Finish the Python report');
      expect(natural.category).toBe('Work');
    });
  });

  describe('parseVoiceIntent', () => {
    it('parses natural human speech and structured commands', () => {
      expect(parseVoiceIntent('Can you please create task buy groceries for me')).toEqual({
        type: 'TASK_CREATE',
        prompt: 'create task buy groceries'
      });
      expect(parseVoiceIntent('I need to call mom tomorrow')).toEqual({
        type: 'TASK_CREATE',
        prompt: 'I need to call mom tomorrow'
      });
      expect(parseVoiceIntent('I finished buy groceries')).toEqual({
        type: 'TASK_COMPLETE',
        query: 'buy groceries'
      });
      expect(parseVoiceIntent('make it high priority')).toEqual({
        type: 'TASK_SET_PRIORITY',
        query: 'it',
        priority: 'high'
      });
      expect(parseVoiceIntent('cancel old item')).toEqual({
        type: 'TASK_DELETE',
        query: 'old item'
      });
      expect(parseVoiceIntent('what do I have today')).toEqual({ type: 'QUERY_TODAY' });
      expect(parseVoiceIntent('am I behind on anything')).toEqual({ type: 'QUERY_OVERDUE' });
      expect(parseVoiceIntent('take me to my day')).toEqual({
        type: 'NAVIGATE',
        view: 'today',
        label: 'My Day'
      });
      expect(parseVoiceIntent('good morning')).toEqual({ type: 'SMALL_TALK_GREETING' });
      expect(parseVoiceIntent('thank you')).toEqual({ type: 'SMALL_TALK_THANKS' });
      expect(parseVoiceIntent('add subtask write tests to Python')).toEqual({
        type: 'SUBTASK_ADD',
        subtaskTitle: 'write tests',
        taskQuery: 'Python'
      });
      expect(parseVoiceIntent('add comment waiting for review on Python')).toEqual({
        type: 'COMMENT_ADD',
        content: 'waiting for review',
        taskQuery: 'Python'
      });
      expect(parseVoiceIntent('reschedule Python to tomorrow')).toEqual({
        type: 'TASK_RESCHEDULE',
        query: 'Python',
        dateText: 'tomorrow'
      });
      expect(parseVoiceIntent('rename Python to Python API')).toEqual({
        type: 'TASK_RENAME',
        query: 'Python',
        newTitle: 'Python API'
      });
      expect(parseVoiceIntent('move Python to in progress')).toEqual({
        type: 'TASK_MOVE_STATUS',
        query: 'Python',
        status: 'in_progress'
      });
      expect(parseVoiceIntent('move Python to review')).toEqual({
        type: 'TASK_MOVE_STATUS',
        query: 'Python',
        status: 'review'
      });
      expect(parseVoiceIntent('complete all overdue tasks')).toEqual({
        type: 'TASK_BULK',
        action: 'complete',
        scope: 'overdue'
      });
      expect(parseVoiceIntent('invite alex@company.com as admin')).toEqual({
        type: 'MEMBER_INVITE',
        email: 'alex@company.com',
        role: 'admin'
      });
      expect(parseVoiceIntent('what plan am I on')).toEqual({ type: 'BILLING_STATUS' });
      expect(parseVoiceIntent('list active sessions')).toEqual({ type: 'SESSIONS_LIST' });
      expect(parseVoiceIntent('create webhook https://example.com/hook')).toEqual({
        type: 'WEBHOOK_CREATE',
        url: 'https://example.com/hook'
      });
      expect(extractWakeCommand('fast flow schedule task Demo', true)).toEqual({
        woke: true,
        wakeOnly: false,
        command: 'schedule task Demo'
      });
    });
  });

  describe('executeVoiceIntent', () => {
    it('creates a task and returns natural human confirmation', async () => {
      api.post.mockImplementation(async (url) => {
        if (url === '/v1/ai/parse') {
          return {
            data: {
              success: true,
              draft: { title: 'Buy groceries', priority: 'medium', category: 'Personal' }
            }
          };
        }
        if (url === '/tasks') {
          return {
            data: {
              success: true,
              task: { _id: 't1', title: 'Buy groceries' }
            }
          };
        }
        return { data: { success: true } };
      });

      const refreshData = vi.fn();
      const setLastTask = vi.fn();
      const result = await executeVoiceIntent(
        { type: 'TASK_CREATE', prompt: 'create task buy groceries' },
        { refreshData, setLastTask }
      );

      expect(api.post).toHaveBeenCalledWith(
        '/tasks',
        expect.objectContaining({ title: 'Buy groceries' })
      );
      expect(setLastTask).toHaveBeenCalledWith({ _id: 't1', title: 'Buy groceries' });
      expect(refreshData).toHaveBeenCalledTimes(1);
      expect(result.speech).toBe("Got it! I've created the task Buy groceries.");
      expect(result.toastType).toBe('success');
    });

    it('schedules a task with human-friendly date wording', async () => {
      const tom = new Date();
      tom.setDate(tom.getDate() + 1);
      const tomStr = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;

      api.post.mockImplementation(async (url) => {
        if (url === '/v1/ai/parse') {
          return {
            data: {
              success: true,
              draft: {
                title: 'Team sync',
                priority: 'high',
                category: 'Work',
                dueDateString: tomStr
              }
            }
          };
        }
        if (url === '/tasks') {
          return {
            data: {
              success: true,
              task: { _id: 't2', title: 'Team sync', dueDateString: tomStr }
            }
          };
        }
        return { data: { success: true } };
      });

      const refreshData = vi.fn();
      const result = await executeVoiceIntent(
        { type: 'TASK_SCHEDULE', prompt: 'schedule task team sync tomorrow' },
        { refreshData }
      );

      expect(result.speech).toBe("All set! I've scheduled Team sync for tomorrow.");
      expect(result.toastType).toBe('success');
    });

    it('resolves "it" to lastTask and asks clarifying question when task name is omitted', async () => {
      api.patch.mockResolvedValueOnce({ data: { success: true } });
      const refreshData = vi.fn();

      const pronounRes = await executeVoiceIntent(
        { type: 'TASK_COMPLETE', query: 'it' },
        { lastTask: { _id: 't5', title: 'PYTHON', status: 'pending' }, refreshData }
      );
      expect(api.patch).toHaveBeenCalledWith('/tasks/t5/toggle');
      expect(pronounRes.speech).toBe("Nice job! I've marked PYTHON as completed.");

      api.get.mockResolvedValueOnce({
        data: { tasks: [{ _id: 't6', title: 'Write docs', status: 'pending' }] }
      });
      const clarifyRes = await executeVoiceIntent(
        { type: 'TASK_COMPLETE', query: '' },
        { refreshData }
      );
      expect(clarifyRes.pendingAction).toBe('TASK_COMPLETE');
      expect(clarifyRes.keepListening).toBe(true);
      expect(clarifyRes.speech).toContain('Write docs');
    });

    it('sends valid backend status enums and bulk operation payloads', async () => {
      const refreshData = vi.fn();
      api.get.mockResolvedValueOnce({
        data: { tasks: [{ _id: 't10', title: 'Python', status: 'pending' }] }
      });
      api.patch.mockResolvedValueOnce({ data: { success: true } });

      const startRes = await executeVoiceIntent(
        { type: 'TASK_IN_PROGRESS', query: 'Python' },
        { refreshData }
      );
      expect(api.patch).toHaveBeenCalledWith('/tasks/t10/status', { status: 'in_progress' });
      expect(startRes.speech).toContain('in progress');

      api.get.mockResolvedValueOnce({
        data: { tasks: [{ _id: 't11', title: 'Task A' }, { _id: 't12', title: 'Task B' }] }
      });
      api.post.mockResolvedValueOnce({ data: { success: true } });

      const bulkRes = await executeVoiceIntent(
        { type: 'TASK_BULK', action: 'complete', scope: 'overdue' },
        { refreshData }
      );
      expect(api.post).toHaveBeenCalledWith('/tasks/bulk', {
        taskIds: ['t11', 't12'],
        operation: 'status',
        payload: 'completed'
      });
      expect(bulkRes.speech).toBe('Completed 2 overdue tasks.');
    });

    it('assigns task using assignedTo, adds subtasks/comments, and opens edit modal', async () => {
      const refreshData = vi.fn();
      const openEditModal = vi.fn();
      const task = { _id: 't20', title: 'Python', status: 'pending' };

      api.get.mockImplementation(async (url) => {
        if (url === '/tasks') return { data: { tasks: [task] } };
        if (url === '/organizations/org1/members') {
          return { data: { members: [{ user: { _id: 'u2', name: 'Alex' } }] } };
        }
        return { data: { success: true } };
      });
      api.put.mockResolvedValueOnce({ data: { success: true } });
      api.post.mockResolvedValue({ data: { success: true } });

      const assignRes = await executeVoiceIntent(
        { type: 'TASK_ASSIGN', query: 'Python', assigneeQuery: 'Alex' },
        { currentOrg: { _id: 'org1' }, refreshData }
      );
      expect(api.put).toHaveBeenCalledWith('/tasks/t20', { assignedTo: 'u2' });
      expect(assignRes.speech).toBe('Assigned Python to Alex.');

      await executeVoiceIntent(
        { type: 'SUBTASK_ADD', subtaskTitle: 'write tests', taskQuery: 'Python' },
        { refreshData }
      );
      expect(api.post).toHaveBeenCalledWith('/tasks/t20/subtasks', { title: 'write tests' });

      await executeVoiceIntent(
        { type: 'COMMENT_ADD', content: 'ready for review', taskQuery: 'Python' },
        { refreshData }
      );
      expect(api.post).toHaveBeenCalledWith('/tasks/t20/comments', { content: 'ready for review' });

      const editRes = await executeVoiceIntent(
        { type: 'TASK_EDIT', query: 'Python' },
        { openEditModal }
      );
      expect(openEditModal).toHaveBeenCalledWith(task);
      expect(editRes.speech).toContain('Opening Python');
    });
  });

  describe('Conversational Task Creation Flow', () => {
    it('asks one question at a time, reads back, and creates only after explicit confirmation', async () => {
      const refreshData = vi.fn();
      api.post.mockResolvedValueOnce({
        data: { task: { _id: 'conv1', title: 'Complete my project', priority: 'high' } }
      });

      const start = startTaskConversation('Create a task', 'create');
      expect(start.state.step).toBe('ASK_TITLE');
      expect(start.speech).toMatch(/what should i name the task/i);
      expect(api.post).not.toHaveBeenCalled();

      let stepRes = await advanceTaskConversation(start.state, 'Complete my project', { refreshData });
      expect(stepRes.nextState.draft.title).toBe('Complete my project');
      expect(stepRes.nextState.step).toBe('ASK_DUE_DATE');
      expect(stepRes.speech).toMatch(/when/i);
      expect(api.post).not.toHaveBeenCalled();

      stepRes = await advanceTaskConversation(stepRes.nextState, 'Tomorrow at 5 PM', { refreshData });
      expect(stepRes.nextState.draft.hasDueDate).toBe(true);
      expect(stepRes.nextState.draft.dueTime).toMatch(/5\s*PM/i);
      expect(stepRes.nextState.step).toBe('ASK_PRIORITY');
      expect(stepRes.speech).toMatch(/priority/i);
      expect(api.post).not.toHaveBeenCalled();

      stepRes = await advanceTaskConversation(stepRes.nextState, 'High', { refreshData });
      expect(stepRes.nextState.draft.priority).toBe('high');
      expect(stepRes.nextState.step).toBe('ASK_EXTRA_DETAILS');
      expect(api.post).not.toHaveBeenCalled();

      stepRes = await advanceTaskConversation(stepRes.nextState, 'no', { refreshData });
      expect(stepRes.nextState.step).toBe('CONFIRM');
      expect(stepRes.speech).toContain('Complete my project');
      expect(stepRes.speech).toMatch(/high priority/i);
      expect(stepRes.speech).toMatch(/should i create it/i);
      expect(api.post).not.toHaveBeenCalled();

      // Unclear reply at confirmation should NOT create task
      const unclearRes = await advanceTaskConversation(stepRes.nextState, 'maybe later', { refreshData });
      expect(unclearRes.nextState.step).toBe('CONFIRM');
      expect(api.post).not.toHaveBeenCalled();

      // Explicit confirmation creates the task once
      const confirmRes = await advanceTaskConversation(unclearRes.nextState, 'Yes', { refreshData });
      expect(confirmRes.nextState).toBeNull();
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(api.post).toHaveBeenCalledWith('/tasks', expect.objectContaining({
        title: 'Complete my project',
        priority: 'high'
      }));
      expect(refreshData).toHaveBeenCalledTimes(1);
      expect(confirmRes.speech).toMatch(/created successfully/i);
    });

    it('skips questions for details already provided upfront', async () => {
      const start = startTaskConversation('Create a task buy milk tomorrow high priority', 'create');
      expect(start.state.draft.hasTitle).toBe(true);
      expect(start.state.draft.hasDueDate).toBe(true);
      expect(start.state.draft.hasPriority).toBe(true);
      expect(start.state.step).toBe('ASK_EXTRA_DETAILS');

      const readback = formatTaskReadback(start.state.draft);
      expect(readback).toContain('Buy milk');
      expect(readback).toMatch(/high priority/i);
    });

    it('cancels cleanly without creating any task', async () => {
      const refreshData = vi.fn();
      const start = startTaskConversation('Create a task', 'create');
      const res1 = await advanceTaskConversation(start.state, 'Finish report', { refreshData });
      const cancelled = await advanceTaskConversation(res1.nextState, 'cancel', { refreshData });
      expect(cancelled.nextState).toBeNull();
      expect(cancelled.speech).toMatch(/cancel/i);
      expect(api.post).not.toHaveBeenCalled();
    });

    it('treats short ambiguous commands as UNCLEAR instead of guessing', async () => {
      const intent = parseVoiceIntent('blabla');
      expect(intent.type).toBe('UNCLEAR');
      const res = await executeVoiceIntent(intent, {});
      expect(res.keepListening).toBe(true);
      expect(res.speech).toMatch(/explain|understand/i);
    });

    it('routes natural task-creation phrasings and Vosk misrecognitions into conversational flow instead of AI_CHAT', () => {
      for (const phrase of [
        'create a new task',
        'created a task',
        'add a new task',
        'i would like to create a task',
        'help me create a task'
      ]) {
        const intent = parseVoiceIntent(phrase);
        expect(intent.type).toBe('OPEN_CREATE_TASK_MODAL');
        const conv = startTaskConversation(intent.prompt || '', 'create');
        expect(conv.state.step).toBe('ASK_TITLE');
      }
    });
  });
});
