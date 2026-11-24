"use client";

// An error in the root layout: no page is left to show it in, so this one brings its own document.
import "./globals.css";
import Crash from "./error";

export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <Crash {...props} />
      </body>
    </html>
  );
}
