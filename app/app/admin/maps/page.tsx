"use client";

import { Suspense } from "react";
import { Maps } from "@/features/admin/pages/Maps";

export default function Page() {
  return (
    <Suspense>
      <Maps />
    </Suspense>
  );
}
