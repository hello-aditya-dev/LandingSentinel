import type { Metadata } from "next";
import { LoginRoute } from "@/components/app/workspace-shell";

export const metadata: Metadata = {
  title: { absolute: "Sign in — LandingSentinel" },
  description: "Administrator sign-in for the real campaign workspace.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: false },
};

export default function Page() {
  return <LoginRoute />;
}
