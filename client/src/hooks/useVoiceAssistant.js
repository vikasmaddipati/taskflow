import { useState, useRef, useEffect, useCallback } from 'react';
import voiceService from '../services/voiceService';
import api, { getBaseURL } from '../services/api';
import {
  extractWakeCommand,
  parseVoiceIntent,
  executeVoiceIntent,
  startTaskConversation,
  advanceTaskConversation
} from '../services/voiceCommandEngine';

const WAKE_STORAGE_KEY = 'tm_voice_wake';

const WAKE_GREETINGS = [
  'Hey! How can I help?',
  "Yes, I'm listening. Go ahead.",
  'Hi there! What would you like me to do?'
];

export const useVoiceAssistant = ({ isAuthenticated, context }) => {
  const [voiceState, setVoiceState] = useState('idle');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isWakeMode, setIsWakeMode] = useState(() => {
    try {
      return localStorage.getItem(WAKE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isAwake, setIsAwake] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const contextRef = useRef(context);
  contextRef.current = context;

  const isWakeModeRef = useRef(isWakeMode);
  isWakeModeRef.current = isWakeMode;

  const isAwakeRef = useRef(isAwake);
  isAwakeRef.current = isAwake;

  const lastTaskRef = useRef(null);
  const pendingActionRef = useRef(null);
  const taskConversationRef = useRef(null);
  const isSubmittingConvRef = useRef(false);
  const wakeGreetIdxRef = useRef(0);

  const awakeTimerRef = useRef(null);
  const responseTimerRef = useRef(null);

  const syncNativeSession = useCallback(() => {
    if (!voiceService.isBackgroundSupported()) return;
    if (!isAuthenticated) {
      voiceService.clearSession();
      return;
    }
    try {
      const token = localStorage.getItem('tm_token') || localStorage.getItem('tm_mobile_token') || '';
      const refreshToken = localStorage.getItem('tm_refresh_token') || '';
      const orgId = contextRef.current?.currentOrg?._id || localStorage.getItem('tm_org_id') || '';
      const workspaceId = contextRef.current?.currentWorkspace?._id || localStorage.getItem('tm_workspace_id') || '';
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      voiceService.syncSession({
        baseUrl: getBaseURL(),
        token,
        refreshToken,
        orgId,
        workspaceId,
        timezone
      });
    } catch {
      // ignore storage errors
    }
  }, [isAuthenticated]);

  const applyNativeTokens = useCallback((data) => {
    try {
      if (data?.token) {
        localStorage.setItem('tm_token', data.token);
        localStorage.setItem('tm_mobile_token', data.token);
      }
      if (data?.refreshToken) {
        localStorage.setItem('tm_refresh_token', data.refreshToken);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const clearAwakeWindow = useCallback(() => {
    clearTimeout(awakeTimerRef.current);
    isAwakeRef.current = false;
    setIsAwake(false);
  }, []);

  const openAwakeWindow = useCallback((durationMs = 12000) => {
    clearTimeout(awakeTimerRef.current);
    isAwakeRef.current = true;
    setIsAwake(true);
    awakeTimerRef.current = setTimeout(() => {
      isAwakeRef.current = false;
      pendingActionRef.current = null;
      taskConversationRef.current = null;
      isSubmittingConvRef.current = false;
      setIsAwake(false);
    }, durationMs);
  }, []);

  const presentResponse = useCallback(async (speech, toastType = 'info') => {
    if (!speech) return;
    clearTimeout(responseTimerRef.current);
    setLastResponse(speech);
    setErrorMessage('');
    if (toastType && contextRef.current?.showToast) {
      contextRef.current.showToast({ type: toastType, message: speech });
    }
    setVoiceState('speaking');
    await voiceService.speak(speech);
    setVoiceState(voiceService.isListening ? 'listening' : 'idle');
    responseTimerRef.current = setTimeout(() => {
      setLastResponse('');
    }, 8000);
  }, []);

  const stopVoice = useCallback(async () => {
    clearAwakeWindow();
    pendingActionRef.current = null;
    taskConversationRef.current = null;
    isSubmittingConvRef.current = false;
    isWakeModeRef.current = false;
    setIsWakeMode(false);
    try {
      localStorage.setItem(WAKE_STORAGE_KEY, 'false');
    } catch {
      // ignore
    }
    await voiceService.stopBackgroundVoice();
    await voiceService.stopListening();
    await voiceService.stopSpeaking();
    setPartialText('');
    setVoiceState('idle');
  }, [clearAwakeWindow]);

  const startSessionRef = useRef(null);

  const handleRecognizedText = useCallback(async (transcript, alternatives = [], bypassWake = false) => {
    setPartialText('');
    setLastTranscript(transcript);

    const requireWakeWord = !bypassWake && isWakeModeRef.current && !isAwakeRef.current;
    const { woke, wakeOnly, command } = extractWakeCommand(transcript, requireWakeWord, alternatives);

    if (!woke) return;

    if (wakeOnly) {
      openAwakeWindow();
      const greet = WAKE_GREETINGS[wakeGreetIdxRef.current % WAKE_GREETINGS.length];
      wakeGreetIdxRef.current += 1;
      await presentResponse(greet, 'info');
      if (!isWakeModeRef.current && !voiceService.isListening) {
        startSessionRef.current?.(false);
      }
      return;
    }

    clearAwakeWindow();
    setVoiceState('processing');

    try {
      const ctx = {
        ...contextRef.current,
        lastTask: lastTaskRef.current,
        setLastTask: (task) => {
          lastTaskRef.current = task;
        },
        openVoiceHelp: () => setIsHelpOpen(true),
        stopVoice
      };

      // If a multi-turn task conversation is active, continue it instead of parsing a fresh command
      if (taskConversationRef.current) {
        if (isSubmittingConvRef.current) {
          return;
        }
        isSubmittingConvRef.current = true;
        try {
          const convRes = await advanceTaskConversation(taskConversationRef.current, command, ctx);
          taskConversationRef.current = convRes.nextState || null;
          if (convRes.lastTask) {
            lastTaskRef.current = convRes.lastTask;
          }

          await presentResponse(convRes.speech, convRes.toastType || 'info');

          if (convRes.nextState) {
            openAwakeWindow(25000);
            if (!isWakeModeRef.current && !voiceService.isListening) {
              startSessionRef.current?.(false);
            }
          }
        } finally {
          isSubmittingConvRef.current = false;
        }
        return;
      }

      let intent;
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;

      if (pending && !/^(?:cancel|never mind|stop)$/i.test(command.trim())) {
        if (pending === 'WORKSPACE_CREATE') {
          intent = { type: 'WORKSPACE_CREATE', name: command.trim() };
        } else {
          intent = { type: pending, query: command.trim() };
        }
      } else {
        intent = parseVoiceIntent(command);
      }

      // Start conversational flow for task creation/scheduling instead of immediately creating
      if (
        intent.type === 'TASK_CREATE' ||
        intent.type === 'TASK_SCHEDULE' ||
        intent.type === 'OPEN_CREATE_TASK_MODAL' ||
        intent.type === 'OPEN_SCHEDULER'
      ) {
        const mode = (intent.type === 'TASK_SCHEDULE' || intent.type === 'OPEN_SCHEDULER') ? 'schedule' : 'create';
        const conv = startTaskConversation(intent.prompt || '', mode);
        taskConversationRef.current = conv.state;

        await presentResponse(conv.speech, 'info');
        openAwakeWindow(25000);
        if (!isWakeModeRef.current && !voiceService.isListening) {
          startSessionRef.current?.(false);
        }
        return;
      }

      const result = await executeVoiceIntent(intent, ctx);

      if (result?.lastTask) {
        lastTaskRef.current = result.lastTask;
      }

      if (result?.pendingAction) {
        pendingActionRef.current = result.pendingAction;
      }

      await presentResponse(result?.speech || 'Done.', result?.toastType || 'success');

      if (result?.keepListening) {
        openAwakeWindow(15000);
        if (!isWakeModeRef.current && !voiceService.isListening) {
          startSessionRef.current?.(false);
        }
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Sorry, I could not complete that voice command.';
      setErrorMessage(msg);
      await presentResponse(msg, 'error');
    }
  }, [clearAwakeWindow, openAwakeWindow, presentResponse, stopVoice]);

  const startSession = useCallback(async (continuous) => {
    setErrorMessage('');
    setPartialText('');
    syncNativeSession();

    if (continuous && voiceService.isBackgroundSupported()) {
      const started = await voiceService.startBackgroundVoice({
        onState: (nextState, errMsg) => {
          if (nextState === 'stopped') {
            isWakeModeRef.current = false;
            setIsWakeMode(false);
            try {
              localStorage.setItem(WAKE_STORAGE_KEY, 'false');
            } catch {
              // ignore
            }
            setVoiceState('idle');
            return;
          }
          setVoiceState(nextState);
          if (errMsg) setErrorMessage(errMsg);
        },
        onPartial: (text) => setPartialText(text),
        onBackgroundResult: (text) => {
          setPartialText('');
          setLastTranscript(text);
        },
        onBackgroundResponse: (speech) => {
          clearTimeout(responseTimerRef.current);
          setLastResponse(speech);
          setErrorMessage('');
          contextRef.current?.showToast?.({ type: 'success', message: speech });
          responseTimerRef.current = setTimeout(() => setLastResponse(''), 8000);
        },
        onDataUpdated: () => {
          contextRef.current?.refreshData?.();
        },
        onUiAction: async (action, target) => {
          const ctx = contextRef.current || {};
          if (action === 'navigate' && target) {
            ctx.navigateToView?.(target);
          } else if (action === 'copilot') {
            ctx.setAiCopilotOpen?.(target === 'open');
          } else if (action === 'sidebar') {
            ctx.setMobileSidebarOpen?.(target === 'open');
          } else if (action === 'open_create_task') {
            ctx.openCreateModal?.();
          } else if (action === 'open_edit_task' && target) {
            try {
              const res = await api.get(`/tasks/${target}`);
              if (res.data?.task) {
                ctx.openEditModal?.(res.data.task);
              }
            } catch {
              // ignore fetch error
            }
          } else if (action === 'open_create_org') {
            ctx.openCreateOrgModal?.();
          } else if (action === 'open_voice_help') {
            setIsHelpOpen(true);
          } else if (action === 'refresh') {
            ctx.refreshData?.();
          }
        },
        onTokensUpdated: (data) => applyNativeTokens(data),
        onError: (msg) => setErrorMessage(msg)
      });
      return started;
    }

    const started = await voiceService.startListening({
      continuous,
      onState: (nextState, errMsg) => {
        setVoiceState(nextState);
        if (errMsg) setErrorMessage(errMsg);
      },
      onPartial: (text) => setPartialText(text),
      onResult: (text, matches) => {
        handleRecognizedText(text, matches, false);
      },
      onError: (msg) => setErrorMessage(msg)
    });
    return started;
  }, [handleRecognizedText, syncNativeSession]);

  startSessionRef.current = startSession;

  const toggleSingleListen = useCallback(async () => {
    setIsPanelOpen(true);
    if (voiceState === 'listening') {
      if (isWakeModeRef.current) {
        await stopVoice();
      } else {
        await voiceService.stopListening();
        setVoiceState('idle');
      }
      return;
    }
    await startSession(isWakeModeRef.current);
  }, [voiceState, startSession, stopVoice]);

  const toggleWakeMode = useCallback(async () => {
    setIsPanelOpen(true);
    const next = !isWakeModeRef.current;
    isWakeModeRef.current = next;
    setIsWakeMode(next);
    try {
      localStorage.setItem(WAKE_STORAGE_KEY, String(next));
    } catch {
      // ignore
    }

    if (next) {
      const ok = await startSession(true);
      if (!ok) {
        isWakeModeRef.current = false;
        setIsWakeMode(false);
        try {
          localStorage.setItem(WAKE_STORAGE_KEY, 'false');
        } catch {
          // ignore
        }
      }
    } else {
      await stopVoice();
    }
  }, [startSession, stopVoice]);

  const runTextCommand = useCallback(async (text) => {
    setIsPanelOpen(true);
    await handleRecognizedText(text, [text], true);
  }, [handleRecognizedText]);

  const dismissResponse = useCallback(() => {
    clearTimeout(responseTimerRef.current);
    setLastResponse('');
    setErrorMessage('');
    if (voiceState !== 'listening' && !isWakeModeRef.current) {
      setIsPanelOpen(false);
    }
  }, [voiceState]);

  useEffect(() => {
    syncNativeSession();
  }, [syncNativeSession, context?.currentOrg?._id, context?.currentWorkspace?._id]);

  useEffect(() => {
    const handleTokensUpdated = () => {
      syncNativeSession();
    };
    window.addEventListener('auth:tokens-updated', handleTokensUpdated);
    return () => window.removeEventListener('auth:tokens-updated', handleTokensUpdated);
  }, [syncNativeSession]);

  useEffect(() => {
    if (!isAuthenticated) {
      voiceService.stopBackgroundVoice();
      voiceService.stopListening();
      voiceService.stopSpeaking();
      voiceService.clearSession();
      clearAwakeWindow();
      pendingActionRef.current = null;
      taskConversationRef.current = null;
      isSubmittingConvRef.current = false;
      lastTaskRef.current = null;
      setVoiceState('idle');
      setIsPanelOpen(false);
      return;
    }

    if (isWakeModeRef.current) {
      startSession(true);
    }

    const handleVisibility = async () => {
      if (document.visibilityState === 'visible') {
        if (voiceService.isBackgroundSupported()) {
          const nativeSession = await voiceService.getSyncedSession();
          if (nativeSession?.token) {
            applyNativeTokens(nativeSession);
          }
          const running = await voiceService.isBackgroundVoiceRunning();
          if (!running && isWakeModeRef.current) {
            isWakeModeRef.current = false;
            setIsWakeMode(false);
            try {
              localStorage.setItem(WAKE_STORAGE_KEY, 'false');
            } catch {
              // ignore
            }
            setVoiceState('idle');
          }
        }
        syncNativeSession();
        contextRef.current?.refreshData?.();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearTimeout(awakeTimerRef.current);
      clearTimeout(responseTimerRef.current);
      if (!isWakeModeRef.current) {
        voiceService.stopListening();
      }
    };
  }, [isAuthenticated, startSession, clearAwakeWindow, syncNativeSession, applyNativeTokens]);

  return {
    isPanelOpen,
    voiceState,
    isWakeMode,
    isAwake,
    partialText,
    lastTranscript,
    lastResponse,
    errorMessage,
    isHelpOpen,
    setIsHelpOpen,
    toggleSingleListen,
    toggleWakeMode,
    runTextCommand,
    dismissResponse
  };
};
