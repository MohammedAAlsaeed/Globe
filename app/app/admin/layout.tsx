"use client";

import { AdminApp } from "@/features/admin/AdminApp";
import "../../features/admin/admin.css";
import { Locales } from "@/components/Locales";
import { ALL_SECTIONS } from "@/lib/locales/sections";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The dashboard shows every kind of content: all the words.
  return (
    <Locales sections={ALL_SECTIONS}>
      <AdminApp>{children}</AdminApp>
    </Locales>
  );
}
