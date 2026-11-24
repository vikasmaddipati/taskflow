import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardView } from '../views/DashboardView';
import { AllTasksView } from '../views/AllTasksView';
import { BoardView } from '../views/BoardView';
import { MyDayView } from '../views/MyDayView';
import { CompletedView } from '../views/CompletedView';
import { UpcomingView } from '../views/UpcomingView';
import { TrashView } from '../views/TrashView';
import { TeamView } from '../views/TeamView';
import { SettingsView } from '../views/SettingsView';
import { BillingView } from '../views/BillingView';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'u1', name: 'Test Boss', email: 'boss@taskmate.dev', role: 'owner' },
    currentOrg: { _id: 'org1', name: 'Acme Test Org', plan: 'pro' },
    organizations: [{ _id: 'org1', name: 'Acme Test Org', plan: 'pro' }],
    workspaces: [{ _id: 'ws1', name: 'Default Workspace' }],
    currentWorkspace: { _id: 'ws1', name: 'Default Workspace' }
  })
}));

const mockTasks = [
  {
    _id: 'task-1',
    title: 'Deploy Production Cluster',
    description: 'Ensure Zero Downtime',
    status: 'pending',
    priority: 'high',
    category: 'DevOps',
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    dueDateString: '2026-11-25',
    dueTime: '15:00',
    assignedTo: { _id: 'u1', name: 'Test Boss', email: 'boss@taskmate.dev' }
  },
  {
    _id: 'task-2',
    title: 'Review Security Audit',
    description: 'SOC2 Compliance',
    status: 'in_progress',
    priority: 'medium',
    category: 'Security',
    dueDate: new Date(Date.now() - 3600000).toISOString(),
    dueDateString: '2026-11-24',
    dueTime: '10:00'
  },
  {
    _id: 'task-3',
    title: 'Implement Dark Mode Check',
    description: 'UI refinement',
    status: 'completed',
    priority: 'low',
    category: 'Design',
    completedAt: new Date().toISOString()
  }
];

export const getBaseURL = vi.fn(() => '/api');

vi.mock('../services/api', () => ({
  getBaseURL: vi.fn(() => '/api'),
  default: {
    get: vi.fn((url) => {
      if (url === '/tasks/stats') {
        return Promise.resolve({
          data: {
            success: true,
            stats: {
              total: 3,
              pending: 1,
              inProgress: 1,
              completed: 1,
              overdue: 1,
              dueToday: 1,
              completionRate: 33,
              priorityBreakdown: { low: 1, medium: 1, high: 1 }
            },
            recentTasks: mockTasks,
            upcomingDeadlines: [mockTasks[0]]
          }
        });
      }
      if (url.includes('/trash')) {
        return Promise.resolve({
          data: {
            success: true,
            tasks: [
              {
                _id: 'trash-1',
                title: 'Deleted Task 1',
                deletedAt: new Date().toISOString()
              }
            ]
          }
        });
      }
      if (url.startsWith('/tasks')) {
        return Promise.resolve({
          data: {
            success: true,
            tasks: mockTasks,
            items: mockTasks,
            total: 3,
            totalPages: 1,
            page: 1
          }
        });
      }
      if (url === '/categories') {
        return Promise.resolve({
          data: {
            success: true,
            categories: [
              { _id: 'cat-1', name: 'DevOps', color: '#6366f1' },
              { _id: 'cat-2', name: 'Security', color: '#ef4444' }
            ]
          }
        });
      }
      if (url.includes('/members')) {
        return Promise.resolve({
          data: {
            success: true,
            members: [
              {
                _id: 'm-1',
                role: 'owner',
                user: { _id: 'u1', name: 'Test Boss', email: 'boss@taskmate.dev' }
              }
            ],
            pendingInvitations: []
          }
        });
      }
      if (url === '/teams') {
        return Promise.resolve({
          data: {
            success: true,
            teams: [{ _id: 'team-1', name: 'Core Engineering', members: ['u1'] }]
          }
        });
      }
      if (url === '/billing/plans') {
        return Promise.resolve({
          data: {
            success: true,
            plans: {
              free: {
                id: 'free',
                name: 'Free Starter',
                price: 0,
                currency: 'INR',
                limits: { maxTasksPerMonth: 100, maxMembers: 3, maxWorkspaces: 1, storageMb: 100, maxExportsPerMonth: 1 },
                features: { 'tasks.basic': true }
              },
              pro: {
                id: 'pro',
                name: 'Professional',
                price: 799,
                currency: 'INR',
                limits: { maxTasksPerMonth: 2500, maxMembers: 15, maxWorkspaces: 5, storageMb: 5000, maxExportsPerMonth: 10 },
                features: { 'tasks.advanced_filters': true }
              }
            }
          }
        });
      }
      if (url === '/billing/status') {
        return Promise.resolve({
          data: {
            success: true,
            plan: 'pro',
            subscription: null,
            quotas: {
              workspaces: { used: 1, max: 5 },
              tasks: { used: 3, max: 1000 }
            }
          }
        });
      }
      if (url.includes('/webhooks')) {
        return Promise.resolve({
          data: { success: true, webhooks: [] }
        });
      }
      if (url.includes('/auth/sessions')) {
        return Promise.resolve({
          data: { success: true, sessions: [] }
        });
      }
      return Promise.resolve({ data: { success: true } });
    }),
    post: vi.fn(() => Promise.resolve({ data: { success: true } })),
    put: vi.fn(() => Promise.resolve({ data: { success: true } })),
    patch: vi.fn(() => Promise.resolve({ data: { success: true } })),
    delete: vi.fn(() => Promise.resolve({ data: { success: true } }))
  }
}));

