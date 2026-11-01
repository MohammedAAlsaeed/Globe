import type { Metadata } from "next";
import { NotFoundView } from "@/features/system/NotFoundView";

/** Any address that matches no page (and `notFound()` from a page). Next
 * answers 404 and keeps it out of search engines. */
export const metadata: Metadata = {
  title: "Page not found — Al-Idrisi Atelier",
};

export default function NotFound() {
  return <NotFoundView />;
}
