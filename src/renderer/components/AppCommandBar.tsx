import React from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SearchIcon from "@mui/icons-material/Search";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import TuneIcon from "@mui/icons-material/Tune";

interface AppCommandBarProps {
  effectiveDarkMode: boolean;
  isLoading: boolean;
  isOllamaAvailable: boolean;
  providerValue: string;
  modelValue: string;
  models: Array<{ name: string; status?: string; description?: string }>;
  searchTerm: string;
  filters: { type: string; date: string; size: string };
  onProviderChange: (event: SelectChangeEvent) => void;
  onModelChange: (event: SelectChangeEvent<string>) => void;
  onSearchTermChange: (value: string) => void;
  onFiltersChange: (filters: { type: string; date: string; size: string }) => void;
}

const selectSx = {
  minHeight: 38,
  "& .MuiSelect-select": {
    fontSize: "0.82rem",
    py: 0.75,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
};

const menuItemSx = { fontSize: "0.78rem" };

const AppCommandBar: React.FC<AppCommandBarProps> = ({
  effectiveDarkMode,
  isLoading,
  isOllamaAvailable,
  providerValue,
  modelValue,
  models,
  searchTerm,
  filters,
  onProviderChange,
  onModelChange,
  onSearchTermChange,
  onFiltersChange,
}) => {
  return (
    <Box
      data-testid="app-command-bar"
      data-surface="plain-band"
      sx={{
        px: { xs: 1, sm: 1.5, lg: 2 },
        py: 1,
        borderBottom: "1px solid",
        borderColor: effectiveDarkMode
          ? "rgba(255,255,255,0.08)"
          : "rgba(15,23,42,0.08)",
        backgroundColor: effectiveDarkMode
          ? "rgba(30,30,32,0.96)"
          : "rgba(255,255,255,0.96)",
        backdropFilter: "blur(14px)",
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "minmax(320px, 400px) minmax(280px, 1fr)",
            xl: "minmax(440px, 500px) minmax(360px, 1fr) auto",
          },
          gap: { xs: 1, md: 1.5 },
          alignItems: "center",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            py: 0.25,
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              width: 28,
              height: 28,
              display: { xs: "none", sm: "flex" },
              alignItems: "center",
              justifyContent: "center",
              color: "text.secondary",
              flexShrink: 0,
            }}
          >
            <SmartToyIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ minWidth: 88, display: { xs: "none", xl: "block" } }}>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "text.secondary",
                fontFamily: "var(--font-header)",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              AI Engine
            </Typography>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                color: "text.secondary",
                fontFamily: "var(--font-body)",
                whiteSpace: "nowrap",
              }}
            >
              Provider and model
            </Typography>
          </Box>
          {isLoading ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                color: "text.secondary",
              }}
            >
              <CircularProgress size={18} />
              <Typography variant="body2" sx={{ fontFamily: "var(--font-body)" }}>
                Loading models
              </Typography>
            </Box>
          ) : (
            <>
              <FormControl size="small" sx={{ minWidth: 110, flex: "0 0 118px" }}>
                <InputLabel sx={{ fontSize: "0.82rem" }}>Provider</InputLabel>
                <Select
                  value={providerValue}
                  label="Provider"
                  onChange={onProviderChange}
                  sx={selectSx}
                >
                  <MenuItem value="ollama" disabled={!isOllamaAvailable} sx={menuItemSx}>
                    Ollama
                  </MenuItem>
                  <MenuItem value="lmstudio" sx={menuItemSx}>
                    LM Studio
                  </MenuItem>
                  <MenuItem value="openai" sx={menuItemSx}>
                    OpenAI
                  </MenuItem>
                  <MenuItem value="anthropic" sx={menuItemSx}>
                    Anthropic
                  </MenuItem>
                  <MenuItem value="google" sx={menuItemSx}>
                    Google
                  </MenuItem>
                  <MenuItem value="openrouter" sx={menuItemSx}>
                    OpenRouter
                  </MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 140, flex: 1 }}>
                <InputLabel sx={{ fontSize: "0.82rem" }}>Model</InputLabel>
                <Select
                  value={modelValue}
                  label="Model"
                  onChange={onModelChange}
                  sx={selectSx}
                >
                  {models.map((model) => (
                    <MenuItem key={model.name} value={model.name} sx={menuItemSx}>
                      {model.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            py: 0.25,
            minWidth: 0,
          }}
        >
          <SearchIcon sx={{ color: "text.secondary", fontSize: 20, flexShrink: 0 }} />
          <TextField
            size="small"
            placeholder="Search files and folders..."
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            sx={{
              flex: 1,
              minWidth: 140,
              "& .MuiOutlinedInput-root": {
                height: 38,
                backgroundColor: effectiveDarkMode
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(255,255,255,0.82)",
              },
            }}
            InputProps={{
              sx: {
                height: 38,
                "& input": {
                  fontSize: "0.9rem",
                  py: 0.75,
                },
              },
            }}
          />
        </Box>

        <Box
          sx={{
            display: { xs: "none", xl: "flex" },
            alignItems: "center",
            gap: 0.75,
            py: 0.25,
          }}
        >
          <TuneIcon sx={{ color: "text.secondary", fontSize: 18 }} />
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontFamily: "var(--font-header)",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            Filters
          </Typography>
          <FormControl size="small" sx={{ width: 84 }}>
            <InputLabel sx={{ fontSize: "0.74rem" }}>Type</InputLabel>
            <Select
              value={filters.type}
              label="Type"
              onChange={(e) => onFiltersChange({ ...filters, type: e.target.value })}
              sx={selectSx}
            >
              <MenuItem value="any" sx={menuItemSx}>Any</MenuItem>
              <MenuItem value="files" sx={menuItemSx}>Files</MenuItem>
              <MenuItem value="folders" sx={menuItemSx}>Folders</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ width: 84 }}>
            <InputLabel sx={{ fontSize: "0.74rem" }}>Date</InputLabel>
            <Select
              value={filters.date}
              label="Date"
              onChange={(e) => onFiltersChange({ ...filters, date: e.target.value })}
              sx={selectSx}
            >
              <MenuItem value="any" sx={menuItemSx}>Any</MenuItem>
              <MenuItem value="24h" sx={menuItemSx}>24h</MenuItem>
              <MenuItem value="7d" sx={menuItemSx}>7d</MenuItem>
              <MenuItem value="30d" sx={menuItemSx}>30d</MenuItem>
              <MenuItem value="year" sx={menuItemSx}>Year</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ width: 96 }}>
            <InputLabel sx={{ fontSize: "0.74rem" }}>Size</InputLabel>
            <Select
              value={filters.size}
              label="Size"
              onChange={(e) => onFiltersChange({ ...filters, size: e.target.value })}
              sx={selectSx}
            >
              <MenuItem value="any" sx={menuItemSx}>Any</MenuItem>
              <MenuItem value="lt1" sx={menuItemSx}>{"<1MB"}</MenuItem>
              <MenuItem value="1to10" sx={menuItemSx}>1-10MB</MenuItem>
              <MenuItem value="10to100" sx={menuItemSx}>10-100MB</MenuItem>
              <MenuItem value=">100" sx={menuItemSx}>{">100MB"}</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>
    </Box>
  );
};

export default AppCommandBar;
