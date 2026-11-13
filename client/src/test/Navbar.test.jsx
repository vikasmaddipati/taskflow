import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Navbar } from '../components/layout/Navbar';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Vikas', email: 'vikas@example.com' },
    currentOrg: { _id: 'org1', name: 'Personal Workspace', plan: 'free', isPersonal: true },
    organizations: [{ _id: 'org1', name: 'Personal Workspace', plan: 'free', isPersonal: true }],
    switchOrganization: vi.fn(),
    currentWorkspace: { _id: 'ws1', name: 'General' },
    workspaces: [{ _id: 'ws1', name: 'General' }],
    switchWorkspace: vi.fn(),
    fetchWorkspaces: vi.fn(),
    logout: vi.fn()
  })
}));

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { success: true, notifications: [], unreadCount: 0 } }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    patch: vi.fn().mockResolvedValue({ data: { success: true } })
  }
}));

describe('Navbar Component (Mobile Overflow Prevention & Controls)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders header bounded to viewport width without dark mode toggle and preserves other controls', () => {
    render(
      <Navbar
        currentView="dashboard"
        onOpenMobileMenu={vi.fn()}
        onOpenCreateModal={vi.fn()}
        onOpenCreateOrgModal={vi.fn()}
        onToggleAiCopilot={vi.fn()}
      />
    );

    const header = screen.getByRole('banner');
    expect(header).toHaveClass('w-full', 'max-w-full');

    expect(screen.getByLabelText('Open sidebar')).toBeInTheDocument();
    expect(screen.getByText('Personal Workspace')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByTitle('Open AI Copilot')).toBeInTheDocument();
    expect(screen.getByTitle('New Task')).toBeInTheDocument();
    expect(screen.getByTitle('Notifications')).toBeInTheDocument();
    expect(screen.getByTitle('Sign out')).toBeInTheDocument();
    expect(screen.queryByTitle(/Switch to .* mode/i)).not.toBeInTheDocument();
  });

  it('triggers mobile menu, AI copilot, and new task callbacks', async () => {
    const user = userEvent.setup();
    const onOpenMobileMenu = vi.fn();
    const onOpenCreateModal = vi.fn();
    const onToggleAiCopilot = vi.fn();

    render(
      <Navbar
        currentView="dashboard"
        onOpenMobileMenu={onOpenMobileMenu}
        onOpenCreateModal={onOpenCreateModal}
        onOpenCreateOrgModal={vi.fn()}
        onToggleAiCopilot={onToggleAiCopilot}
      />
    );

    await user.click(screen.getByLabelText('Open sidebar'));
    await user.click(screen.getByTitle('Open AI Copilot'));
    await user.click(screen.getByTitle('New Task'));

    expect(onOpenMobileMenu).toHaveBeenCalledTimes(1);
    expect(onToggleAiCopilot).toHaveBeenCalledTimes(1);
    expect(onOpenCreateModal).toHaveBeenCalledTimes(1);
  });

  it('toggles org, workspace, and notifications dropdowns cleanly without simultaneous overlap', async () => {
    const user = userEvent.setup();

    render(
      <Navbar
        currentView="dashboard"
        onOpenMobileMenu={vi.fn()}
        onOpenCreateModal={vi.fn()}
        onOpenCreateOrgModal={vi.fn()}
        onToggleAiCopilot={vi.fn()}
      />
    );

    await user.click(screen.getByText('Personal Workspace'));
    expect(screen.getByText('Organizations & Teams')).toBeInTheDocument();

    await user.click(screen.getByText('General'));
    expect(screen.queryByText('Organizations & Teams')).not.toBeInTheDocument();
    expect(screen.getByText('Workspaces in Organization')).toBeInTheDocument();

    await user.click(screen.getByTitle('Notifications'));
    expect(screen.queryByText('Workspaces in Organization')).not.toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });
});
