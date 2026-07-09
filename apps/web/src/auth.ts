import { useState, useEffect } from "react";

const AUTH_KEY = "callwave_mock_logged_in";

export function useMockAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_KEY);
      if (stored === "true") setIsLoggedIn(true);
    } catch {}
  }, []);

  const login = () => {
    try {
      localStorage.setItem(AUTH_KEY, "true");
    } catch {}
    setIsLoggedIn(true);
  };

  const logout = () => {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {}
    setIsLoggedIn(false);
  };

  return { isLoggedIn, login, logout };
}