describe('Complete Core Views Automated Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders DashboardView with metrics and quick actions', async () => {
    render(
      <DashboardView
        onNavigate={vi.fn()}
        onOpenCreateModal={vi.fn()}
        onEditTask={vi.fn()}
        onDeleteTask={vi.fn()}
        onToggleStatus={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Workspace Overview/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Deploy Production Cluster/i).length).toBeGreaterThan(0);
    });
  });

  it('renders AllTasksView with task listing and filter controls', async () => {
    render(
      <AllTasksView
        onOpenCreateModal={vi.fn()}
        onEditTask={vi.fn()}
        onDeleteTask={vi.fn()}
        onToggleStatus={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search tasks by title/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Deploy Production Cluster/i).length).toBeGreaterThan(0);
    });
  });

  it('renders BoardView with all 4 Kanban columns', async () => {
    render(
      <BoardView
        onOpenCreateModal={vi.fn()}
        onEditTask={vi.fn()}
        onDeleteTask={vi.fn()}
        showToast={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Kanban Board/i)).toBeInTheDocument();
      expect(screen.getAllByText(/To Do/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/In Progress/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Review/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Completed/i).length).toBeGreaterThan(0);
    });
  });

  it('renders MyDayView with daily focus sections', async () => {
    render(
      <MyDayView
        onOpenCreateModal={vi.fn()}
        onEditTask={vi.fn()}
        onDeleteTask={vi.fn()}
        onToggleStatus={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Daily Focus/i)).toBeInTheDocument();
    });
  });

  it('renders CompletedView with archived finished tasks', async () => {
    render(
      <CompletedView
        onEditTask={vi.fn()}
        onDeleteTask={vi.fn()}
        onToggleStatus={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Completed Tasks/i)).toBeInTheDocument();
    });
  });

  it('renders UpcomingView with future schedule planner', async () => {
    render(
      <UpcomingView
        onOpenCreateModal={vi.fn()}
        onEditTask={vi.fn()}
        onDeleteTask={vi.fn()}
        onToggleStatus={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Upcoming Tasks/i)).toBeInTheDocument();
    });
  });

  it('renders TrashView with soft-deleted tasks', async () => {
    render(
      <TrashView
        showToast={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Trash/i)).toBeInTheDocument();
    });
  });

  it('renders TeamView with members and squads', async () => {
    render(
      <TeamView
        showToast={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Team & Members/i)).toBeInTheDocument();
      expect(screen.getByText(/Test Boss/i)).toBeInTheDocument();
    });
  });

  it('renders SettingsView with organization and profile settings', async () => {
    render(
      <SettingsView
        showToast={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Settings/i)).toBeInTheDocument();
    });
  });

  it('renders BillingView with subscription plans', async () => {
    render(
      <BillingView
        showToast={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Available Subscription Tiers/i)).toBeInTheDocument();
    });
  });
});
