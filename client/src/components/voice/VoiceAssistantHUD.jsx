import React, { useState } from 'react';
import { Mic, MicOff, Volume2, Radio, HelpCircle, X, Sparkles, Send } from 'lucide-react';
import { VOICE_COMMAND_EXAMPLES } from '../../services/voiceCommandEngine';

export const VoiceAssistantHUD = ({
  isPanelOpen = false,
  voiceState,
  isWakeMode,
  isAwake,
  partialText,
  lastTranscript,
  lastResponse,
  errorMessage,
  isHelpOpen,
  onToggleSingleListen,
  onToggleWakeMode,
  onCloseHelp,
  onOpenHelp,
  onDismissResponse,
  onRunExampleCommand
}) => {
  const [commandInput, setCommandInput] = useState('');

  const showPanel =
    isPanelOpen ||
    voiceState === 'listening' ||
    voiceState === 'processing' ||
    voiceState === 'speaking' ||
    isWakeMode ||
    Boolean(lastResponse) ||
    Boolean(errorMessage);

  const handleQuickSubmit = (e) => {
    e.preventDefault();
    const trimmed = commandInput.trim();
    if (!trimmed) return;
    setCommandInput('');
    onRunExampleCommand?.(trimmed);
  };

  return (
    <>
      {showPanel && (
        <div
          className="fixed left-3 right-3 sm:left-auto sm:right-24 sm:w-96 z-40 bottom-[calc(5.25rem+var(--app-safe-bottom))] sm:bottom-[calc(1.5rem+var(--app-safe-bottom))] animate-in fade-in slide-in-from-bottom-4 duration-200"
          role="region"
          aria-label="TaskMate Voice Assistant"
        >
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-indigo-200 dark:border-indigo-800 rounded-2xl shadow-2xl p-3.5 space-y-2.5">
            {/* Header row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={onToggleSingleListen}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all shrink-0 ${
                    voiceState === 'listening'
                      ? 'bg-emerald-500 shadow-md shadow-emerald-500/30 animate-pulse'
                      : voiceState === 'speaking'
                      ? 'bg-indigo-600'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                  title={voiceState === 'listening' ? 'Stop listening' : 'Tap to speak'}
                  aria-label={voiceState === 'listening' ? 'Stop voice listening' : 'Start voice listening'}
                >
                  {voiceState === 'speaking' ? (
                    <Volume2 className="w-4 h-4" />
                  ) : voiceState === 'listening' ? (
                    <Mic className="w-4 h-4" />
                  ) : (
                    <MicOff className="w-4 h-4" />
                  )}
                </button>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {isAwake
                        ? 'Mate Awake — Speak command'
                        : voiceState === 'listening'
                        ? isWakeMode
                          ? 'Say "Mate" + command...'
                          : 'Listening...'
                        : voiceState === 'processing'
                        ? 'Executing command...'
                        : voiceState === 'speaking'
                        ? 'Speaking response...'
                        : 'Mate Voice Ready'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {partialText || lastTranscript || 'Tap mic or enable Wake ON for "Mate"'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={onToggleWakeMode}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition-colors ${
                    isWakeMode
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                  title='Toggle continuous "Task Flow" background wake-word listening'
                >
                  <Radio className="w-3 h-3" />
                  <span>{isWakeMode ? 'Wake ON' : 'Wake OFF'}</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenHelp}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
                  title="Voice command guide"
                  aria-label="Voice command guide"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onDismissResponse}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Close voice panel"
                  aria-label="Dismiss voice notification"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Spoken / visual response */}
            {lastResponse && (
              <div className="px-3 py-2 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 text-xs text-slate-800 dark:text-slate-200 flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{lastResponse}</span>
              </div>
            )}

            {errorMessage && (
              <div className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
                {errorMessage}
              </div>
            )}

            {/* Quick command input fallback */}
            <form onSubmit={handleQuickSubmit} className="flex items-center gap-1.5">
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder='Type or speak: "Task Flow schedule a task name PYTHON"'
                className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30"
              />
              <button
                type="submit"
                disabled={!commandInput.trim()}
                className="p-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors shrink-0"
                aria-label="Run voice command"
                title="Run command"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Voice Command Reference Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    TaskMate Voice Commands
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Say &ldquo;Mate&rdquo; followed by any command (enable Wake ON for background apps), or tap an example below.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseHelp}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close voice command guide"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {VOICE_COMMAND_EXAMPLES.map((section) => (
                <div key={section.group} className="space-y-1.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    {section.group}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {section.examples.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => {
                          onRunExampleCommand?.(ex);
                          onCloseHelp?.();
                        }}
                        className="text-left text-xs px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-950/50 border border-slate-200 dark:border-slate-700 transition-colors"
                      >
                        &ldquo;{ex}&rdquo;
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
