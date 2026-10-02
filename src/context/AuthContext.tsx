// context/AuthContext.tsx
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { auth, provider } from "../services/firebase";
import { signInWithPopup, onAuthStateChanged, signOut, type User } from "firebase/auth";

const AuthContext = createContext<{
  user: User | null;
  login: () => void;
  logout: () => void;
}>({
  user: null,
  login: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

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
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
