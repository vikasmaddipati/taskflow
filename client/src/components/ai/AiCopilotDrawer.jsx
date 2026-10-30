import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Maximize2
} from 'lucide-react';
import api from '../../services/api';

export const AiCopilotDrawer = ({
  isOpen,
  onClose,
  onOpenFullView,
  onTaskAction,
  showToast
}) => {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'ai',
      text: '👋 Hi! Need quick help scheduling or managing tasks? Type what you need!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedReplies: [
        '📅 Plan my day',
        '⚡ Schedule: Standup tomorrow 9am',
        '⚠️ Show overdue'
      ]
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  if (!isOpen) return null;

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
          suggestedReplies: res.data.suggestedReplies || [],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages((prev) => [...prev, aiMsg]);

        if (['task_created', 'task_completed', 'schedule_optimized'].includes(res.data.action)) {
          onTaskAction?.();
        }
      }
    } catch (err) {
      const errorMsg = {
        id: String(Date.now() + 1),
        sender: 'ai',
        text: `⚠️ ${err.response?.data?.message || 'Error communicating with AI assistant'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col transition-transform transform duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">AI Copilot</h3>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">● Online & Ready</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onOpenFullView && (
            <button
              onClick={() => {
                onClose();
                onOpenFullView();
              }}
              title="Open full AI Command Center"
              className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3 text-xs">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 max-w-[88%] ${m.sender === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
          >
            <div
              className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white ${
                m.sender === 'user' ? 'bg-indigo-600' : 'bg-purple-600'
              }`}
            >
              {m.sender === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
            </div>

            <div
              className={`p-2.5 rounded-xl whitespace-pre-line leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-tl-xs border border-slate-200/50 dark:border-slate-700/50'
              }`}
            >
              <div>{m.text}</div>

              {m.suggestedReplies?.length > 0 && (
                <div className="mt-2 pt-1 flex flex-wrap gap-1">
                  {m.suggestedReplies.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(r)}
                      className="px-2 py-0.5 text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-md border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isSending && (
          <div className="flex items-center gap-2 text-slate-500 text-[11px] py-1">
            <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
            <span>AI scheduling...</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
          placeholder="Ask AI to schedule, plan, or organize..."
          className="flex-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || isSending}
          className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
