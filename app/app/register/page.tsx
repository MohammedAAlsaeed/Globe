"use client";
import { Suspense } from "react";
import {RegisterForm} from "@/features/account/RegisterForm";

export default function Page() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
