/**
 * The home page: the landing page for a visitor, their own maps for a
 * member (features/home/HomePage.tsx decides, from the first paint).
 */
import { HomePage } from "@/features/home/HomePage";
import { Locales } from "@/components/Locales";

export default function Home() {
  return (
    <Locales sections={["studio", "mapmaker", "stamps", "lines", "text"]}>
      <HomePage />
    </Locales>
  );
}
