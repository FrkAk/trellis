import type { Metadata, Viewport } from "next";
import { MotionProvider } from "@/components/layout/MotionProvider";
import "./globals.css";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Mymir",
  description: "A structure that supports organic growth. Brainstorm, decompose, refine, plan, execute, track.",
};

/**
 * Root layout for the Mymir application.
 * @param props - Layout props with children.
 * @returns The root HTML structure with fonts and theme applied.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try { if(localStorage.getItem('mymir-theme')==='light') document.documentElement.classList.add('light'); } catch(e){}
          })();
        ` }} />
      </head>
      <body><MotionProvider>{children}</MotionProvider></body>
    </html>
  );
}
