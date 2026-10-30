import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

const ThemeConsumer = () => {
  const { theme, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <div data-testid="current-theme">{theme}</div>
      <button onClick={toggleTheme} data-testid="toggle-btn">
        Toggle Theme
      </button>
      <button onClick={() => setTheme('dark')} data-testid="set-dark-btn">
        Set Dark
      </button>
      <button onClick={() => setTheme('light')} data-testid="set-light-btn">
        Set Light
      </button>
    </div>
  );
};

describe('ThemeContext (Theme Switching & DOM Synchronization)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('defaults to light theme when no storage preference exists', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('reads stored preference from localStorage on mount', () => {
    localStorage.setItem('tm_theme', 'dark');

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggles theme and updates document class and localStorage', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    const toggleBtn = screen.getByTestId('toggle-btn');

    // Toggle to dark
    await user.click(toggleBtn);
    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('tm_theme')).toBe('dark');

    // Toggle back to light
    await user.click(toggleBtn);
    expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('tm_theme')).toBe('light');
  });

  it('allows setting explicit theme via setTheme', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    await user.click(screen.getByTestId('set-dark-btn'));
    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    expect(localStorage.getItem('tm_theme')).toBe('dark');

    await user.click(screen.getByTestId('set-light-btn'));
    expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    expect(localStorage.getItem('tm_theme')).toBe('light');
  });
});
