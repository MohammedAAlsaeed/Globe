"use client";

import { useParams } from "next/navigation";
import { UserDetail } from "@/features/admin/pages/UserDetail";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <UserDetail key={id} id={id} />;
}
