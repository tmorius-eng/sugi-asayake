import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (switchable) {
      try {
        const stored = localStorage.getItem("theme");
        return (stored as Theme) || defaultTheme;
      } catch {
        return defaultTheme; // private-browsing/blocked storage
      }
    }
    return defaultTheme;
  });

  // 2026-09-27: storefront-ийн dark горим Tailwind-ийн `.dark` класс
  // ХЭРЭГЛЭХГҮЙ (PROJECT-GUIDE) -- `html[data-storefront-theme="dark"]`-ийг
  // өөр газар (index.css) шийддэг. Энд `.dark` нэмдэг байсан нь одоогийн ганц
  // хэрэглээндээ (App.tsx, `switchable` өгөгдөөгүй) хэзээ ч "dark" болдоггүй
  // тул чимээгүй үхсэн код байсан ч дүрмийг зөрчихгүйн тулд бүрмөсөн хасав.
  useEffect(() => {
    if (!switchable) return;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // private-browsing/blocked storage -- theme still applies for this visit
    }
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => (prev === "light" ? "dark" : "light"));
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
