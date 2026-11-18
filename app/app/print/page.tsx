import Studio from "@/features/studio/Studio";
import "@/features/studio/print.css";
import { Locales } from "@/components/Locales";

/**
 * The print studio. `?handoff=1` means the editor just sent a map; it is read
 * here, on the server, because during a client-side navigation the browser's
 * address bar only changes after the page has rendered.
 */
export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const handoff = (await searchParams).handoff === "1";
  return (
    <Locales sections={["studio", "printing", "mapmaker"]}>
      <Studio handoff={handoff} />
    </Locales>
  );
}
