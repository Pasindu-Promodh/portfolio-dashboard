// App.tsx
import { lazy, Suspense } from "react";
import { CircularProgress } from "@mui/material";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/useAuth";

// Loaded only after sign-in, so the login screen stays light.
const Dashboard = lazy(() => import("./pages/Dashboard"));

const centered = {
  display: "flex",
  height: "90vh",
  justifyContent: "center",
  alignItems: "center",
} as const;

function AppContent() {
  const { user, loading, login } = useAuth();

  if (loading) {
    return (
      <div style={centered}>
        <CircularProgress />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={centered}>
        <button
          onClick={login}
          style={{
            padding: "12px 24px",
            fontSize: "16px",
            borderRadius: "8px",
            border: "none",
            backgroundColor: "#1976d2",
            color: "white",
            cursor: "pointer",
            boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
            transition: "background-color 0.3s ease",
          }}
          onMouseOver={(e) =>
            (e.currentTarget.style.backgroundColor = "#1565c0")
          }
          onMouseOut={(e) =>
            (e.currentTarget.style.backgroundColor = "#1976d2")
          }
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div style={centered}>
          <CircularProgress />
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
