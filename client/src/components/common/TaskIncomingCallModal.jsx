import React, { useState, useEffect, useRef } from 'react';
import {
  PhoneCall,
  PhoneOff,
  Phone,
  Volume2,
  VolumeX,
  CheckCircle2,
  Clock,
  Sparkles,
  RotateCcw,
  Tag,
  ShieldAlert
} from 'lucide-react';
import voiceService from '../../services/voiceService';
import alarmAudioService from '../../services/alarmAudioService';

export const TaskIncomingCallModal = ({
  task,
  isOpen,
  onDecline,
  onComplete,
  onSnooze
}) => {
  const [callState, setCallState] = useState('ringing'); // 'ringing' | 'connected'
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState('');
  const callTimerRef = useRef(null);

  // Reset call state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCallState('ringing');
      setCallDuration(0);
      setIsMuted(false);
      setTranscript('');
    } else {
      setCallState('ringing');
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    }
  }, [isOpen]);

  // Handle call timer when connected
  useEffect(() => {
    if (callState === 'connected') {
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [callState]);

  if (!isOpen || !task) return null;

  const formatSeconds = (sec) => {
    const mins = Math.floor(sec / 60);
    const remaining = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  };

  // Format due time display
  const formatTimeDisplay = () => {
    if (task.dueTime) {
      const [h, m] = task.dueTime.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const period = h >= 12 ? 'PM' : 'AM';
        const displayHours = h % 12 || 12;
        return `${displayHours}:${String(m).padStart(2, '0')} ${period}`;
      }
      return task.dueTime;
    }
    return task.dueDateString || 'Today';
  };

  // Answer the incoming phone call
  const handleAnswerCall = async () => {
    alarmAudioService.stopAlarm();
    alarmAudioService.playCallConnectedTone();
    setCallState('connected');

    const voiceMessage = `Hello! This is an automated telephone call from TaskFlow. We are calling to inform you that your task: "${task.title}" has completed its scheduled due time. Please press complete or snooze to manage this task.`;
    setTranscript(voiceMessage);

    try {
      await voiceService.speak(voiceMessage);
    } catch {
      // speech synthesis error handled gracefully
    }
  };

  // Decline call
  const handleDeclineCall = () => {
    alarmAudioService.stopAlarm();
    voiceService.stopSpeaking();
    onDecline?.();
  };

  // Complete task from call
  const handleCompleteCall = async () => {
    alarmAudioService.stopAlarm();
    voiceService.stopSpeaking();
    await onComplete?.(task);
  };

  // Snooze task from call
  const handleSnoozeCall = () => {
    alarmAudioService.stopAlarm();
    voiceService.stopSpeaking();
    onSnooze?.(task);
  };

  // Mute ringtone
  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        alarmAudioService.stopAlarm();
      } else if (callState === 'ringing') {
        alarmAudioService.startAlarm();
      }
      return next;
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-call-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xl animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-700/60 shadow-2xl shadow-indigo-950/50 text-white">
        {/* Top Phone Sensor Bar */}
        <div className="pt-4 flex justify-center">
          <div className="w-20 h-1.5 rounded-full bg-slate-800" />
        </div>

        {/* Content Container */}
        <div className="p-6 sm:p-8 flex flex-col items-center text-center">
          {/* Pulsing Avatar / Caller Icon */}
          <div className="relative my-4">
            <div
              className={`flex items-center justify-center w-24 h-24 rounded-full transition-all duration-300 ${
                callState === 'ringing'
                  ? 'bg-gradient-to-tr from-amber-500 to-rose-500 shadow-xl shadow-rose-500/30'
                  : 'bg-gradient-to-tr from-emerald-500 to-teal-500 shadow-xl shadow-emerald-500/30'
              }`}
            >
              {callState === 'ringing' ? (
                <PhoneCall className="w-11 h-11 text-white animate-bounce" />
              ) : (
                <Phone className="w-11 h-11 text-white" />
              )}
            </div>

            {/* Ripple rings while ringing */}
            {callState === 'ringing' && (
              <>
                <span className="absolute inset-0 rounded-full border-2 border-rose-400/50 animate-ping" />
                <span className="absolute -inset-2 rounded-full border border-amber-400/30 animate-pulse" />
              </>
            )}
          </div>

          {/* Caller Details */}
          <div className="space-y-1 mt-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <ShieldAlert className="w-3.5 h-3.5" />
              {callState === 'ringing' ? 'Incoming Deadline Phone Call' : 'Call Connected'}
            </div>

            <h2 id="phone-call-title" className="text-2xl font-bold tracking-tight text-white pt-1">
              TaskFlow Automated Calling
            </h2>

            <p className="text-xs text-slate-400 font-medium">
              {callState === 'ringing' ? 'Due Date & Time Completed' : `Connected • ${formatSeconds(callDuration)}`}
            </p>
          </div>

          {/* Task Summary Card */}
          <div className="w-full mt-6 p-4 rounded-2xl bg-slate-800/60 border border-slate-700/80 text-left">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {task.priority || 'Medium'} Priority
              </span>
              {task.category && (
                <span className="text-[11px] font-medium text-slate-300 bg-slate-700/70 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Tag className="w-3 h-3 text-slate-400" />
                  {task.category}
                </span>
              )}
              <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md flex items-center gap-1 border border-amber-500/20">
                <Clock className="w-3 h-3" />
                Due: {formatTimeDisplay()}
              </span>
            </div>

            <h3 className="text-base font-semibold text-white break-words mt-1">
              {task.title}
            </h3>

            {task.description && (
              <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                {task.description}
              </p>
            )}
          </div>

          {/* Connected Call Voice Transcript Box */}
          {callState === 'connected' && (
            <div className="w-full mt-4 p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/50 text-left text-xs text-indigo-200 animate-in fade-in">
              <div className="flex items-center gap-1.5 text-indigo-400 font-semibold mb-1">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span>Automated Voice Speaking...</span>
              </div>
              <p className="text-xs leading-relaxed italic text-indigo-100">
                "{transcript}"
              </p>
            </div>
          )}

          {/* Call Controls & Action Buttons */}
          <div className="w-full mt-8">
            {callState === 'ringing' ? (
              /* Ringing State: Decline (Red) or Answer (Green) */
              <div className="flex items-center justify-around gap-6">
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDeclineCall}
                    className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-rose-600/40 text-white cursor-pointer"
                    title="Decline Call"
                  >
                    <PhoneOff className="w-7 h-7" />
                  </button>
                  <span className="text-xs font-semibold text-slate-400">Decline</span>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                    title={isMuted ? 'Unmute Ringtone' : 'Silence Ringtone'}
                  >
                    {isMuted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <span className="text-[11px] text-slate-500">{isMuted ? 'Unmute' : 'Mute'}</span>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAnswerCall}
                    className="relative w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all flex items-center justify-center shadow-xl shadow-emerald-600/50 text-white cursor-pointer"
                    title="Answer Call"
                  >
                    <Phone className="w-7 h-7 animate-pulse" />
                    <span className="absolute -inset-1 rounded-full border-2 border-emerald-400 animate-ping opacity-60" />
                  </button>
                  <span className="text-xs font-semibold text-emerald-400">Answer</span>
                </div>
              </div>
            ) : (
              /* Connected In-Call State: Mark Complete, Snooze, Hang Up */
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleCompleteCall}
                    className="py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Complete Task
                  </button>

                  <button
                    type="button"
                    onClick={handleSnoozeCall}
                    className="py-3 px-4 rounded-2xl bg-amber-600/90 hover:bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-600/30 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Snooze (5m)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDeclineCall}
                  className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
                >
                  <PhoneOff className="w-4 h-4" />
                  End Call
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskIncomingCallModal;
