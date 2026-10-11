"use client";
import { Suspense } from "react";
import {ResetPasswordForm} from "@/features/account/PasswordForms";

export default function Page() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
