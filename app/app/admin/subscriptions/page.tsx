"use client";

import { Suspense } from "react";
import { Subscriptions } from "@/features/admin/pages/Subscriptions";

export default function Page() {
  return (
    <Suspense>
      <Subscriptions />
    </Suspense>
  );
}
