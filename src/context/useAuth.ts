import { createContext, useContext } from "react";
import type { User } from "firebase/auth";

export type AuthState = {
  user: User | null;
  /** True until Firebase has restored (or ruled out) a saved session. */
  loading: boolean;
  login: () => void;
  logout: () => void;
};

export const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);
