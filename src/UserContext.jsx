import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const UserContext = createContext({
  user: null,
  setUser: () => {},
  logout: () => {},
});

const STORAGE_KEY = "tpa_ops_user";

export function UserProvider({ children }) {
  const [user, setUserState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error("Error reading saved user:", error);
      return null;
    }
  });

  const setUser = (value) => {
    setUserState(value);

    try {
      if (value) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error("Error saving user:", error);
    }
  };

  const logout = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Error removing saved user:", error);
    }
    setUserState(null);
  };

  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error("Error syncing user to storage:", error);
    }
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      setUser,
      logout,
    }),
    [user]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
