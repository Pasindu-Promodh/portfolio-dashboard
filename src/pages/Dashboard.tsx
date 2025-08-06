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
import { doc, collection, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../services/firebase";
import type { Visitor } from "../types/Visitor";
import { useAuth } from "../context/AuthContext";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";

type ProjectView = {
  projectId: string;
  projectName: string;
  count: number;
};

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
  const [dateFilter, setDateFilter] = useState<
    "all" | "today" | "week" | "month" | "custom"
  >("all");
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);

  const fetchVisitors = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, "visitors"));
      const projectViewCount: Record<string, ProjectView> = {};
      const actions = { email: 0, linkedin: 0, github: 0, resume: 0 };

      const visitorData = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const logsSnap = await getDocs(
            collection(db, "visitors", docSnap.id, "logs")
          );

          // Filter logs by date BEFORE processing them
          const allLogs = logsSnap.docs.map((log) => ({
            ...log.data(),
            action: log.data().action,
            timestamp: log.data().timestamp,
            projectId: log.data().projectId,
            projectName: log.data().projectName,
          }));

          const filteredLogs = filterByDate(allLogs, "timestamp");

          const logs = filteredLogs
            .map((logData) => {
              const { action, timestamp, projectId, projectName } = logData;

              // Only count actions and projects from filtered logs
              if (action === "project" && projectId && projectName) {
                const key = `${projectId}|${projectName}`;
                if (!projectViewCount[key]) {
                  projectViewCount[key] = { projectId, projectName, count: 0 };
                }
                projectViewCount[key].count++;
              }

              if (actions[action as keyof typeof actions] !== undefined) {
                actions[action as keyof typeof actions]++;
              }

              return { action, timestamp, projectId, projectName };
            })
            .sort((a, b) => {
              const aTime = a.timestamp?.toDate?.()?.getTime?.() || 0;
              const bTime = b.timestamp?.toDate?.()?.getTime?.() || 0;
              return bTime - aTime;
            });

          return {
            id: docSnap.id,
            firstVisit: docSnap.data().firstVisit,
            logs,
          };
        })
      );

      // Filter visitors by their first visit date
      const filteredVisitors = filterByDate(visitorData, "firstVisit");

      // Sort filtered visitors
      filteredVisitors.sort((a, b) => {
        const aTime =
          a.logs[0]?.timestamp?.toDate?.()?.getTime?.() ||
          a.firstVisit?.toDate?.()?.getTime?.() ||
          0;
        const bTime =
          b.logs[0]?.timestamp?.toDate?.()?.getTime?.() ||
          b.firstVisit?.toDate?.()?.getTime?.() ||
          0;
        return bTime - aTime;
      });

      setProjectViews(
        Object.values(projectViewCount).sort((a, b) => b.count - a.count)
      );
      setActionCounts(actions);
      setVisitors(filteredVisitors);
    } catch (error) {
      console.error("Error fetching visitors:", error);
      setSnackbarMessage("Failed to fetch visitors");
      setSnackbarSeverity("error");
      setSnackbarOpen(true);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, customStartDate, customEndDate]); // Add dependencies here

  const deleteVisitor = useCallback(async (visitorId: string) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete visitor ${visitorId}?`
    );
    if (!confirmDelete) return;

    setLoading(true);
    try {
      const logsRef = collection(db, "visitors", visitorId, "logs");
      const logsSnap = await getDocs(logsRef);
      const batch = writeBatch(db);

      logsSnap.docs.forEach((logDoc) => {
        batch.delete(logDoc.ref);
      });

      batch.delete(doc(db, "visitors", visitorId));
      await batch.commit();

      setVisitors((prev) => prev.filter((v) => v.id !== visitorId));
      setSnackbarMessage("Visitor deleted successfully");
      setSnackbarSeverity("success");
      setSnackbarOpen(true);
    } catch (err) {
      console.error("Error deleting visitor:", err);
      setSnackbarMessage("Failed to delete visitor");
      setSnackbarSeverity("error");
      setSnackbarOpen(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteLogsOnly = useCallback(async (visitorId: string) => {
    const confirmDelete = window.confirm(
      `Delete only logs for visitor ${visitorId}?`
    );
    if (!confirmDelete) return;

    setLoading(true);
    try {
      const logsRef = collection(db, "visitors", visitorId, "logs");
      const logsSnap = await getDocs(logsRef);
      const batch = writeBatch(db);

      logsSnap.docs.forEach((logDoc) => {
        batch.delete(logDoc.ref);
      });

      await batch.commit();

      setVisitors((prev) =>
        prev.map((v) => (v.id === visitorId ? { ...v, logs: [] } : v))
      );
      setSnackbarMessage("Logs deleted successfully");
      setSnackbarSeverity("success");
      setSnackbarOpen(true);
    } catch (err) {
      console.error("Error deleting logs:", err);
      setSnackbarMessage("Failed to delete logs");
      setSnackbarSeverity("error");
      setSnackbarOpen(true);
    } finally {
      setLoading(false);
    }
  }, []);

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
  }, [fetchVisitors, dateFilter, customStartDate, customEndDate]);

  // Add this helper function to filter data by date:
  const filterByDate = (items: any[], dateField: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      today.getDate()
    );

    return items.filter((item) => {
      const itemDate = item[dateField]?.toDate?.() || new Date(item[dateField]);
      if (!itemDate || isNaN(itemDate.getTime())) return true;

      switch (dateFilter) {
        case "today":
          return itemDate >= today;
        case "week":
          return itemDate >= weekAgo;
        case "month":
          return itemDate >= monthAgo;
        case "custom":
          if (!customStartDate && !customEndDate) return true;
          const start = customStartDate
            ? new Date(
                customStartDate.getFullYear(),
                customStartDate.getMonth(),
                customStartDate.getDate()
              )
            : new Date(0);
          const end = customEndDate
            ? new Date(
                customEndDate.getFullYear(),
                customEndDate.getMonth(),
                customEndDate.getDate(),
                23,
                59,
                59
              )
            : new Date();
          return itemDate >= start && itemDate <= end;
        default:
          return true;
      }
    });
  };

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
                    onChange={(e) => setDateFilter(e.target.value as any)}
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
            minWidth: 400,
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
