import type { Metadata } from "next";
import { Landing } from "../../src/components/landing/landing";

export const metadata: Metadata = {
  title: "aro: autonomous resource operations",
  description: "Autonomous resource operations for communities",
};

export default function Page() {
  return <Landing resource appUrl={process.env.ARO_WEBAPP_URL || "https://tryaro.app/canvas"} />;
}
