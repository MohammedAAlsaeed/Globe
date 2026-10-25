"use client";

import { Suspense } from "react";
import { Security } from "@/features/admin/pages/Security";

export default function Page() {
  return (
    <Suspense>
      <Security />
    </Suspense>
  );
}
