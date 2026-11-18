"use client";

import { LibraryPage } from "@/features/account/LibraryPage";
import { Locales } from "@/components/Locales";

export default function Page() {
  return (
    <Locales sections={["studio", "mapmaker", "stamps"]}>
      <LibraryPage />
    </Locales>
  );
}
