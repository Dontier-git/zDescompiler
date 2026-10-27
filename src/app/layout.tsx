import type { Metadata } from "next";
import { Geist, Geist_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const pixel = Press_Start_2P({
  weight: "400",
  variable: "--font-pixel",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "zDescompiler — Minecraft Pack & World Decompiler Online",
  description:
    "Online decompiler & extractor for Minecraft files: .mcpack, .mcaddon, .mcworld, .mctemplate, .nbt, .litematic, .schem, .schematic, resource/behaviour packs, mods and more. 100% in-browser, free, no upload.",
  keywords: [
    "Minecraft decompiler",
    "mcpack extractor",
    "mcaddon extractor",
    "mcworld extractor",
    "NBT viewer",
    "litematic viewer",
    "schematic viewer",
    "Minecraft mod decompiler",
    "resource pack extractor",
    "behavior pack extractor",
  ],
  authors: [{ name: "zDescompiler" }],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "zDescompiler — Minecraft Decompiler Online",
    description:
      "Decompile & extract Minecraft packs, worlds, addons, NBT and more — all in your browser.",
    siteName: "zDescompiler",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "zDescompiler — Minecraft Decompiler Online",
    description:
      "Decompile & extract Minecraft packs, worlds, addons, NBT and more — all in your browser.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pixel.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
