"use client";

// =============================================================================
// global-error.tsx — Catches unhandled client-side errors in production
// Prevents the opaque "Application error" page from Next.js
// =============================================================================

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-gray-500 mb-4 max-w-md text-center">
            {error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={reset}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
