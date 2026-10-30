import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ListTodo,
  Layers,
  Bot,
  User,
  RefreshCw,
  Zap,
  Plus,
  Sliders,
  Check,
  ChevronRight,
  Trash2,
  Lightbulb
} from 'lucide-react';
import api from '../services/api';

export const AIView = ({ onTaskCreated, onNavigate, showToast }) => {
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'scheduler' | 'optimizer' | 'breakdown'

  // Chat State
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'ai',
      text: `👋 Hello! I am your **TaskFlow AI Assistant**.\n\nYou can ask me to schedule tasks in plain English (e.g. *"Schedule client review meeting tomorrow at 3pm high priority"*), plan your day, optimize deadlines, or break down large projects into manageable milestones.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedReplies: [
        '📅 Plan my day',
        '⚡ Schedule: Team sync tomorrow at 10am',
        '⚠️ Show overdue tasks',
        '🚀 Break down: Launch marketing campaign'
      ]
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);

  // Smart Scheduler Tab State
  const [schedulerPrompt, setSchedulerPrompt] = useState('');
  const [parsedDraft, setParsedDraft] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);

  // Optimizer Tab State
  const [optimizationData, setOptimizationData] = useState(null);
  const [isLoadingOptimizer, setIsLoadingOptimizer] = useState(false);
  const [isApplyingSchedule, setIsApplyingSchedule] = useState(false);

  // Breakdown Tab State
  const [goalPrompt, setGoalPrompt] = useState('');
  const [milestones, setMilestones] = useState([]);
  const [isGeneratingMilestones, setIsGeneratingMilestones] = useState(false);
  const [isBatchCreating, setIsBatchCreating] = useState(false);

  // Scroll to bottom on new chat messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  // Load schedule optimizer data when tab switches to optimizer
  useEffect(() => {
    if (activeTab === 'optimizer' && !optimizationData) {
      loadOptimization();
    }
  }, [activeTab]);

  const loadOptimization = async () => {
    try {
      setIsLoadingOptimizer(true);
      const res = await api.post('/v1/ai/optimize', { apply: false });
      if (res.data.success) {
        setOptimizationData(res.data.analysis);
      }
    } catch (err) {
      showToast?.({
        type: 'error',
        message: err.response?.data?.message || 'Failed to load schedule optimization'
      });
    } finally {
      setIsLoadingOptimizer(false);
    }
  };

  const handleApplyOptimization = async () => {
    try {
      setIsApplyingSchedule(true);
      const res = await api.post('/v1/ai/optimize', { apply: true });
      if (res.data.success) {
        showToast?.({
          type: 'success',
          message: res.data.message || 'AI schedule applied successfully!'
        });
        loadOptimization();
        onTaskCreated?.();
      }
    } catch (err) {
      showToast?.({
        type: 'error',
        message: err.response?.data?.message || 'Failed to apply schedule'
      });
    } finally {
      setIsApplyingSchedule(false);
    }
  };

  // Live parsing in smart scheduler tab
  const handleParsePrompt = async (promptToParse) => {
    const text = promptToParse !== undefined ? promptToParse : schedulerPrompt;
    if (!text.trim()) {
      setParsedDraft(null);
      return;
    }
    try {
      setIsParsing(true);
      const res = await api.post('/v1/ai/parse', { prompt: text });
      if (res.data.success) {
        setParsedDraft(res.data.draft);
      }
    } catch {
      // quiet fail
    } finally {
      setIsParsing(false);
    }
  };

  // Schedule task directly from Smart Scheduler tab
  const handleConfirmSchedule = async () => {
    if (!parsedDraft || !parsedDraft.title) return;
    try {
      setIsScheduling(true);
      const res = await api.post('/tasks', {
        title: parsedDraft.title,
        description: parsedDraft.description || '',
        priority: parsedDraft.priority || 'medium',
        category: parsedDraft.category || 'General',
        dueDate: parsedDraft.dueDate || null,
        dueDateString: parsedDraft.dueDateString || null,
        recurrence: parsedDraft.recurrence || { isRecurring: false, frequency: 'none', interval: 1 },
        subtasks: parsedDraft.subtasks || []
      });

      if (res.data.success) {
        showToast?.({
          type: 'success',
          message: `Scheduled: "${parsedDraft.title}"`
        });
        setSchedulerPrompt('');
        setParsedDraft(null);
        onTaskCreated?.();
      }
    } catch (err) {
      showToast?.({
        type: 'error',
        message: err.response?.data?.message || 'Failed to schedule task'
      });
    } finally {
      setIsScheduling(false);
    }
  };

  // Breakdown generation
  const handleGenerateBreakdown = async () => {
    if (!goalPrompt.trim()) return;
    try {
      setIsGeneratingMilestones(true);
      const res = await api.post('/v1/ai/breakdown', { goal: goalPrompt, autoCreate: false });
      if (res.data.success) {
        setMilestones(res.data.milestones || []);
      }
    } catch (err) {
      showToast?.({
        type: 'error',
        message: err.response?.data?.message || 'Failed to generate milestones'
      });
    } finally {
      setIsGeneratingMilestones(false);
    }
  };

  // Batch create milestones
  const handleCreateAllMilestones = async (customMilestones = null) => {
    const targetGoal = goalPrompt || 'Project Roadmap';
    try {
      setIsBatchCreating(true);
      const res = await api.post('/v1/ai/breakdown', {
        goal: targetGoal,
        autoCreate: true
      });
      if (res.data.success) {
        showToast?.({
          type: 'success',
          message: res.data.message || 'Milestones created successfully in your workspace!'
        });
        setMilestones([]);
        setGoalPrompt('');
        onTaskCreated?.();
      }
    } catch (err) {
      showToast?.({
        type: 'error',
        message: err.response?.data?.message || 'Failed to create milestones'
      });
    } finally {
      setIsBatchCreating(false);
    }
  };

  // Chat message sending
  const handleSendMessage = async (textToSend = null) => {
    const text = (textToSend || inputText).trim();
    if (!text || isSending) return;

    const userMsg = {
      id: String(Date.now()),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setIsSending(true);

    try {
      const res = await api.post('/v1/ai/chat', { message: text });
      if (res.data.success) {
        const aiMsg = {
          id: String(Date.now() + 1),
          sender: 'ai',
          text: res.data.reply,
          action: res.data.action,
          task: res.data.task,
          tasks: res.data.tasks,
          milestones: res.data.milestones,
          optimization: res.data.optimization,
          suggestedReplies: res.data.suggestedReplies || [],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => [...prev, aiMsg]);

        // If an action was performed, refresh tasks in parent view
        if (['task_created', 'task_completed', 'schedule_optimized'].includes(res.data.action)) {
          onTaskCreated?.();
        }
      }
    } catch (err) {
      const errorMsg = {
        id: String(Date.now() + 1),
        sender: 'ai',
        text: `⚠️ ${err.response?.data?.message || 'Sorry, I encountered an issue processing that request. Please try again.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const renderPriorityBadge = (priority) => {
    switch (priority) {
      case 'high':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">High</span>;
      case 'low':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">Low</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">Medium</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 pointer-events-none flex items-center pr-8">
          <Sparkles className="w-56 h-56 text-white" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-medium text-indigo-200 border border-white/20 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
              <span>TaskFlow AI Copilot & Scheduler</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">AI Task Manager</h1>
            <p className="text-indigo-200 text-sm mt-1 max-w-xl">
              Control your workspace with natural language. Schedule meetings, organize deadlines, detect bottlenecks, and break down projects effortlessly.
            </p>
          </div>

          {/* Quick Tabs */}
          <div className="flex flex-wrap gap-2 bg-white/10 backdrop-blur-md p-1.5 rounded-xl border border-white/15">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'chat'
                  ? 'bg-white text-indigo-950 shadow-md font-semibold'
                  : 'text-white/80 hover:text-white hover:bg-white/5'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>AI Chat</span>
            </button>
            <button
              onClick={() => setActiveTab('scheduler')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'scheduler'
                  ? 'bg-white text-indigo-950 shadow-md font-semibold'
                  : 'text-white/80 hover:text-white hover:bg-white/5'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Smart Scheduler</span>
            </button>
            <button
              onClick={() => setActiveTab('optimizer')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'optimizer'
                  ? 'bg-white text-indigo-950 shadow-md font-semibold'
                  : 'text-white/80 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Schedule Optimizer</span>
            </button>
            <button
              onClick={() => setActiveTab('breakdown')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'breakdown'
                  ? 'bg-white text-indigo-950 shadow-md font-semibold'
                  : 'text-white/80 hover:text-white hover:bg-white/5'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Project Roadmap</span>
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: AI CHAT & COPILOT */}
      {activeTab === 'chat' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[650px] overflow-hidden">
          {/* Chat Stream */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl ${
                  msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md'
                  }`}
                >
                  {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Content Bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-xs'
                      : 'bg-slate-100 dark:bg-slate-800/70 text-slate-800 dark:text-slate-100 rounded-tl-xs border border-slate-200/60 dark:border-slate-700/60'
                  }`}
                >
                  <div className="whitespace-pre-line">{msg.text}</div>

                  {/* Embedded Task Card (if task was created) */}
                  {msg.task && (
                    <div className="mt-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">{msg.task.title}</span>
                          {renderPriorityBadge(msg.task.priority)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          {msg.task.dueDateString && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                              {msg.task.dueDateString}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            {msg.task.category}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => onNavigate?.('all')}
                        className="px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <span>View</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Embedded Task List Query Card */}
                  {msg.tasks && msg.tasks.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {msg.tasks.map((t) => (
                        <div
                          key={t._id}
                          className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${t.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            <span className="font-medium text-slate-800 dark:text-slate-200">{t.title}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-500">
                            {t.dueDateString && <span>{t.dueDateString}</span>}
                            {renderPriorityBadge(t.priority)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Embedded Milestones Action Card */}
                  {msg.milestones && msg.milestones.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                      <button
                        onClick={() => handleCreateAllMilestones()}
                        disabled={isBatchCreating}
                        className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
                      >
                        {isBatchCreating ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>Create All {msg.milestones.length} Tasks in Workspace</span>
                      </button>
                    </div>
                  )}

                  {/* Embedded Optimization Apply Card */}
                  {msg.optimization && msg.optimization.suggestedAdjustments?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                      <button
                        onClick={handleApplyOptimization}
                        disabled={isApplyingSchedule}
                        className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
                      >
                        {isApplyingSchedule ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Apply AI Schedule Adjustments</span>
                      </button>
                    </div>
                  )}

                  {/* Suggested Quick Replies */}
                  {msg.suggestedReplies && msg.suggestedReplies.length > 0 && (
                    <div className="mt-3 pt-2 flex flex-wrap gap-1.5">
                      {msg.suggestedReplies.map((replyText, i) => (
                        <button
                          key={i}
                          onClick={() => handleSendMessage(replyText)}
                          className="px-2.5 py-1 text-xs rounded-full bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors"
                        >
                          {replyText}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-1 text-[10px] text-right opacity-60">
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex gap-3 items-center text-slate-500 text-xs py-2">
                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center animate-pulse">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:0.2s]" />
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:0.4s]" />
                  <span className="ml-2 font-medium text-slate-600 dark:text-slate-300">TaskFlow AI is reasoning & scheduling...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder="Type an instruction (e.g., 'Schedule meeting tomorrow 2pm high priority' or 'Plan my day')..."
              className="flex-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim() || isSending}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl shadow-md transition-colors flex items-center justify-center shrink-0"
              title="Send to AI"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: SMART NATURAL LANGUAGE SCHEDULER */}
      {activeTab === 'scheduler' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold text-sm">
              <Sparkles className="w-4 h-4" />
              <span>Natural Language Task Parser</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Describe what you want to schedule
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Type or paste your prompt. The AI will extract the task title, calendar date, priority level, category, and checklist steps automatically.
            </p>

            <div className="relative">
              <textarea
                value={schedulerPrompt}
                onChange={(e) => {
                  setSchedulerPrompt(e.target.value);
                  handleParsePrompt(e.target.value);
                }}
                rows={4}
                placeholder="e.g. Schedule urgent client presentation next Tuesday at 3pm under Work with subtasks prepare slides, send invite, review metrics"
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            {/* Quick Prompt Templates */}
            <div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
                Click to try examples:
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  'Schedule tax payment reminder on 15th April under Finance with high priority',
                  'Team sprint retro every Friday at 4pm with subtasks demo features, review blockers',
                  'Doctor appointment tomorrow at 10am under Personal',
                  'Deploy production release this weekend high priority with subtasks backup db, run migrations, run smoke tests'
                ].map((eg, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSchedulerPrompt(eg);
                      handleParsePrompt(eg);
                    }}
                    className="text-left text-xs bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-300 hover:text-indigo-600 p-2 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
                  >
                    "{eg}"
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Live Preview Card */}
          <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Live AI Interpretation
                </span>
                {isParsing && (
                  <span className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Parsing...
                  </span>
                )}
              </div>

              {parsedDraft ? (
                <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 space-y-3 shadow-xs">
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Task Title</span>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">
                      {parsedDraft.title || 'Untitled'}
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-slate-50 dark:bg-slate-900/70 rounded-lg">
                      <span className="text-[10px] text-slate-400 uppercase block">Scheduled Date</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                        {parsedDraft.dueDateString || 'No date specified'}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-50 dark:bg-slate-900/70 rounded-lg">
                      <span className="text-[10px] text-slate-400 uppercase block">Priority</span>
                      <div className="mt-0.5">{renderPriorityBadge(parsedDraft.priority)}</div>
                    </div>

                    <div className="p-2 bg-slate-50 dark:bg-slate-900/70 rounded-lg">
                      <span className="text-[10px] text-slate-400 uppercase block">Category</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 block">
                        📁 {parsedDraft.category}
                      </span>
                    </div>

                    <div className="p-2 bg-slate-50 dark:bg-slate-900/70 rounded-lg">
                      <span className="text-[10px] text-slate-400 uppercase block">Recurrence</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 block">
                        {parsedDraft.recurrence?.isRecurring ? `🔄 ${parsedDraft.recurrence.frequency}` : 'One-time'}
                      </span>
                    </div>
                  </div>

                  {parsedDraft.subtasks?.length > 0 && (
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
                        Subtasks Checklist ({parsedDraft.subtasks.length})
                      </span>
                      <div className="space-y-1">
                        {parsedDraft.subtasks.map((st, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>{st.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-44 flex flex-col items-center justify-center text-center text-slate-400 p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                  <Lightbulb className="w-8 h-8 mb-2 opacity-50 text-indigo-500" />
                  <p className="text-xs">Type in the left box to preview how TaskFlow AI parses your task in real time.</p>
                </div>
              )}
            </div>

            <button
              onClick={handleConfirmSchedule}
              disabled={!parsedDraft || isScheduling}
              className="mt-6 w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-md transition-colors"
            >
              {isScheduling ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              <span>Confirm & Schedule Task</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: SCHEDULE OPTIMIZER */}
      {activeTab === 'optimizer' && (
        <div className="space-y-6">
          {isLoadingOptimizer ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
              <p className="text-sm">Analyzing task deadlines, workloads, and calendar bottlenecks...</p>
            </div>
          ) : optimizationData ? (
            <div className="space-y-6">
              {/* Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Total Active</span>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    {optimizationData.metrics?.totalActive || 0}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-rose-200 dark:border-rose-900/50 shadow-xs">
                  <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">Overdue Deadlines</span>
                  <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                    {optimizationData.metrics?.overdueCount || 0}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 shadow-xs">
                  <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Due Today</span>
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                    {optimizationData.metrics?.dueTodayCount || 0}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 shadow-xs">
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Unscheduled</span>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                    {optimizationData.metrics?.unscheduledCount || 0}
                  </div>
                </div>
              </div>

              {/* Recommendations and AI Suggestions */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-purple-600" />
                      <span>AI Schedule Recommendations</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Intelligent deadline balancing based on priority and urgency.
                    </p>
                  </div>

                  <button
                    onClick={handleApplyOptimization}
                    disabled={isApplyingSchedule || !optimizationData.suggestedAdjustments?.length}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium text-xs rounded-xl shadow-md transition-colors flex items-center gap-1.5"
                  >
                    {isApplyingSchedule ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Apply All Adjustments</span>
                  </button>
                </div>

                {/* Adjustments List */}
                {optimizationData.suggestedAdjustments?.length > 0 ? (
                  <div className="space-y-2 mt-4">
                    {optimizationData.suggestedAdjustments.map((adj, i) => (
                      <div
                        key={i}
                        className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{adj.title}</span>
                          <span className="text-slate-500 block">{adj.reason}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {adj.currentDueDate && (
                            <span className="line-through text-slate-400">{adj.currentDueDate}</span>
                          )}
                          <ArrowRight className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="font-semibold text-purple-600 dark:text-purple-400 px-2 py-0.5 bg-purple-50 dark:bg-purple-950/70 rounded-md border border-purple-200 dark:border-purple-800">
                            {adj.suggestedDueDateString}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                    🎉 Excellent! Your active tasks are completely up to date with zero scheduling bottlenecks detected.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 4: PROJECT ROADMAP & BREAKDOWN */}
      {activeTab === 'breakdown' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              AI Project Breakdown Generator
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Provide a high-level goal or project initiative. The AI will formulate a multi-phase milestone plan with smart timelines and subtasks.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={goalPrompt}
                onChange={(e) => setGoalPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerateBreakdown()}
                placeholder="e.g. Launch new marketing campaign, Re-architecture payment gateway, Onboard new designer..."
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleGenerateBreakdown}
                disabled={!goalPrompt.trim() || isGeneratingMilestones}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium text-sm rounded-xl shadow-md transition-colors flex items-center justify-center gap-2"
              >
                {isGeneratingMilestones ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                <span>Generate Plan</span>
              </button>
            </div>
          </div>

          {/* Generated Milestones List */}
          {milestones.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Generated Roadmap: {milestones.length} Milestones
                </h3>
                <button
                  onClick={() => handleCreateAllMilestones()}
                  disabled={isBatchCreating}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium text-xs rounded-xl shadow-md transition-colors flex items-center gap-1.5"
                >
                  {isBatchCreating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Add All Milestones to Workspace</span>
                </button>
              </div>

              <div className="space-y-3">
                {milestones.map((m, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-sm text-slate-900 dark:text-white">{m.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {renderPriorityBadge(m.priority)}
                        <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {m.dueDateString}
                        </span>
                      </div>
                    </div>

                    {m.subtasks?.length > 0 && (
                      <div className="pl-8 flex flex-wrap gap-2 pt-1">
                        {m.subtasks.map((st, sIdx) => (
                          <span
                            key={sIdx}
                            className="text-[11px] bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                          >
                            ✓ {st.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
