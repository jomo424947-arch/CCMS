import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  fontScale: number; // e.g. 100 (%)
  iconScale: number; // e.g. 100 (%)
  setFontScale: (scale: number) => void;
  setIconScale: (scale: number) => void;
  resetVisualScale: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('ccms-theme') as Theme;
    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme;
    }
    // Default to dark mode for cyberpunk aesthetic
    return 'dark';
  });

  const [fontScale, setFontScaleState] = useState<number>(() => {
    const savedFontScale = localStorage.getItem('ccms-font-scale');
    if (savedFontScale) {
      const parsed = parseFloat(savedFontScale);
      if (!isNaN(parsed) && parsed >= 90 && parsed <= 112) {
        return parsed;
      }
    }
    return 100;
  });

  const [iconScale, setIconScaleState] = useState<number>(100);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('ccms-theme', newTheme);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const setFontScale = (scale: number) => {
    const clamped = Math.min(Math.max(scale, 90), 112);
    setFontScaleState(clamped);
    localStorage.setItem('ccms-font-scale', clamped.toString());
  };

  const setIconScale = (_scale: number) => {
    setIconScaleState(100);
    localStorage.setItem('ccms-icon-scale', '100');
  };

  const resetVisualScale = () => {
    setFontScale(100);
    setIconScaleState(100);
    localStorage.setItem('ccms-icon-scale', '100');
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const fontFactor = fontScale / 100;
    document.documentElement.style.setProperty('--font-scale', fontFactor.toString());
    document.documentElement.style.setProperty('--icon-scale', '1');
  }, [fontScale, iconScale]);

  return (
    <ThemeContext.Provider 
      value={{ 
        theme, 
        setTheme, 
        toggleTheme, 
        fontScale, 
        iconScale, 
        setFontScale, 
        setIconScale, 
        resetVisualScale 
      }}
    >
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

