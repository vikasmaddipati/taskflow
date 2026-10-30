import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../components/layout/Sidebar';

describe('Sidebar Component (Navigation & Badge Metrics)', () => {
  const defaultStats = {
    total: 15,
    dueToday: 4,
    completed: 8,
    completionRate: 53
  };

  it('renders all core navigation items', () => {
    render(
      <Sidebar
        currentView="dashboard"
        onSelectView={vi.fn()}
        isMobileOpen={false}
        onCloseMobile={vi.fn()}
        stats={defaultStats}
      />
    );

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    expect(screen.getByText('All Tasks')).toBeInTheDocument();
    expect(screen.getByText('Kanban Board')).toBeInTheDocument();
    expect(screen.getByText('My Day')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Team & Members')).toBeInTheDocument();
    expect(screen.getByText('Billing & Plans')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Trash & Recovery')).toBeInTheDocument();
  });

  it('displays badge counts for tasks, due today, and completed', () => {
    render(
      <Sidebar
        currentView="dashboard"
        onSelectView={vi.fn()}
        isMobileOpen={false}
        onCloseMobile={vi.fn()}
        stats={defaultStats}
      />
    );

    expect(screen.getByText('15')).toBeInTheDocument(); // total tasks badge
    expect(screen.getByText('4')).toBeInTheDocument();  // due today badge
    expect(screen.getByText('8')).toBeInTheDocument();  // completed badge
  });

  it('calls onSelectView when a navigation item is clicked', async () => {
    const user = userEvent.setup();
    const onSelectView = vi.fn();

    render(
      <Sidebar
        currentView="dashboard"
        onSelectView={onSelectView}
        isMobileOpen={false}
        onCloseMobile={vi.fn()}
        stats={defaultStats}
      />
    );

    const tasksButton = screen.getByText('All Tasks');
    await user.click(tasksButton);

    expect(onSelectView).toHaveBeenCalledWith('all');
  });

  it('highlights currently active view', () => {
    render(
      <Sidebar
        currentView="today"
        onSelectView={vi.fn()}
        isMobileOpen={false}
        onCloseMobile={vi.fn()}
        stats={defaultStats}
      />
    );

    const myDayBtn = screen.getByText('My Day').closest('button');
    expect(myDayBtn).toHaveClass('bg-indigo-600');
  });
});
