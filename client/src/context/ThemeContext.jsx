import React, { createContext, useCallback, useContext, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const theme = 'light';

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('tm_theme', 'light');
  }, []);

  const toggleTheme = useCallback(() => {}, []);

  const setTheme = useCallback(() => {}, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
