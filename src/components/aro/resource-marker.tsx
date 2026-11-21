const CRATE_COLORS = {
  yellow: { body: "#FFD84D", strap: "#E58A1F", outline: "#5B4A1E" },
  pink: { body: "#FF9FC0", strap: "#FFF1A6", outline: "#6B4C57" },
  purple: { body: "#C9B6FF", strap: "#FFF1A6", outline: "#5C547A" },
  peach: { body: "#FFB38A", strap: "#FFF1A6", outline: "#7A5848" },
  green: { body: "#7CC95D", strap: "#FFF1A6", outline: "#3F6B34" },
  white: { body: "#FFFAF0", strap: "#F5C518", outline: "#6B675B" },
} as const;

export type MarkerColor = keyof typeof CRATE_COLORS;

export function ResourceMarker({
  color = "yellow",
  size = 20,
}: {
  color?: MarkerColor;
  size?: number;
}) {
  const palette = CRATE_COLORS[color];
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0, imageRendering: "pixelated" }}
    >
      <rect x="5" y="0" width="6" height="2" fill={palette.strap} />
      <rect x="1" y="2" width="14" height="14" fill={palette.outline} />
      <rect x="3" y="4" width="10" height="10" fill={palette.body} />
      <path d="M3 7h10v1H3z M3 10h10v1H3z" fill={palette.outline} opacity=".18" />
      <path
        d="M3 4h2v1h1v1h1v1h2V6h1V5h1V4h2v2h-1v1h-1v1h-1v2h1v1h1v1h1v2h-2v-1h-1v-1H9v-1H7v1H6v1H5v1H3v-2h1v-1h1v-1h1V8H5V7H4V6H3z"
        fill={palette.outline}
      />
    </svg>
  );
}
