import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Work Schedule Generator",
  description: "Constraint-based automated scheduling for quick-service restaurant store management.",
};

// Applied before paint so a stored/system dark preference never flashes light.
// Mirrors src/lib/theme.ts (key "ws-theme"; absent/other value = system).
const themeInitScript = `(function(){try{var t=localStorage.getItem("ws-theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Nav />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
