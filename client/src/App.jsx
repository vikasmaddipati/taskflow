import React, { useState, useEffect, useCallback } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardView } from './views/DashboardView';
import { AllTasksView } from './views/AllTasksView';
import { MyDayView } from './views/MyDayView';
import { UpcomingView } from './views/UpcomingView';
import { CompletedView } from './views/CompletedView';
import { TeamView } from './views/TeamView';
import { BillingView } from './views/BillingView';
import { SettingsView } from './views/SettingsView';
import { AuthView } from './views/AuthView';
import { TaskModal } from './components/common/TaskModal';
import { DeleteConfirmModal } from './components/common/DeleteConfirmModal';
import { CreateOrgModal } from './components/common/CreateOrgModal';
import { Toast } from './components/common/Toast';
import api from './services/api';

const AppContent = () => {
  const { isAuthenticated, loading: authLoading, currentOrg, user } = useAuth();

  // Navigation state
  const [currentView, setCurrentView] = useState('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Global refresh trigger for lists when a task is updated/deleted
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Global counts for sidebar badges
  const [sidebarStats, setSidebarStats] = useState({
    total: 0,
    dueToday: 0,
    completed: 0,
    completionRate: 0
  });

  // Modals state
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState(null);

  const showToast = useCallback((toastData) => {
    setToast(toastData);
  }, []);

  // Listen to organization switch events to refresh stats
  useEffect(() => {
    const handleOrgChanged = () => {
      setRefreshTrigger((p) => p + 1);
    };
    window.addEventListener('org:changed', handleOrgChanged);
    return () => window.removeEventListener('org:changed', handleOrgChanged);
  }, []);

  // Fetch quick stats for sidebar badges
  const fetchSidebarStats = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.get('/tasks/stats');
      if (res.data.success && res.data.stats) {
        setSidebarStats({
          total: res.data.stats.total,
          dueToday: res.data.stats.dueToday,
          completed: res.data.stats.completed,
          completionRate: res.data.stats.completionRate
        });
      }
    } catch {
      // ignore badge error in background
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchSidebarStats();
  }, [fetchSidebarStats, refreshTrigger, currentOrg?._id]);

  // Open modal for new task (with optional defaults)
  const handleOpenCreateModal = (defaults = null) => {
    setEditingTask(defaults ? { ...defaults } : null);
    setIsTaskModalOpen(true);
  };

  // Open modal for editing existing task
  const handleOpenEditModal = (task) => {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };

  // Submit task (create or update)
  const handleSubmitTask = async (taskData) => {
    setIsSubmittingTask(true);
    try {
      if (editingTask && editingTask._id) {
        const res = await api.put(`/tasks/${editingTask._id}`, taskData);
        if (res.data.success) {
          showToast({ type: 'success', message: 'Task updated successfully' });
        }
      } else {
        const res = await api.post('/tasks', taskData);
        if (res.data.success) {
          showToast({ type: 'success', message: 'Task created successfully' });
        }
      }
      setIsTaskModalOpen(false);
      setEditingTask(null);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to save task';
      showToast({ type: 'error', message });
    } finally {
      setIsSubmittingTask(false);
    }
  };

  // Toggle completion status
  const handleToggleStatus = async (taskId) => {
    try {
      const res = await api.patch(`/tasks/${taskId}/toggle`);
      if (res.data.success) {
        showToast({
          type: 'success',
          message: res.data.task.status === 'completed' ? 'Task marked as completed' : 'Task reopened'
        });
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to update task status';
      showToast({ type: 'error', message });
    }
  };

  // Open delete confirmation modal
  const handleOpenDeleteModal = (task) => {
    setTaskToDelete(task);
    setIsDeleteModalOpen(true);
  };

  // Confirm delete task
  const handleConfirmDelete = async () => {
    if (!taskToDelete) return;
    setIsDeletingTask(true);
    try {
      const res = await api.delete(`/tasks/${taskToDelete._id}`);
      if (res.data.success) {
        showToast({ type: 'success', message: 'Task moved to trash' });
        setIsDeleteModalOpen(false);
        setTaskToDelete(null);
        setRefreshTrigger((prev) => prev + 1);
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to delete task';
      showToast({ type: 'error', message });
    } finally {
      setIsDeletingTask(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
        <span className="mt-3 text-sm font-medium text-slate-500">Loading TaskFlow...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthView />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex text-slate-900 dark:text-slate-100 transition-colors">
      {/* Sidebar (Desktop + Mobile) */}
      <Sidebar
        currentView={currentView}
        onSelectView={setCurrentView}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
        stats={sidebarStats}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          currentView={currentView}
          onOpenMobileMenu={() => setIsMobileOpen(true)}
          onOpenCreateModal={() => handleOpenCreateModal()}
          onOpenCreateOrgModal={() => setIsCreateOrgModalOpen(true)}
        />

        {/* Email Verification Banner */}
        {user && !user.isEmailVerified && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold uppercase tracking-wider text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full">
                Verification Required
              </span>
              <span>
                Your email address ({user.email}) has not been confirmed. Please verify your email to secure your account.
              </span>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {currentView === 'dashboard' && (
            <DashboardView
              onNavigate={setCurrentView}
              onOpenCreateModal={() => handleOpenCreateModal()}
              onEditTask={handleOpenEditModal}
              onDeleteTask={handleOpenDeleteModal}
              onToggleStatus={handleToggleStatus}
            />
          )}

          {currentView === 'all' && (
            <AllTasksView
              onOpenCreateModal={() => handleOpenCreateModal()}
              onEditTask={handleOpenEditModal}
              onDeleteTask={handleOpenDeleteModal}
              onToggleStatus={handleToggleStatus}
              refreshTrigger={refreshTrigger}
            />
          )}

          {currentView === 'today' && (
            <MyDayView
              onOpenCreateModal={handleOpenCreateModal}
              onEditTask={handleOpenEditModal}
              onDeleteTask={handleOpenDeleteModal}
              onToggleStatus={handleToggleStatus}
              refreshTrigger={refreshTrigger}
            />
          )}

          {currentView === 'upcoming' && (
            <UpcomingView
              onOpenCreateModal={handleOpenCreateModal}
              onEditTask={handleOpenEditModal}
              onDeleteTask={handleOpenDeleteModal}
              onToggleStatus={handleToggleStatus}
              refreshTrigger={refreshTrigger}
            />
          )}

          {currentView === 'completed' && (
            <CompletedView
              onEditTask={handleOpenEditModal}
              onDeleteTask={handleOpenDeleteModal}
              onToggleStatus={handleToggleStatus}
              refreshTrigger={refreshTrigger}
            />
          )}

          {currentView === 'team' && (
            <TeamView showToast={showToast} />
          )}

          {currentView === 'billing' && (
            <BillingView showToast={showToast} />
          )}

          {currentView === 'settings' && (
            <SettingsView showToast={showToast} />
          )}
        </main>
      </div>

      {/* Common Modals & Toasts */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }}
        onSubmit={handleSubmitTask}
        task={editingTask}
        isSubmitting={isSubmittingTask}
      />

      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        title={taskToDelete?.title || 'this task'}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setTaskToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeletingTask}
      />

      <CreateOrgModal
        isOpen={isCreateOrgModalOpen}
        onClose={() => setIsCreateOrgModalOpen(false)}
        showToast={showToast}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
