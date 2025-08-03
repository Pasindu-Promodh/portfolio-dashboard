import type { ReactNode } from "react";

export interface Visitor {
  id: string;
  firstVisit: any; // Firestore Timestamp
  logs: {
    projectName: ReactNode;
    projectId: ReactNode;
    action: string;
    timestamp: any; // Firestore Timestamp
  }[];
}
