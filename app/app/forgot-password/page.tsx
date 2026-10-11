"use client";
import { Suspense } from "react";
import {ForgotPasswordForm} from "@/features/account/PasswordForms";

export default function Page() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
