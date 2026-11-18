"use client";

import { TextureLibraryPage } from "@/features/account/TextureLibraryPage";
import { Locales } from "@/components/Locales";

export default function Page() {
  return (
    <Locales sections={["studio", "mapmaker", "stamps"]}>
      <TextureLibraryPage />
    </Locales>
  );
}
