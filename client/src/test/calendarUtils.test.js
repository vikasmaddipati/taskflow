import { describe, it, expect, vi } from 'vitest';
import { buildGoogleCalendarUrl, openInGoogleCalendar } from '../utils/calendarUtils';

describe('calendarUtils', () => {
  it('builds a valid Google Calendar URL for timed tasks', () => {
    const task = {
      title: 'Review Sprint Deliverables',
      description: 'Check frontend PRs and backend APIs',
      dueDateString: '2026-11-25',
      dueTime: '15:30',
      priority: 'high',
      category: 'Work',
      status: 'pending',
      subtasks: [
        { title: 'Check API test coverage', isCompleted: true },
        { title: 'Merge Play Store branch', isCompleted: false }
      ]
    };

    const url = buildGoogleCalendarUrl(task);
    expect(url).toContain('https://calendar.google.com/calendar/render?action=TEMPLATE');
    expect(url).toContain('text=Review%20Sprint%20Deliverables');
    expect(url).toContain('dates=');
    expect(url).toContain('details=');
    expect(url).toContain('location=TaskMate');
    expect(url).toContain('Checklist');
  });

  it('builds an all-day event Google Calendar URL when dueTime is absent', () => {
    const task = {
      title: 'Submit Tax Audit Report',
      dueDateString: '2026-12-01',
      priority: 'urgent',
      status: 'pending'
    };

    const url = buildGoogleCalendarUrl(task);
    expect(url).toContain('dates=20261201/20261202');
  });

  it('safely handles missing task or dates', () => {
    const emptyUrl = buildGoogleCalendarUrl(null);
    expect(emptyUrl).toContain('https://calendar.google.com/calendar/render?action=TEMPLATE');
  });

  it('invokes window.open with proper attributes', () => {
    const originalOpen = window.open;
    window.open = vi.fn();

    const task = { title: 'Test Task' };
    openInGoogleCalendar(task);

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('calendar.google.com'),
      '_blank',
      'noopener,noreferrer'
    );

    window.open = originalOpen;
  });
});
