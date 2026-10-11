"use client";
import { Suspense } from "react";
import {LoginForm} from "@/features/account/LoginForm";

export default function Page() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
