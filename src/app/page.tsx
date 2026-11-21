import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: "aro: autonomous resource operations",
  description: "Autonomous resource operations for communities",
};

export default async function Page() {
  await connection();
  if (!["1", "true"].includes(process.env.PUBLIC_DEMO ?? ""))
    redirect("/canvas");
  return <Landing resource />;
}
