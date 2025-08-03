import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  CircularProgress,
  Container,
  Divider,
} from "@mui/material";
import {
  Refresh,
  Logout,
  Email,
  LinkedIn,
  GitHub,
  Description,
} from "@mui/icons-material";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../services/firebase";
import type { Visitor } from "../types/Visitor";
import { useAuth } from "../context/AuthContext";

type ProjectView = {
  projectId: string;
  projectName: string;
  count: number;
};

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

  const fetchVisitors = useCallback(async () => {
    setLoading(true);
    const snapshot = await getDocs(collection(db, "visitors"));
    const projectViewCount: Record<string, ProjectView> = {};
    const actions = { email: 0, linkedin: 0, github: 0, resume: 0 };

    const visitorData = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const logsSnap = await getDocs(
          collection(db, "visitors", docSnap.id, "logs")
        );
        const logs = logsSnap.docs
          .map((log) => {
            const { action, timestamp, projectId, projectName } = log.data();

            if (action == "project" && projectId && projectName) {
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

    visitorData.sort((a, b) => {
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
    setVisitors(visitorData);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVisitors();
  }, [fetchVisitors]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        width: "100vw",
        m: 0,
        p: 0,
      }}
    >
      <Container
        maxWidth={false}
        disableGutters
        sx={{ py: { xs: 4, md: 6 }, px: { xs: 2, sm: 3, md: 4, lg: 6 } }}
      >
        {/* Header */}
        <Grid
          container
          alignItems="center"
          justifyContent="space-between"
          sx={{
            mb: { xs: 4, md: 5 },
            flexDirection: { xs: "column", sm: "row" },
          }}
        >
          <Grid item xs={12} sm="auto">
            <Button
              variant="contained"
              startIcon={<Refresh />}
              onClick={fetchVisitors}
              disabled={loading}
              fullWidth={false}
              sx={{
                borderRadius: 8,
                px: { xs: 3, md: 4 },
                py: 1.5,
                bgcolor: "primary.dark",
                "&:hover": {
                  bgcolor: "primary.main",
                  transform: "translateY(-2px)",
                },
                transition: "all 0.3s ease",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                fontSize: { xs: "0.85rem", md: "1rem" },
                mb: { xs: 2, sm: 0 },
              }}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          </Grid>

          <Grid item xs={12} sm="auto">
            <Typography
              variant="h3"
              align="center"
              sx={{
                fontWeight: "bold",
                color: "primary.main",
                letterSpacing: "-0.5px",
                textShadow: "1px 1px 4px rgba(0,0,0,0.1)",
                fontSize: { xs: "1.8rem", sm: "2.2rem", md: "3rem" },
                my: { xs: 2, sm: 0 },
              }}
            >
              Dashboard
            </Typography>
          </Grid>

          <Grid item xs={12} sm="auto">
            <Button
              variant="outlined"
              color="error"
              startIcon={<Logout />}
              onClick={logout}
              fullWidth={false}
              sx={{
                borderRadius: 8,
                px: { xs: 3, md: 4 },
                py: 1.5,
                borderColor: "error.main",
                color: "error.main",
                "&:hover": {
                  bgcolor: "error.light",
                  color: "white",
                  borderColor: "error.light",
                },
                transition: "all 0.3s ease",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                fontSize: { xs: "0.85rem", md: "1rem" },
                mb: { xs: 2, sm: 0 },
              }}
            >
              Logout
            </Button>
          </Grid>
        </Grid>

        {/* Action Icons */}
        <Grid
          container
          spacing={{ xs: 2, md: 3 }}
          justifyContent="center"
          sx={{ mb: { xs: 4, md: 5 } }}
        >
          {[
            {
              icon: (
                <Email
                  sx={{
                    color: "primary.main",
                    fontSize: { xs: 24, sm: 28, md: 32 },
                  }}
                />
              ),
              count: actionCounts.email,
              label: "Email",
            },
            {
              icon: (
                <LinkedIn
                  sx={{
                    color: "primary.main",
                    fontSize: { xs: 24, sm: 28, md: 32 },
                  }}
                />
              ),
              count: actionCounts.linkedin,
              label: "LinkedIn",
            },
            {
              icon: (
                <GitHub
                  sx={{
                    color: "primary.main",
                    fontSize: { xs: 24, sm: 28, md: 32 },
                  }}
                />
              ),
              count: actionCounts.github,
              label: "GitHub",
            },
            {
              icon: (
                <Description
                  sx={{
                    color: "primary.main",
                    fontSize: { xs: 24, sm: 28, md: 32 },
                  }}
                />
              ),
              count: actionCounts.resume,
              label: "Resume",
            },
          ].map((item, idx) => (
            <Grid item key={idx} xs={6} sm={3} md={2} lg={1.5}>
              <Tooltip title={item.label}>
                <IconButton
                  sx={{
                    bgcolor: "background.paper",
                    borderRadius: 3,
                    p: { xs: 1.2, sm: 1.5, md: 2 },
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    "&:hover": {
                      transform: "scale(1.1)",
                      bgcolor: "primary.light",
                    },
                    transition: "all 0.3s ease",
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {item.icon}
                  <Typography
                    variant="subtitle1"
                    sx={{
                      ml: 1,
                      fontWeight: "bold",
                      color: "text.primary",
                      fontSize: { xs: "0.8rem", sm: "0.9rem", md: "1rem" },
                    }}
                  >
                    {item.count}
                  </Typography>
                </IconButton>
              </Tooltip>
            </Grid>
          ))}
        </Grid>

        {/* Project Views */}
        <Card
          sx={{
            mb: { xs: 4, md: 5 },
            borderRadius: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            bgcolor: "background.paper",
            transition: "all 0.3s ease",
            "&:hover": { boxShadow: "0 12px 32px rgba(0,0,0,0.2)" },
          }}
        >
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Typography
              variant="h5"
              sx={{
                mb: 2,
                color: "secondary.main",
                fontWeight: "bold",
                letterSpacing: "0.5px",
                fontSize: { xs: "1.4rem", sm: "1.5rem", md: "1.75rem" },
              }}
            >
              Project Views
            </Typography>
            <Grid container spacing={{ xs: 1.5, md: 2 }} alignItems="stretch">
              {projectViews.map((pv, idx) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={idx}>
                  <Box
                    sx={{
                      border: "1px solid",
                      borderColor: "grey.200",
                      borderRadius: 3,
                      p: { xs: 1.5, md: 2 },
                      bgcolor: "background.default",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                      transition: "all 0.3s ease",
                      "&:hover": {
                        transform: "translateY(-4px)",
                        boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
                        bgcolor: "primary.light",
                      },
                      minHeight: { xs: 100, sm: 110, md: 120 }, // Reduced min height for compactness
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography
                      variant="h6"
                      fontWeight="bold"
                      sx={{
                        color: "text.primary",
                        fontSize: { xs: "0.85rem", sm: "0.9rem", md: "1rem" },
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "normal",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {pv.projectName}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        fontStyle: "italic",
                        fontSize: {
                          xs: "0.65rem",
                          sm: "0.7rem",
                          md: "0.75rem",
                        },
                      }}
                    >
                      ID: {pv.projectId}
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        mt: 0.5,
                        color: "primary.main",
                        fontWeight: "medium",
                        fontSize: { xs: "0.8rem", sm: "0.85rem", md: "0.9rem" },
                      }}
                    >
                      {pv.count} views
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>

        {/* Visitor Logs */}
        <Typography
          variant="h5"
          sx={{
            mb: 3,
            color: "secondary.main",
            fontWeight: "bold",
            letterSpacing: "0.5px",
            fontSize: { xs: "1.4rem", sm: "1.5rem", md: "1.75rem" },
          }}
        >
          Visitor Logs
        </Typography>
        {visitors.map((v) => (
          <Card
            key={v.id}
            sx={{
              mb: { xs: 3, md: 4 },
              borderRadius: 4,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              bgcolor: "background.paper",
              transition: "all 0.3s ease",
              "&:hover": { boxShadow: "0 12px 32px rgba(0,0,0,0.2)" },
            }}
          >
            <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
              <Typography
                variant="h6"
                fontWeight="bold"
                sx={{
                  color: "text.primary",
                  fontSize: { xs: "1.1rem", sm: "1.25rem", md: "1.5rem" },
                }}
              >
                ID: {v.id}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  mb: 2,
                  fontSize: { xs: "0.8rem", sm: "0.875rem", md: "1rem" },
                }}
              >
                First Visit:{" "}
                {v.firstVisit?.toDate?.().toLocaleString() ?? "Unknown"}
              </Typography>
              <Divider sx={{ my: 2, bgcolor: "grey.200" }} />
              <Typography
                variant="body1"
                fontWeight="bold"
                sx={{
                  color: "text.primary",
                  mb: 1.5,
                  fontSize: { xs: "0.9rem", sm: "1rem", md: "1.125rem" },
                }}
              >
                Logs:
              </Typography>
              <ul style={{ paddingLeft: "1.5rem", margin: 0 }}>
                {v.logs.map((log, idx) => (
                  <li
                    key={idx}
                    style={{ marginBottom: "0.75rem", color: "text.secondary" }}
                  >
                    <Typography
                      variant="body2"
                      component="span"
                      sx={{
                        color: "text.primary",
                        fontSize: { xs: "0.8rem", sm: "0.875rem", md: "1rem" },
                      }}
                    >
                      {log.action}
                    </Typography>
                    <Typography
                      variant="body2"
                      component="span"
                      sx={{
                        color: "text.secondary",
                        ml: 1,
                        fontSize: { xs: "0.8rem", sm: "0.875rem", md: "1rem" },
                      }}
                    >
                      @{" "}
                      {log.timestamp?.toDate?.().toLocaleString() ?? "Unknown"}
                    </Typography>
                    {log.projectName && log.projectId && (
                      <Typography
                        variant="body2"
                        component="span"
                        sx={{
                          color: "primary.main",
                          ml: 1,
                          fontSize: {
                            xs: "0.8rem",
                            sm: "0.875rem",
                            md: "1rem",
                          },
                        }}
                      >
                        → {log.projectName} ({log.projectId})
                      </Typography>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}

        {loading && (
          <Box display="flex" justifyContent="center" mt={5}>
            <CircularProgress size={48} sx={{ color: "primary.main" }} />
          </Box>
        )}
      </Container>
    </Box>
  );
}
