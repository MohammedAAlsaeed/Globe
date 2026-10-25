"use client";

import { Suspense } from "react";
import { Plans } from "@/features/admin/pages/Plans";

export default function Page() {
  return (
    <Suspense>
      <Plans />
    </Suspense>
  );
}
