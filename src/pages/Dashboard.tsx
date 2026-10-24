// Dashboard.tsx
import React from "react";
import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  FormControl,
  MenuItem,
  TextField,
} from "@mui/material";
import MuiAlert from "@mui/material/Alert";
import type { AlertProps } from "@mui/material/Alert";
import {
  Refresh,
  Logout,
  Email,
  LinkedIn,
  GitHub,
  Description,
  Delete,
  ExpandLess,
  ExpandMore,
  People,
} from "@mui/icons-material";
import {
  doc,
  collection,
  collectionGroup,
  getDocs,
  query,
  where,
  writeBatch,
  Timestamp,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "../services/db";
import type { Visitor, VisitorLog } from "../types/Visitor";
import { useAuth } from "../context/useAuth";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";

type ProjectView = {
  projectId: number;
  projectName: string;
  count: number;
};

type DateFilter = "all" | "today" | "week" | "month" | "custom";

const ACTION_KEYS = ["email", "linkedin", "github", "resume"] as const;
type ActionKey = (typeof ACTION_KEYS)[number];
type ActionCounts = Record<ActionKey, number>;

const isActionKey = (action: string): action is ActionKey =>
  (ACTION_KEYS as readonly string[]).includes(action);

type DateRange = { start: Date; end?: Date };

// The time window for the selected filter, or null for "all time".
function getDateRange(
  filter: DateFilter,
  customStart: Date | null,
  customEnd: Date | null
): DateRange | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filter) {
    case "today":
      return { start: today };
    case "week":
      return { start: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000) };
    case "month":
      return {
        start: new Date(today.getFullYear(), today.getMonth() - 1, today.getDate()),
      };
    case "custom": {
      if (!customStart && !customEnd) return null;
      const start = customStart
        ? new Date(customStart.getFullYear(), customStart.getMonth(), customStart.getDate())
        : new Date(0);
      const end = customEnd
        ? new Date(customEnd.getFullYear(), customEnd.getMonth(), customEnd.getDate(), 23, 59, 59, 999)
        : undefined;
      return { start, end };
    }
    default:
      return null;
  }
}

const inRange = (ts: Timestamp | null, range: DateRange) => {
  if (!ts) return true;
  const date = ts.toDate();
  return date >= range.start && (!range.end || date <= range.end);
};

const millis = (ts: Timestamp | null | undefined) => ts?.toMillis() ?? 0;

// Firestore batches are capped at 500 writes.
async function deleteInChunks(refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += 500) {
    const batch = writeBatch(db);
    refs.slice(i, i + 500).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

function describeError(err: unknown, fallback: string) {
  const code = (err as { code?: string }).code;
  if (code === "permission-denied") {
    return "This Google account isn't allowed to access the analytics data.";
  }
  if (code === "failed-precondition") {
    return "Firestore index missing: run `firebase deploy --only firestore` in portfolio2.";
  }
  return fallback;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  props,
  ref
) {
  return <MuiAlert elevation={6} variant="filled" ref={ref} {...props} />;
});

