"use client";

import { Suspense } from "react";
import { Audit } from "@/features/admin/pages/Audit";

export default function Page() {
  return (
    <Suspense>
      <Audit />
    </Suspense>
  );
}
