import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskIncomingCallModal } from '../components/common/TaskIncomingCallModal';

describe('TaskIncomingCallModal Component', () => {
  const mockTask = {
    _id: 'task-test-phone-99',
    title: 'Deploy Production Hotfix',
    description: 'Critical update for API deadline',
    priority: 'high',
    category: 'Work',
    dueDateString: '2026-11-13',
    dueTime: '16:30'
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <TaskIncomingCallModal
        task={mockTask}
        isOpen={false}
        onDecline={vi.fn()}
        onComplete={vi.fn()}
        onSnooze={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders incoming call screen with caller details, task title, and Answer/Decline buttons', () => {
    render(
      <TaskIncomingCallModal
        task={mockTask}
        isOpen={true}
        onDecline={vi.fn()}
        onComplete={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    expect(screen.getByText('TaskMate Automated Calling')).toBeInTheDocument();
    expect(screen.getByText('Incoming Deadline Phone Call')).toBeInTheDocument();
    expect(screen.getByText('Deploy Production Hotfix')).toBeInTheDocument();
    expect(screen.getByText('Answer')).toBeInTheDocument();
    expect(screen.getByText('Decline')).toBeInTheDocument();
  });

  it('transitions to connected call screen when Answer is clicked', async () => {
    render(
      <TaskIncomingCallModal
        task={mockTask}
        isOpen={true}
        onDecline={vi.fn()}
        onComplete={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    const answerBtn = screen.getByTitle('Answer Call');
    fireEvent.click(answerBtn);

    // Should display connected call status
    expect(screen.getByText(/Call Connected/)).toBeInTheDocument();
    expect(screen.getByText(/Complete Task/)).toBeInTheDocument();
    expect(screen.getByText(/Snooze \(5m\)/)).toBeInTheDocument();
    expect(screen.getByText(/End Call/)).toBeInTheDocument();
  });

  it('invokes onDecline when Decline is clicked', () => {
    const onDecline = vi.fn();
    render(
      <TaskIncomingCallModal
        task={mockTask}
        isOpen={true}
        onDecline={onDecline}
        onComplete={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    const declineBtn = screen.getByTitle('Decline Call');
    fireEvent.click(declineBtn);
    expect(onDecline).toHaveBeenCalled();
  });
});
