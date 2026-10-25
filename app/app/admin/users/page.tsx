"use client";

import { Suspense } from "react";
import { Users } from "@/features/admin/pages/Users";

export default function Page() {
  return (
    <Suspense>
      <Users />
    </Suspense>
  );
}
