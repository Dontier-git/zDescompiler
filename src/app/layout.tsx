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
  title: "zDescompiler — Plugin Decompiler Online",
  description:
    "Online decompiler & extractor for Java plugins and mods: .jar, .class, Bukkit, Spigot, Paper, BungeeCord, Velocity, Forge, Fabric, NeoForge, Quilt. 100% in-browser, free, no upload.",
  keywords: [
    "Java decompiler",
    "plugin decompiler",
    "jar decompiler",
    "class bytecode parser",
    "Bukkit plugin decompiler",
    "Spigot plugin decompiler",
    "Paper plugin decompiler",
    "Forge mod decompiler",
    "Fabric mod decompiler",
    "NeoForge mod decompiler",
    "BungeeCord plugin decompiler",
    "Velocity plugin decompiler",
    "JVM bytecode viewer",
    "constant pool viewer",
  ],
  authors: [{ name: "zDescompiler" }],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "zDescompiler — Plugin Decompiler Online",
    description:
      "Decompile & extract Java plugins and mods (.jar, .class) — all in your browser.",
    siteName: "zDescompiler",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "zDescompiler — Plugin Decompiler Online",
    description:
      "Decompile & extract Java plugins and mods (.jar, .class) — all in your browser.",
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
