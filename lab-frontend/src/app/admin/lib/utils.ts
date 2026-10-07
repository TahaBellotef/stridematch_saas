export const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export const shortId = (value?: string | null) => {
  if (!value) return "-";
  return value.length > 10 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
};

export const statusLabel = (value?: string | null) => {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export const statusClass = (value?: string | null) => {
  switch (value) {
    case "completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "processing":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "failed":
      return "bg-red-100 text-red-800 border-red-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
};

export const formatText = (value?: string | null) => {
  if (!value) return "-";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const weeklyDistanceLabel = (value?: string | null) => {
  switch (value) {
    case "lt_10":
      return "< 10 km";
    case "10_25":
      return "10-25 km";
    case "25_50":
      return "25-50 km";
    case "gt_50":
      return "> 50 km";
    default:
      return formatText(value);
  }
};
