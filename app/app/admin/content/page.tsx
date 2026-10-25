"use client";

import { Suspense } from "react";
import { Content } from "@/features/admin/pages/Content";

export default function Page() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
