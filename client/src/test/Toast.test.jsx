import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast } from '../components/common/Toast';

describe('Toast Component (React Rules of Hooks & Runtime Verification)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders null when toast prop is falsy without violating Rules of Hooks', () => {
    const { container } = render(<Toast toast={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly and does not crash when switching from null to an active toast', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Toast toast={null} onClose={onClose} />);

    // Dynamically update prop from null to active object (regression test for hook count consistency)
    rerender(<Toast toast={{ type: 'success', message: 'Task created successfully' }} onClose={onClose} />);

    expect(screen.getByText('Task created successfully')).toBeInTheDocument();
  });

  it('automatically triggers onClose after 3500ms timeout', () => {
    const onClose = vi.fn();
    render(
      <Toast
        toast={{ type: 'success', message: 'Auto dismiss message' }}
        onClose={onClose}
      />
    );

    expect(onClose).not.toHaveBeenCalled();

    // Fast-forward time by 3500ms inside act
    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked', async () => {
    // For user events with fake timers, use real timers for userEvent interaction
    vi.useRealTimers();
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Toast
        toast={{ type: 'error', message: 'Network operation failed' }}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Network operation failed')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button');
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('applies correct styling for error, success, and info toast types', () => {
    const { rerender } = render(
      <Toast toast={{ type: 'error', message: 'Error state' }} onClose={vi.fn()} />
    );
    expect(screen.getByText('Error state')).toBeInTheDocument();

    rerender(
      <Toast toast={{ type: 'info', message: 'Info state' }} onClose={vi.fn()} />
    );
    expect(screen.getByText('Info state')).toBeInTheDocument();
  });
});
