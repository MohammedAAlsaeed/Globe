"use client";

import { AdminApp } from "@/features/admin/AdminApp";
import "../../features/admin/admin.css";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminApp>{children}</AdminApp>;
}