export default function Dashboard() {
  const { logout } = useAuth();

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectViews, setProjectViews] = useState<ProjectView[]>([]);
  const [actionCounts, setActionCounts] = useState({
    email: 0,
    linkedin: 0,
    github: 0,
    resume: 0,
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "error">(
    "success"
  );
  const [expandedVisitors, setExpandedVisitors] = useState<Set<string>>(
    new Set()
  );
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);

  const notify = (message: string, severity: "success" | "error") => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  const fetchVisitors = useCallback(async () => {
    setLoading(true);
    try {
      const range = getDateRange(dateFilter, customStartDate, customEndDate);

      // Two queries total (instead of one per visitor); the date filter
      // runs in Firestore so only matching logs are read.
      const logsQuery = range
        ? query(
            collectionGroup(db, "logs"),
            where("timestamp", ">=", Timestamp.fromDate(range.start)),
            ...(range.end
              ? [where("timestamp", "<=", Timestamp.fromDate(range.end))]
              : [])
          )
        : collectionGroup(db, "logs");

      const [visitorSnap, logSnap] = await Promise.all([
        getDocs(collection(db, "visitors")),
        getDocs(logsQuery),
      ]);

      const byId = new Map<string, Visitor>();
      for (const docSnap of visitorSnap.docs) {
        byId.set(docSnap.id, {
          id: docSnap.id,
          firstVisit: docSnap.data().firstVisit ?? null,
          logs: [],
        });
      }

      const projectViewCount: Record<string, ProjectView> = {};
      const actions: ActionCounts = { email: 0, linkedin: 0, github: 0, resume: 0 };

      for (const logDoc of logSnap.docs) {
        const visitorRef = logDoc.ref.parent.parent;
        if (!visitorRef || visitorRef.parent.id !== "visitors") continue;

        const { action, timestamp, projectId, projectName } =
          logDoc.data() as VisitorLog;

        let visitor = byId.get(visitorRef.id);
        if (!visitor) {
          visitor = { id: visitorRef.id, firstVisit: null, logs: [] };
          byId.set(visitorRef.id, visitor);
        }
        visitor.logs.push({ action, timestamp: timestamp ?? null, projectId, projectName });

        if (action === "project" && projectId && projectName) {
          const key = `${projectId}|${projectName}`;
          projectViewCount[key] ??= { projectId, projectName, count: 0 };
          projectViewCount[key].count++;
        }
        if (isActionKey(action)) actions[action]++;
      }

      // A visitor is shown if they were active in the range or first arrived
      // in it, so the list matches the stats computed from the same logs.
      const filteredVisitors = [...byId.values()].filter(
        (v) => !range || v.logs.length > 0 || inRange(v.firstVisit, range)
      );
      for (const v of filteredVisitors) {
        v.logs.sort((a, b) => millis(b.timestamp) - millis(a.timestamp));
      }
      const lastActivity = (v: Visitor) =>
        millis(v.logs[0]?.timestamp) || millis(v.firstVisit);
      filteredVisitors.sort((a, b) => lastActivity(b) - lastActivity(a));

      setProjectViews(
        Object.values(projectViewCount).sort((a, b) => b.count - a.count)
      );
      setActionCounts(actions);
      setVisitors(filteredVisitors);
    } catch (error) {
      console.error("Error fetching visitors:", error);
      notify(describeError(error, "Failed to fetch visitors"), "error");
    } finally {
      setLoading(false);
    }
  }, [dateFilter, customStartDate, customEndDate]);

  const getLogRefs = async (visitorId: string) =>
    (await getDocs(collection(db, "visitors", visitorId, "logs"))).docs.map(
      (logDoc) => logDoc.ref
    );

  // Confirmation happens in the delete dialog.
  const deleteVisitor = async (visitorId: string) => {
    setLoading(true);
    try {
      // Visitor doc goes last so a partial failure never orphans its logs.
      await deleteInChunks([
        ...(await getLogRefs(visitorId)),
        doc(db, "visitors", visitorId),
      ]);
      setVisitors((prev) => prev.filter((v) => v.id !== visitorId));
      notify("Visitor deleted successfully", "success");
    } catch (err) {
      console.error("Error deleting visitor:", err);
      notify(describeError(err, "Failed to delete visitor"), "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteLogsOnly = async (visitorId: string) => {
    setLoading(true);
    try {
      await deleteInChunks(await getLogRefs(visitorId));
      setVisitors((prev) =>
        prev.map((v) => (v.id === visitorId ? { ...v, logs: [] } : v))
      );
      notify("Logs deleted successfully", "success");
    } catch (err) {
      console.error("Error deleting logs:", err);
      notify(describeError(err, "Failed to delete logs"), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChoice = async (choice: "all" | "logs") => {
    if (!selectedVisitorId) return;
    setDeleting(true);

    try {
      if (choice === "all") {
        await deleteVisitor(selectedVisitorId);
      } else {
        await deleteLogsOnly(selectedVisitorId);
      }
    } finally {
      setDeleting(false);
      closeDeleteDialog();
    }
  };

  const openDeleteDialog = (visitorId: string) => {
    setSelectedVisitorId(visitorId);
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setSelectedVisitorId(null);
  };

  useEffect(() => {
    fetchVisitors();
  }, [fetchVisitors]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "grey.50", // Changed to a softer background
        m: 0,
        p: 0,
      }}
    >
      <Box
        sx={{
          py: { xs: 3, md: 4 },
          px: { xs: 2, sm: 3, md: 4 },
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 3,
            bgcolor: "background.paper",
            borderRadius: 3,
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            border: "1px solid",
            borderColor: "grey.200",
            mb: 4,
          }}
        >
          <Box
            display="flex"
            flexDirection={{ xs: "column", sm: "row" }}
            alignItems={{ xs: "stretch", sm: "center" }}
            justifyContent="space-between"
            gap={3}
          >
            {/* Action Buttons - Show first on mobile */}
            <Box
              display="flex"
              gap={2}
              flexWrap="wrap"
              alignSelf={{ xs: "stretch", sm: "flex-end" }}
              order={{ xs: 1, sm: 2 }}
            >
              <Button
                variant="contained"
                startIcon={<Refresh />}
                onClick={fetchVisitors}
                disabled={loading}
                sx={{
                  borderRadius: 2,
                  px: 3,
                  py: 1.2,
                  fontWeight: 600,
                  textTransform: "none",
                  boxShadow: "0 4px 12px rgba(25, 118, 210, 0.3)",
                  "&:hover": {
                    boxShadow: "0 6px 16px rgba(25, 118, 210, 0.4)",
                    transform: "translateY(-1px)",
                  },
                  transition: "all 0.3s ease",
                }}
              >
                Refresh
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<Logout />}
                onClick={logout}
                sx={{
                  borderRadius: 2,
                  px: 3,
                  py: 1.2,
                  fontWeight: 600,
                  textTransform: "none",
                  borderWidth: 2,
                  "&:hover": {
                    borderWidth: 2,
                    transform: "translateY(-1px)",
                    boxShadow: "0 4px 12px rgba(244, 67, 54, 0.2)",
                  },
                  transition: "all 0.3s ease",
                }}
              >
                Logout
              </Button>
            </Box>

            {/* Date Filter Section - Show second on mobile */}
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <Box 
                display="flex" 
                gap={2} 
                flexWrap="wrap" 
                alignItems="center"
                order={{ xs: 2, sm: 1 }}
              >
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <TextField
                    select
                    size="small"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                    label="Date Range"
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="all">All Time</MenuItem>
                    <MenuItem value="today">Today</MenuItem>
                    <MenuItem value="week">Last 7 Days</MenuItem>
                    <MenuItem value="month">Last 30 Days</MenuItem>
                    <MenuItem value="custom">Custom Range</MenuItem>
                  </TextField>
                </FormControl>

                {dateFilter === "custom" && (
                  <>
                    <DatePicker
                      label="Start Date"
                      value={customStartDate}
                      onChange={setCustomStartDate}
                      slotProps={{
                        textField: {
                          size: "small",
                          sx: { borderRadius: 2, minWidth: 140 },
                        },
                      }}
                    />
                    <DatePicker
                      label="End Date"
                      value={customEndDate}
                      onChange={setCustomEndDate}
                      slotProps={{
                        textField: {
                          size: "small",
                          sx: { borderRadius: 2, minWidth: 140 },
                        },
                      }}
                    />
                  </>
                )}
              </Box>
            </LocalizationProvider>
          </Box>
        </Box>

        {/* Stats */}
        <Box
          display="flex"
          justifyContent="center"
          mb={{ xs: 3, md: 3 }}
          width="100%"
        >
          <Box
            display="flex"
            gap={{ xs: 1.5, sm: 2, md: 2.5 }}
            flexWrap="wrap"
            justifyContent="center"
            alignItems="stretch"
            width="100%"
            maxWidth="800px"
          >
            {[
              {
                icon: (
                  <People
                    sx={{
                      color: "#9c27b0",
                      fontSize: { xs: 16, md: 26 },
                      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
                    }}
                  />
                ),
                count: visitors.length,
                label: "Total Visitors",
                color: "#9c27b0",
                bgGradient: "linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)",
              },
              {
                icon: (
                  <Email
                    sx={{
                      color: "primary.main",
                      fontSize: { xs: 16, md: 26 },
                      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
                    }}
                  />
                ),
                count: actionCounts.email,
                label: "Email",
                color: "#1976d2",
                bgGradient: "linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)",
              },
              {
                icon: (
                  <LinkedIn
                    sx={{
                      color: "#0077b5",
                      fontSize: { xs: 16, md: 26 },
                      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
                    }}
                  />
                ),
                count: actionCounts.linkedin,
                label: "LinkedIn",
                color: "#0077b5",
                bgGradient: "linear-gradient(135deg, #e1f5fe 0%, #b3e5fc 100%)",
              },
              {
                icon: (
                  <GitHub
                    sx={{
                      color: "#333",
                      fontSize: { xs: 16, md: 26 },
                      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
                    }}
                  />
                ),
                count: actionCounts.github,
                label: "GitHub",
                color: "#333",
                bgGradient: "linear-gradient(135deg, #fafafa 0%, #eeeeee 100%)",
              },
              {
                icon: (
                  <Description
                    sx={{
                      color: "#f57c00",
                      fontSize: { xs: 16, md: 26 },
                      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
                    }}
                  />
                ),
                count: actionCounts.resume,
                label: "Resume",
                color: "#f57c00",
                bgGradient: "linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)",
              },
            ].map((item, idx) => (
              <Box
                key={idx}
                sx={{
                  flex: { xs: "1 1 calc(25% - 4px)", sm: "1 1 0" },
                  maxWidth: { xs: "none", sm: "180px" },
                  minWidth: { xs: "70px", sm: "140px" },
                }}
              >
                <Tooltip title={item.label} arrow placement="top">
                  <Box
                    sx={{
                      background: item.bgGradient,
                      borderRadius: 3,
                      p: { xs: 1, md: 2 },
                      boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                      border: "1px solid rgba(255,255,255,0.8)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: { xs: 0.5, md: 1 },
                      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                      cursor: "pointer",
                      position: "relative",
                      overflow: "hidden",
                      "&:hover": {
                        transform: "translateY(-4px) scale(1.02)",
                        boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
                        "&::before": {
                          opacity: 1,
                        },
                      },
                      "&::before": {
                        content: '""',
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background:
                          "linear-gradient(45deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 100%)",
                        opacity: 0,
                        transition: "opacity 0.3s ease",
                      },
                      minHeight: { xs: 65, md: 100 },
                    }}
                  >
                    {item.icon}
                    <Typography
                      variant="h5"
                      sx={{
                        fontWeight: 700,
                        fontSize: { xs: "1rem", md: "1.4rem" },
                        color: item.color,
                        textShadow: "0 1px 2px rgba(0,0,0,0.1)",
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      {item.count}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: { xs: "0.6rem", md: "0.75rem" },
                        color: "text.secondary",
                        textAlign: "center",
                        fontWeight: 600,
                        position: "relative",
                        zIndex: 1,
                        textTransform: "uppercase",
                        letterSpacing: "0.3px",
                      }}
                    >
                      {item.label}
                    </Typography>
                  </Box>
                </Tooltip>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Project Views */}
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Box
            sx={{
              width: 4,
              height: 20,
              bgcolor: "primary.main",
              borderRadius: 2,
            }}
          />
          <Typography
            variant="h6"
            fontWeight="600"
            sx={{
              color: "text.primary",
              letterSpacing: "-0.01em",
            }}
          >
            Project Views
          </Typography>
        </Box>

        <Box display="flex" flexWrap="wrap" gap={1.5} sx={{ mb: 3 }}>
          {projectViews.map((pv, idx) => (
            <Box
              key={idx}
              sx={{
                flex: {
                  xs: "1 1 100%",
                  sm: "1 1 calc(50% - 6px)",
                  md: "1 1 calc(33.333% - 8px)",
                  lg: "1 1 calc(25% - 9px)",
                },
              }}
            >
              <Box
                sx={{
                  border: "1px solid",
                  borderColor: "grey.200",
                  borderRadius: 2,
                  p: { xs: 1, sm: 1.5 },
                  bgcolor: "background.paper",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  minHeight: { xs: 50, sm: 85 },
                  display: "flex",
                  flexDirection: { xs: "row", sm: "column" },
                  alignItems: { xs: "center", sm: "flex-start" },
                  justifyContent: { xs: "space-between", sm: "space-between" },
                  gap: { xs: 0.75, sm: 0.5 },
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  "&:hover": {
                    borderColor: "primary.main",
                    transform: "translateY(-1px)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    bgcolor: "primary.50",
                  },
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", sm: "column" },
                    gap: { xs: 0.125, sm: 0.5 },
                    flex: { xs: 1, sm: "auto" },
                  }}
                >
                  <Typography
                    variant="body2"
                    fontWeight="600"
                    noWrap
                    sx={{
                      color: "text.primary",
                      fontSize: { xs: "0.8rem", sm: "0.9rem" },
                    }}
                  >
                    {pv.projectName}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      fontSize: { xs: "0.6rem", sm: "0.7rem" },
                      fontFamily: "monospace",
                      bgcolor: "grey.100",
                      px: { xs: 0.375, sm: 0.5 },
                      py: { xs: 0.125, sm: 0.25 },
                      borderRadius: 0.5,
                      alignSelf: "flex-start",
                    }}
                  >
                    ID: {pv.projectId}
                  </Typography>
                </Box>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: "primary.main",
                    fontWeight: 600,
                    fontSize: { xs: "0.8rem", sm: "0.95rem" },
                    flexShrink: 0,
                  }}
                >
                  {pv.count} views
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* Visitor Logs */}
        <Box display="flex" alignItems="center" gap={2} mb={2}>
          <Box
            sx={{
              width: 4,
              height: 20,
              bgcolor: "primary.main",
              borderRadius: 2,
            }}
          />
          <Typography
            variant="h6"
            fontWeight="600"
            sx={{
              color: "text.primary",
              letterSpacing: "-0.01em",
            }}
          >
            Visitor Logs
          </Typography>
        </Box>

        {visitors.map((visitor) => {
          const isExpanded = expandedVisitors.has(visitor.id);

          const toggleExpanded = (visitorId: string) => {
            setExpandedVisitors((prev) => {
              const newSet = new Set(prev);
              if (newSet.has(visitorId)) {
                newSet.delete(visitorId);
              } else {
                newSet.add(visitorId);
              }
              return newSet;
            });
          };

          return (
            <Card
              key={visitor.id}
              sx={{
                mb: 2,
                borderRadius: 2,
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                border: "1px solid",
                borderColor: "grey.200",
                transition: "all 0.3s ease",
                "&:hover": {
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  transform: "translateY(-1px)",
                },
              }}
            >
              <CardContent sx={{ p: 2 }}>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  mb={1.5}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="subtitle2"
                      fontWeight="600"
                      sx={{
                        color: "text.primary",
                        fontFamily: "monospace",
                        fontSize: "0.9rem",
                      }}
                    >
                      ID: {visitor.id}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 0.25, fontSize: "0.75rem" }}
                    >
                      First Visit:{" "}
                      {visitor.firstVisit?.toDate?.()?.toLocaleString() ??
                        "Unknown"}
                    </Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={1}>
                    <IconButton
                      onClick={() => toggleExpanded(visitor.id)}
                      size="small"
                      sx={{
                        bgcolor: "primary.50",
                        "&:hover": {
                          bgcolor: "primary.100",
                          transform: "scale(1.05)",
                        },
                        transition: "all 0.2s ease",
                      }}
                    >
                      {isExpanded ? (
                        <ExpandLess fontSize="small" />
                      ) : (
                        <ExpandMore fontSize="small" />
                      )}
                    </IconButton>
                    <Tooltip title="Delete Options" arrow>
                      <IconButton
                        color="error"
                        onClick={() => openDeleteDialog(visitor.id)}
                        size="small"
                        sx={{
                          bgcolor: "error.50",
                          "&:hover": {
                            bgcolor: "error.100",
                            transform: "scale(1.05)",
                          },
                          transition: "all 0.2s ease",
                        }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>

                {isExpanded && (
                  <>
                    <Divider sx={{ my: 1.5, bgcolor: "grey.200" }} />
                    <Typography
                      variant="body2"
                      fontWeight="600"
                      mb={1}
                      sx={{ color: "text.primary" }}
                    >
                      Activity Logs:
                    </Typography>
                    {visitor.logs.length === 0 ? (
                      <Box
                        sx={{
                          p: 2,
                          textAlign: "center",
                          bgcolor: "grey.50",
                          borderRadius: 1.5,
                          border: "1px dashed",
                          borderColor: "grey.300",
                        }}
                      >
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          fontStyle="italic"
                        >
                          No activity logs available
                        </Typography>
                      </Box>
                    ) : (
                      <Box sx={{ pl: 0 }}>
                        {visitor.logs.map((log, idx) => (
                          <Box
                            key={idx}
                            sx={{
                              p: 1.5,
                              mb: 0.75,
                              bgcolor: "grey.50",
                              borderRadius: 1.5,
                              border: "1px solid",
                              borderColor: "grey.100",
                              "&:last-child": { mb: 0 },
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{
                                wordBreak: "break-word",
                                overflowWrap: "break-word",
                                whiteSpace: "normal",
                                overflow: "hidden",
                                lineHeight: 1.4,
                                fontSize: "0.8rem",
                              }}
                            >
                              <Box
                                component="span"
                                sx={{
                                  fontWeight: 600,
                                  color: "primary.main",
                                  bgcolor: "primary.50",
                                  px: 0.75,
                                  py: 0.25,
                                  borderRadius: 0.75,
                                  fontSize: "0.7rem",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.3px",
                                }}
                              >
                                {log.action}
                              </Box>
                              <Box
                                component="span"
                                sx={{ mx: 0.75, color: "text.secondary" }}
                              >
                                @
                              </Box>
                              <Box
                                component="span"
                                sx={{
                                  fontFamily: "monospace",
                                  fontSize: "0.75rem",
                                  color: "text.secondary",
                                }}
                              >
                                {log.timestamp?.toDate?.()?.toLocaleString() ??
                                  "Unknown"}
                              </Box>
                              {log.projectName && (
                                <Box
                                  component="span"
                                  sx={{
                                    ml: 0.75,
                                    color: "text.primary",
                                    fontWeight: 500,
                                  }}
                                >
                                  → {log.projectName}{" "}
                                  <Box
                                    component="span"
                                    sx={{
                                      fontFamily: "monospace",
                                      fontSize: "0.7rem",
                                      color: "text.secondary",
                                      bgcolor: "grey.200",
                                      px: 0.375,
                                      py: 0.125,
                                      borderRadius: 0.375,
                                    }}
                                  >
                                    ({log.projectId})
                                  </Box>
                                </Box>
                              )}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}

        {loading && (
          <Box
            display="flex"
            justifyContent="center"
            mt={4}
            sx={{
              p: 4,
              bgcolor: "background.paper",
              borderRadius: 3,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
          >
            <CircularProgress size={48} thickness={4} />
          </Box>
        )}
      </Box>

      <Dialog
        open={deleteDialogOpen}
        onClose={closeDeleteDialog}
        PaperProps={{
          sx: {
            borderRadius: 3,
            minWidth: { xs: "auto", sm: 400 },
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 600 }}>
          Delete Visitor Data
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mt: 1, lineHeight: 1.6 }}>
            What would you like to delete for visitor ID:{" "}
            <Box
              component="span"
              sx={{
                fontWeight: 600,
                color: "primary.main",
                fontFamily: "monospace",
              }}
            >
              {selectedVisitorId}
            </Box>
            ?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 1 }}>
          <Button
            onClick={() => handleDeleteChoice("logs")}
            color="warning"
            disabled={deleting}
            variant="outlined"
            sx={{ borderRadius: 2, textTransform: "none" }}
          >
            Delete Logs Only
          </Button>
          <Button
            onClick={() => handleDeleteChoice("all")}
            color="error"
            disabled={deleting}
            variant="contained"
            sx={{ borderRadius: 2, textTransform: "none" }}
          >
            Delete Visitor
          </Button>
          <Button
            onClick={closeDeleteDialog}
            sx={{ borderRadius: 2, textTransform: "none" }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          sx={{
            width: "100%",
            borderRadius: 2,
            fontWeight: 500,
          }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
