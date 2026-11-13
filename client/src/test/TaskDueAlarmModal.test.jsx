import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskDueAlarmModal } from '../components/common/TaskDueAlarmModal';

describe('TaskDueAlarmModal Component', () => {
  const mockTask = {
    _id: 'task-12345',
    title: 'Urgent Client Deliverable',
    description: 'Finalize presentation slides and financial figures',
    priority: 'high',
    category: 'Work',
    dueDateString: '2026-11-13',
    dueTime: '14:30'
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <TaskDueAlarmModal
        task={mockTask}
        isOpen={false}
        onDismiss={vi.fn()}
        onComplete={vi.fn()}
        onSnooze={vi.fn()}
        onMuteToggle={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders alarm dialog with task details, alarm indicator, and action buttons when open', () => {
    render(
      <TaskDueAlarmModal
        task={mockTask}
        isOpen={true}
        onDismiss={vi.fn()}
        onComplete={vi.fn()}
        onSnooze={vi.fn()}
        onMuteToggle={vi.fn()}
        isMuted={false}
      />
    );

    // Modal title & alarm alert header
    expect(screen.getByText('Task Alarm Triggered!')).toBeInTheDocument();
    expect(screen.getByText('Due Time Completed')).toBeInTheDocument();

    // Task details
    expect(screen.getByText('Urgent Client Deliverable')).toBeInTheDocument();
    expect(screen.getByText(/Finalize presentation slides/)).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText(/2:30 PM/)).toBeInTheDocument();

    // Action buttons
    expect(screen.getByText('Dismiss Alarm')).toBeInTheDocument();
    expect(screen.getByText('Snooze (5 Mins)')).toBeInTheDocument();
    expect(screen.getByText('Mark as Completed')).toBeInTheDocument();
  });

  it('fires callbacks on clicking Complete, Snooze, and Dismiss', () => {
    const onDismiss = vi.fn();
    const onComplete = vi.fn();
    const onSnooze = vi.fn();
    const onMuteToggle = vi.fn();

    render(
      <TaskDueAlarmModal
        task={mockTask}
        isOpen={true}
        onDismiss={onDismiss}
        onComplete={onComplete}
        onSnooze={onSnooze}
        onMuteToggle={onMuteToggle}
        isMuted={false}
      />
    );

    // Click Snooze
    fireEvent.click(screen.getByText('Snooze (5 Mins)'));
    expect(onSnooze).toHaveBeenCalledWith(mockTask);

    // Click Complete
    fireEvent.click(screen.getByText('Mark as Completed'));
    expect(onComplete).toHaveBeenCalledWith(mockTask);

    // Click Dismiss
    fireEvent.click(screen.getByText('Dismiss Alarm'));
    expect(onDismiss).toHaveBeenCalled();

    // Click Mute toggle
    const muteBtn = screen.getByTitle('Silence alarm sound');
    fireEvent.click(muteBtn);
    expect(onMuteToggle).toHaveBeenCalled();
  });
});
