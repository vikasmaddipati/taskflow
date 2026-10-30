import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AIView } from '../views/AIView';

vi.mock('../services/api', () => ({
  default: {
    post: vi.fn((url) => {
      if (url.includes('/parse')) {
        return Promise.resolve({
          data: {
            success: true,
            draft: {
              title: 'Team Meeting',
              priority: 'high',
              category: 'Work',
              dueDateString: '2026-11-01',
              subtasks: []
            }
          }
        });
      }
      if (url.includes('/chat')) {
        return Promise.resolve({
          data: {
            success: true,
            reply: 'Task scheduled successfully!',
            action: 'task_created'
          }
        });
      }
      if (url.includes('/optimize')) {
        return Promise.resolve({
          data: {
            success: true,
            analysis: {
              metrics: { totalActive: 5, overdueCount: 1, dueTodayCount: 2, unscheduledCount: 2 },
              suggestedAdjustments: []
            }
          }
        });
      }
      return Promise.resolve({ data: { success: true } });
    })
  }
}));

describe('AIView Component', () => {
  it('renders AI Assistant header and all 4 mode tabs', () => {
    render(<AIView onTaskCreated={vi.fn()} onNavigate={vi.fn()} showToast={vi.fn()} />);

    expect(screen.getByText('AI Task Manager')).toBeInTheDocument();
    expect(screen.getByText('AI Chat')).toBeInTheDocument();
    expect(screen.getByText('Smart Scheduler')).toBeInTheDocument();
    expect(screen.getByText('Schedule Optimizer')).toBeInTheDocument();
    expect(screen.getByText('Project Roadmap')).toBeInTheDocument();
  });

  it('switches to Smart Scheduler tab when clicked', async () => {
    render(<AIView onTaskCreated={vi.fn()} onNavigate={vi.fn()} showToast={vi.fn()} />);

    const schedulerTabBtn = screen.getByText('Smart Scheduler');
    fireEvent.click(schedulerTabBtn);

    expect(screen.getByText('Describe what you want to schedule')).toBeInTheDocument();
    expect(screen.getByText('Confirm & Schedule Task')).toBeInTheDocument();
  });

  it('switches to Project Roadmap tab when clicked', async () => {
    render(<AIView onTaskCreated={vi.fn()} onNavigate={vi.fn()} showToast={vi.fn()} />);

    const breakdownTabBtn = screen.getByText('Project Roadmap');
    fireEvent.click(breakdownTabBtn);

    expect(screen.getByText('AI Project Breakdown Generator')).toBeInTheDocument();
    expect(screen.getByText('Generate Plan')).toBeInTheDocument();
  });
});
