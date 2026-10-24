import type { Timestamp } from "firebase/firestore";

export interface VisitorLog {
  action: string;
  timestamp: Timestamp | null;
  projectId?: number;
  projectName?: string;
}

export interface Visitor {
  id: string;
  /** null for logs whose visitor document no longer exists. */
  firstVisit: Timestamp | null;
  logs: VisitorLog[];
}
