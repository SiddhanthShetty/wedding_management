"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Workspace section failed to load", error.digest); }, [error.digest]);
  return <ErrorState title="This workspace section could not load" description="No changes were saved. Check your connection and retry." onRetry={reset} />;
}
