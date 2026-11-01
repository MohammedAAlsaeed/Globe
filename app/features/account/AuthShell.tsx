"use client";
/* eslint-disable @next/next/no-img-element -- static brand artwork */
/**
 * Layout of the sign-in pages: the header, the compass rose large and dim
 * behind, and the form.
 */
import type { ReactNode } from "react";
import { SiteHeader } from "./ui";
import { Flourish } from "@/components/ui/Flourish";

export function AuthShell({
  title,
  lead,
  children,
}: {
  /** May carry flourishes (lib/flourish.ts). */
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <div className="site auth-page">
      <SiteHeader />
      <img className="auth-rose" src="/brand/compass-1024.webp" alt="" />
      <main className="auth-main">
        <div className="auth-card">
          <h1 className="fl-title">
            <Flourish text={title} />
          </h1>
          {lead && <p className="auth-lead">{lead}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}
