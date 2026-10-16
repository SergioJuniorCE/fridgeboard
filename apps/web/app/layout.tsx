import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import { LinkProvider } from "@astryxdesign/core/Link";
import ThemeProvider from "@/components/theme-provider";
import ProfileFab from "@/components/profile-fab";
import ResponsiveNav from "@/components/responsive-nav";
import NextLink from "next/link";
import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import {Archivo, Instrument_Serif} from 'next/font/google';

// The two typefaces used by the supplied photo-frame-dashboard reference.
const sans = Archivo({subsets: ['latin'], axes: ['wdth'], variable: '--font-household-sans', display: 'swap'});
const serif = Instrument_Serif({subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-household-serif', display: 'swap'});

const APP_NAME = "Yoggan Home";
const APP_DESCRIPTION = "Family life: calendar, budgets, shopping lists.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: APP_NAME, template: "%s — Yoggan Home" },
  description: APP_DESCRIPTION,
  appleWebApp: { capable: true, statusBarStyle: "default", title: APP_NAME },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#edf6fa" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"}>
          <ThemeProvider>
            <LinkProvider component={NextLink}>
              <ResponsiveNav>
                {children}
                <ProfileFab />
              </ResponsiveNav>
            </LinkProvider>
          </ThemeProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
