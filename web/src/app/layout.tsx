import type { Metadata } from "next";
import { Geist, Bricolage_Grotesque, Space_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"] });
const mono = Space_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "700"] });

const DESCRIPTION = "Seven years of personal film-watching, cross-filtered and scored against the critics.";
const OG_ALT = "cinemetrics — seven years of personal film-watching, scored against the critics";

// Trailing slash + relative image path (no leading slash) so URL resolution keeps
// the /cinemetrics base path GitHub Pages serves under.
export const metadata: Metadata = {
  metadataBase: new URL("https://featheranalytics.dev/cinemetrics/"),
  title: "cinemetrics",
  description: DESCRIPTION,
  openGraph: {
    title: "cinemetrics",
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "opengraph-image.png", width: 1200, height: 630, alt: OG_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    title: "cinemetrics",
    description: DESCRIPTION,
    images: [{ url: "opengraph-image.png", alt: OG_ALT }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
