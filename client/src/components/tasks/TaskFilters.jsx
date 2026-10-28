import React from 'react';
import { Search, X, Filter, ArrowUpDown } from 'lucide-react';

export const TaskFilters = ({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  priorityFilter,
  onPriorityChange,
  categoryFilter,
  onCategoryChange,
  categories = [],
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
  showStatusPills = true
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3.5">
      {/* Top row: Search bar & Sort controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tasks by title or description..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-800 transition-all"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-xl text-xs text-slate-600 dark:text-slate-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium hidden md:inline">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value)}
              className="bg-transparent border-none text-slate-800 dark:text-slate-100 focus:outline-none font-medium cursor-pointer"
            >
              <option value="createdAt" className="bg-white dark:bg-slate-800">Date Created</option>
              <option value="dueDate" className="bg-white dark:bg-slate-800">Due Date</option>
              <option value="priority" className="bg-white dark:bg-slate-800">Priority</option>
              <option value="title" className="bg-white dark:bg-slate-800">Title</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-2.5 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title={sortOrder === 'asc' ? 'Ascending (click to toggle)' : 'Descending (click to toggle)'}
          >
            {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
          </button>
        </div>
      </div>

      {/* Bottom row: Status Pills & Dropdown filters */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        {/* Status Pills */}
        {showStatusPills ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'All Tasks' },
              { id: 'pending', label: 'Pending' },
              { id: 'completed', label: 'Completed' },
              { id: 'overdue', label: 'Overdue' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onStatusChange(tab.id)}
                className={`px-3 py-1.5 text-xs rounded-xl font-medium transition-all ${
                  statusFilter === tab.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : <div />}

        {/* Priority & Category Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto">
          {/* Priority Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-xl text-xs text-slate-600 dark:text-slate-300 flex-1 sm:flex-none">
            <span className="font-medium text-slate-400">Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => onPriorityChange(e.target.value)}
              className="bg-transparent border-none text-slate-800 dark:text-slate-100 focus:outline-none font-medium cursor-pointer"
            >
              <option value="all" className="bg-white dark:bg-slate-800">All</option>
              <option value="high" className="bg-white dark:bg-slate-800">High</option>
              <option value="medium" className="bg-white dark:bg-slate-800">Medium</option>
              <option value="low" className="bg-white dark:bg-slate-800">Low</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-xl text-xs text-slate-600 dark:text-slate-300 flex-1 sm:flex-none">
            <span className="font-medium text-slate-400">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="bg-transparent border-none text-slate-800 dark:text-slate-100 focus:outline-none font-medium cursor-pointer"
            >
              <option value="all" className="bg-white dark:bg-slate-800">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat} className="bg-white dark:bg-slate-800">
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters Button if any active filter */}
          {(search || (statusFilter !== 'all' && showStatusPills) || priorityFilter !== 'all' || categoryFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                if (showStatusPills) onStatusChange('all');
                onPriorityChange('all');
                onCategoryChange('all');
              }}
              className="px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors font-medium ml-auto sm:ml-0"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
