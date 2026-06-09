"use client";

import { createTheme, CssBaseline, ThemeProvider } from "@mui/material";

const logoGreen = "#2f9e44";
const logoOrange = "#f08c00";
const dashboardBackground = "#fbf7ef";
const paperBackground = "#fffaf2";
const dashboardText = "#17251b";

const theme = createTheme({
  palette: {
    primary: {
      main: logoGreen,
      dark: "#237a35",
      light: "#69bf79",
      contrastText: "#ffffff",
    },
    secondary: {
      main: logoOrange,
      dark: "#b96b00",
      light: "#ffb24d",
      contrastText: "#1d1408",
    },
    background: {
      default: dashboardBackground,
      paper: paperBackground,
    },
    divider: "rgba(47, 158, 68, 0.18)",
    text: {
      primary: dashboardText,
      secondary: "#5f6d61",
    },
    action: {
      hover: "rgba(47, 158, 68, 0.08)",
      selected: "rgba(47, 158, 68, 0.12)",
      disabledBackground: "rgba(47, 158, 68, 0.16)",
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: paperBackground,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          fontWeight: 700,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: logoOrange,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          "&.Mui-selected": {
            borderLeft: `3px solid ${logoGreen}`,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: paperBackground,
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
