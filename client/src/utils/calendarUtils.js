/**
 * calendarUtils.js
 * Utilities for generating Google Calendar links and iCal (.ics) files for tasks.
 */

/**
 * Builds a direct Google Calendar event creation URL for a given task.
 * @param {Object} task - TaskMate task object
 * @returns {string} URL to open Google Calendar with pre-populated event details
 */
export function buildGoogleCalendarUrl(task) {
  if (!task) return 'https://calendar.google.com/calendar/render?action=TEMPLATE';

  const title = encodeURIComponent(task.title || 'TaskMate Task');

  let detailsText = '';
  if (task.description) {
    detailsText += `${task.description.trim()}\n\n`;
  }
  detailsText += `Priority: ${(task.priority || 'Medium').toUpperCase()}\n`;
  detailsText += `Category: ${task.category || 'General'}\n`;
  detailsText += `Status: ${(task.status || 'pending').replace('_', ' ').toUpperCase()}\n`;

  if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
    detailsText += '\nChecklist:\n';
    task.subtasks.forEach((s) => {
      detailsText += `${s.isCompleted ? '[x]' : '[ ]'} ${s.title || 'Subtask'}\n`;
    });
  }

  detailsText += '\nView task in TaskMate: https://taskflow.zerosyntax.in/tasks';
  const details = encodeURIComponent(detailsText);
  const location = encodeURIComponent('TaskMate (https://taskflow.zerosyntax.in)');

  let datesParam = '';
  const dateInput = task.dueDateString || task.dueDate;

  if (dateInput) {
    const rawDate = typeof dateInput === 'string'
      ? dateInput.substring(0, 10)
      : new Date(dateInput).toISOString().substring(0, 10);

    const [y, m, d] = rawDate.split('-').map(Number);

    if (task.dueTime && /^\d{1,2}:\d{2}$/.test(task.dueTime)) {
      const [hh, mm] = task.dueTime.split(':').map(Number);
      const start = new Date(y, m - 1, d, hh, mm, 0);
      const end = new Date(start.getTime() + 30 * 60 * 1000); // 30-minute block

      if (!isNaN(start.getTime())) {
        const sStr = start.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const eStr = end.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        datesParam = `&dates=${sStr}/${eStr}`;
      }
    } else {
      // All-day event
      const nextDay = new Date(y, m - 1, d + 1);
      const sStr = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
      const eStr = `${nextDay.getFullYear()}${String(nextDay.getMonth() + 1).padStart(2, '0')}${String(nextDay.getDate()).padStart(2, '0')}`;
      datesParam = `&dates=${sStr}/${eStr}`;
    }
  }

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}${datesParam}&details=${details}&location=${location}`;
}

/**
 * Opens Google Calendar directly in a new tab.
 * @param {Object} task - TaskMate task object
 */
export function openInGoogleCalendar(task) {
  const url = buildGoogleCalendarUrl(task);
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
