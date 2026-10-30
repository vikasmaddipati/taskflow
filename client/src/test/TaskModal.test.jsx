import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskModal } from '../components/common/TaskModal';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { success: true, members: [], categories: [] } })
  }
}));

const renderWithProviders = (ui) => {
  return render(
    <ThemeProvider>
      <AuthProvider>{ui}</AuthProvider>
    </ThemeProvider>
  );
};

describe('TaskModal Component (Form Validation & Timezone String Preservation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = renderWithProviders(
      <TaskModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders Create New Task form when isOpen is true in create mode', () => {
    renderWithProviders(
      <TaskModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    expect(screen.getByText('Create New Task')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Design multi-tenant database migration/i)).toHaveValue('');
  });

  it('validates required title and prevents form submission when title is empty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithProviders(
      <TaskModal isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />
    );

    const submitBtn = screen.getByRole('button', { name: /create task/i });
    await user.click(submitBtn);

    expect(screen.getByText('Task title is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits form with normalized calendar date string (dueDateString)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithProviders(
      <TaskModal isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />
    );

    const titleInput = screen.getByPlaceholderText(/Design multi-tenant database migration/i);
    await user.type(titleInput, 'Deploy Next Release');

    // Select date
    const dateInput = screen.getByLabelText(/due date/i);
    await user.type(dateInput, '2026-11-15');

    const submitBtn = screen.getByRole('button', { name: /create task/i });
    await user.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submittedData = onSubmit.mock.calls[0][0];
    expect(submittedData.title).toBe('Deploy Next Release');
    expect(submittedData.dueDateString).toBe('2026-11-15');
    expect(submittedData.priority).toBe('medium');
  });

  it('populates fields properly when editing an existing task', () => {
    const existingTask = {
      _id: 'task-101',
      title: 'Fix Authentication Flow',
      description: 'Patch TDZ and Hook errors',
      priority: 'high',
      status: 'pending',
      dueDateString: '2026-12-01',
      category: 'Work'
    };

    renderWithProviders(
      <TaskModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        task={existingTask}
      />
    );

    expect(screen.getByText('Edit Task')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Fix Authentication Flow')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Patch TDZ and Hook errors')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-12-01')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(
      <TaskModal isOpen={true} onClose={onClose} onSubmit={vi.fn()} />
    );

    const closeBtn = screen.getByRole('button', { name: '' }); // X icon button
    await user.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
