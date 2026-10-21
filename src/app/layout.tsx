import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Explore the Building Blocks of Life",
  description:
    "An interactive 3D journey from a real protein (ubiquitin, PDB 1UBI, or KRAS, PDB 4OBE) down through its polypeptide chain, an amino acid, an atom and subatomic particles.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1320" },
  ],
};

// Runs before first paint: the saved theme, else the system preference (no light flash in dark mode)
const THEME_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem("protein-to-particle:theme")}catch(e){}if(t!=="light"&&t!=="dark")t=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
