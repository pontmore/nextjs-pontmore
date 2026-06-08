"use client";

import { createTheme, CssBaseline, ThemeProvider } from "@mui/material";

const dashboardBackground = "#f6f2ea";

const theme = createTheme({
  palette: {
    background: {
      default: dashboardBackground,
      paper: dashboardBackground,
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
  },
});

export function MuiThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
