import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const UserContext = createContext({
  user: null,
  setUser: () => {},
  logout: () => {},
});

const STORAGE_KEY = "tpa_ops_user";
const LAST_ACTIVITY_KEY = "tpa_ops_last_activity";

const WARNING_MINUTES = 55;
const LOGOUT_MINUTES = 60;

const WARNING_MS = WARNING_MINUTES * 60 * 1000;
const LOGOUT_MS = LOGOUT_MINUTES * 60 * 1000;

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

  const [showSessionWarning, setShowSessionWarning] = useState(false);

  const warningTimeoutRef = useRef(null);
  const logoutTimeoutRef = useRef(null);

  const clearTimers = () => {
    if (warningTimeoutRef.current) {
      window.clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }

    if (logoutTimeoutRef.current) {
      window.clearTimeout(logoutTimeoutRef.current);
      logoutTimeoutRef.current = null;
    }
  };

  const getNow = () => Date.now();

  const saveLastActivity = (timestamp = getNow()) => {
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
    } catch (error) {
      console.error("Error saving last activity:", error);
    }
  };

  const readLastActivity = () => {
    try {
      const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    } catch (error) {
      console.error("Error reading last activity:", error);
      return null;
    }
  };

  const setUser = (value) => {
    setUserState(value);

    try {
      if (value) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        saveLastActivity();
      } else {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LAST_ACTIVITY_KEY);
      }
    } catch (error) {
      console.error("Error saving user:", error);
    }
  };

  const logout = () => {
    clearTimers();
    setShowSessionWarning(false);
    setUser(null);
  };

  const continueSession = () => {
    if (!user) return;
    setShowSessionWarning(false);
    saveLastActivity();
    scheduleInactivityTimers();
  };

  const scheduleInactivityTimers = () => {
    clearTimers();

    if (!user) return;

    const lastActivity = readLastActivity() || getNow();
    const now = getNow();
    const elapsed = now - lastActivity;

    if (elapsed >= LOGOUT_MS) {
      logout();
      return;
    }

    const warningDelay = Math.max(WARNING_MS - elapsed, 0);
    const logoutDelay = Math.max(LOGOUT_MS - elapsed, 0);

    warningTimeoutRef.current = window.setTimeout(() => {
      setShowSessionWarning(true);
    }, warningDelay);

    logoutTimeoutRef.current = window.setTimeout(() => {
      logout();
    }, logoutDelay);
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

  useEffect(() => {
    if (!user) {
      clearTimers();
      setShowSessionWarning(false);
      return;
    }

    const markActivity = () => {
      saveLastActivity();

      if (showSessionWarning) {
        setShowSessionWarning(false);
      }

      scheduleInactivityTimers();
    };

    const events = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    events.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleInactivityTimers();
      }
    };

    window.addEventListener("focus", scheduleInactivityTimers);
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (!readLastActivity()) {
      saveLastActivity();
    }

    scheduleInactivityTimers();

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity);
      });

      window.removeEventListener("focus", scheduleInactivityTimers);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearTimers();
    };
  }, [user, showSessionWarning]);

  const value = useMemo(
    () => ({
      user,
      setUser,
      logout,
    }),
    [user]
  );

  return (
    <UserContext.Provider value={value}>
      {children}

      {user && showSessionWarning && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100000,
            padding: 20,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#ffffff",
              borderRadius: 24,
              boxShadow: "0 24px 60px rgba(15,23,42,0.22)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "18px 20px",
                background: "#fff7ed",
                borderBottom: "1px solid #fed7aa",
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  color: "#9a3412",
                  letterSpacing: "-0.02em",
                }}
              >
                Your session will expire soon
              </div>
            </div>

            <div
              style={{
                padding: "22px 20px 18px",
                fontSize: 15,
                lineHeight: 1.65,
                color: "#0f172a",
                fontWeight: 700,
              }}
            >
              For security, you will be logged out after 60 minutes of inactivity.
              Select continue session to stay signed in.
            </div>

            <div
              style={{
                padding: "0 20px 20px",
                display: "flex",
                justifyContent: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={logout}
                style={{
                  border: "1px solid #fecdd3",
                  background: "#fff1f2",
                  color: "#b91c1c",
                  borderRadius: 14,
                  padding: "12px 18px",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Logout now
              </button>

              <button
                type="button"
                onClick={continueSession}
                style={{
                  border: "none",
                  background:
                    "linear-gradient(135deg, #0f4c81 0%, #1769aa 55%, #5aa9e6 100%)",
                  color: "#fff",
                  borderRadius: 14,
                  padding: "12px 22px",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  boxShadow: "0 12px 24px rgba(23,105,170,0.18)",
                }}
              >
                Continue session
              </button>
            </div>
          </div>
        </div>
      )}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
