import type { CSSProperties } from "react";
import "./aro-logo.css";

type AroLogoProps = {
  /** Height and width of the pixel symbol, in CSS pixels. */
  size?: number;
  className?: string;
  style?: CSSProperties;
};

/**
 * ARO's underground shelter / beacon logo (Option B).
 * Hand-built SVG pixel art, rendered with hard pixel edges like ARO's icons.
 * Font matches ARO's wordmark: Geist, 18px, 600, 23px line height, -0.03em.
 */
export function AroLogo({ size = 20, className = "", style }: AroLogoProps) {
  return (
    <span className={`aro-logo ${className}`.trim()} style={style}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        shapeRendering="crispEdges"
        aria-hidden="true"
        focusable="false"
      >
        {/* Underground rock */}
        <path d="M0 21V19H2V15H4V12H6V10H9V8H15V10H18V12H20V15H22V19H24V21H0Z" fill="#424440" />
        {/* Rocky inner arch */}
        <path d="M3 19V16H5V13H7V11H17V13H19V16H21V19H18V17H16V15H8V17H6V19H3Z" fill="#8A8B88" />
        {/* Tunnel opening */}
        <path d="M8 21V17H10V15H14V17H16V21H8Z" fill="#202D29" />
        {/* Moss */}
        <path d="M0 21V19H2V17H4V15H6V17H5V19H3V21H0Z" fill="#81994B" />
        <path d="M19 21V19H21V17H23V19H24V21H19Z" fill="#81994B" />
        {/* Beacon pole and housing */}
        <rect x="11" y="5" width="2" height="5" fill="#202D29" />
        <rect x="9" y="3" width="6" height="5" fill="#202D29" />
        <rect x="11" y="5" width="2" height="2" fill="#FFD34E" />
        {/* Beacon light rays */}
        <rect x="11" y="0" width="2" height="3" fill="#F4BF32" />
        <rect x="6" y="3" width="2" height="2" fill="#F4BF32" />
        <rect x="16" y="3" width="2" height="2" fill="#F4BF32" />
      </svg>
      <span className="aro-wordmark">aro</span>
    </span>
  );
}

export default AroLogo;
