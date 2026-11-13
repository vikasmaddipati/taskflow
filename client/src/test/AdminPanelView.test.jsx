import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPanelView } from '../views/AdminPanelView';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'u1', name: 'Admin Boss', email: 'boss@taskflow.dev', phone: '+919999999999' },
    currentOrg: { _id: 'org1', name: 'Acme Corp', plan: 'business' }
  })
}));

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn((url) => {
      if (url === '/admin/overview') {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              metrics: {
                totalTasks: 42,
                completedTasks: 20,
                pendingTasks: 12,
                inProgressTasks: 8,
                reviewTasks: 2,
                overdueTasks: 3,
                totalMembers: 5,
                completionRate: 48
              },
              memberWorkload: [
                {
                  userId: 'm1',
                  name: 'Alice Dev',
                  email: 'alice@taskflow.dev',
                  role: 'member',
                  assignedTasks: 10,
                  completedTasks: 6,
                  pendingTasks: 4,
                  inProgressTasks: 2,
                  completionRate: 60
                }
              ],
              recentActivity: [],
              whatsappSettings: {
                adminPhone: '+919999999999',
                enabled: true,
                notifyOnTaskAssigned: true,
                notifyOnTaskCompleted: true,
                notifyBefore30Min: true,
                notifyOnOverdue: true
              }
            }
          }
        });
      }
      if (url === '/admin/tasks') {
        return Promise.resolve({
          data: {
            success: true,
            tasks: [
              {
                _id: 't1',
                title: 'Deploy Production Microservices',
                status: 'in_progress',
                priority: 'high',
                dueDateString: '2026-11-20',
                dueTime: '17:30',
                assignedTo: { name: 'Alice Dev', email: 'alice@taskflow.dev' },
                workspace: { name: 'DevOps' }
              }
            ]
          }
        });
      }
      return Promise.resolve({ data: { success: true } });
    }),
    put: vi.fn().mockResolvedValue({ data: { success: true, message: 'Settings updated' } }),
    post: vi.fn().mockResolvedValue({ data: { success: true, message: 'WhatsApp message sent' } })
  }
}));

describe('AdminPanelView Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders admin header and top metrics KPIs', async () => {
    render(<AdminPanelView showToast={vi.fn()} onOpenCreateModal={vi.fn()} onEditTask={vi.fn()} />);

    expect(screen.getByText('Admin & TaskFlow Monitor')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument(); // total tasks
      expect(screen.getByText('48%')).toBeInTheDocument(); // completion rate
      expect(screen.getByText('Alice Dev')).toBeInTheDocument(); // member in table
    });
  });

  it('navigates to tasks monitoring tab and lists tasks with due time', async () => {
    render(<AdminPanelView showToast={vi.fn()} onOpenCreateModal={vi.fn()} onEditTask={vi.fn()} />);

    const user = userEvent.setup();
    const tasksTab = screen.getByRole('button', { name: /Task Monitor & Deadlines/i });
    await user.click(tasksTab);

    await waitFor(() => {
      expect(screen.getByText('Deploy Production Microservices')).toBeInTheDocument();
      expect(screen.getByText('Due at 17:30')).toBeInTheDocument();
    });
  });

  it('navigates to WhatsApp tab and renders admin phone configuration', async () => {
    render(<AdminPanelView showToast={vi.fn()} onOpenCreateModal={vi.fn()} onEditTask={vi.fn()} />);

    const user = userEvent.setup();
    const whatsappTab = screen.getByRole('button', { name: /Admin WhatsApp Alerts/i });
    await user.click(whatsappTab);

    expect(screen.getByText('WhatsApp Dispatch Center')).toBeInTheDocument();
    expect(screen.getByText('30 Minutes Before Due Time Alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save WhatsApp Configuration/i })).toBeInTheDocument();
  });
});
