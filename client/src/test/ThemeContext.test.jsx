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
    </div>
  );
};

describe('ThemeContext (Light Mode Enforcement)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('defaults to light theme and removes any dark class', () => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('tm_theme', 'dark');

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('tm_theme')).toBe('light');
  });

  it('keeps light mode active when toggleTheme or setTheme("dark") is called', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    await user.click(screen.getByTestId('toggle-btn'));
    expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await user.click(screen.getByTestId('set-dark-btn'));
    expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('tm_theme')).toBe('light');
  });
});
