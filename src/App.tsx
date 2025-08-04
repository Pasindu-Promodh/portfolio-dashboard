// App.tsx
import { useAuth, AuthProvider } from "./context/AuthContext";
import Dashboard from "./pages/Dashboard";



// function AppContent() {
//   const { user, login } = useAuth();

//   if (!user) {
//     return (
//       <div
//         style={{
//           display: "flex",
//           height: "90vh",
//           // width: "100vw",
//           justifyContent: "center",
//           alignItems: "center",
//         }}
//       >
//         <button
//           onClick={login}
//           style={{
//             padding: "12px 24px",
//             fontSize: "16px",
//             borderRadius: "8px",
//             border: "none",
//             backgroundColor: "#1976d2",
//             color: "white",
//             cursor: "pointer",
//             boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
//             transition: "background-color 0.3s ease",
//           }}
//           onMouseOver={(e) =>
//             (e.currentTarget.style.backgroundColor = "#1565c0")
//           }
//           onMouseOut={(e) =>
//             (e.currentTarget.style.backgroundColor = "#1976d2")
//           }
//         >
//           Sign in with Google
//         </button>
//       </div>
//     );
//   }

//   return <Dashboard />;
// }

// export default function App() {
//   return (
//     <AuthProvider>
//       <AppContent />
//     </AuthProvider>
//   );
// }




// App.ts

export default function App() {
  return (
      <Dashboard />
  );
}
