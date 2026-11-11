"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Workspace section failed to load", error.digest); }, [error.digest]);
  return <ErrorState title="This page couldn't load" description="Nothing was changed. Check your internet connection and try again." onRetry={reset} />;
}
