"use client";

import { MapsPage } from "@/features/account/MapsPage";
import { Locales } from "@/components/Locales";

export default function Page() {
  return (
    <Locales sections={["studio", "mapmaker", "stamps", "lines", "text"]}>
      <MapsPage />
    </Locales>
  );
}
