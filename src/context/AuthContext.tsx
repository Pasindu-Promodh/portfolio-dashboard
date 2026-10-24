// context/AuthContext.tsx
import { useEffect, useRef, useState } from "react";
import { auth, provider } from "../services/firebase";
import { signInWithPopup, onAuthStateChanged, signOut, type User } from "firebase/auth";
import { AuthContext } from "./useAuth";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signingIn = useRef(false);

  const login = async () => {
    if (signingIn.current) return;
    signingIn.current = true;
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "auth/cancelled-popup-request" && code !== "auth/popup-closed-by-user") {
        console.error("Login failed:", err);
      }
    } finally {
      signingIn.current = false;
    }
  };
  const logout = () => signOut(auth);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
