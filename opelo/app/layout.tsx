import "./globals.css";
import type { Metadata } from "next";
import { Instrument_Serif, Instrument_Sans } from "next/font/google";

const instrumentSerif = Instrument_Serif({ weight: "400", subsets: ["latin"], variable: "--font-serif" });
const instrumentSans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Opelo — AI middle management for one-person businesses",
  description: "Delegate refunds, pricing exceptions, sponsorships, scheduling, and escalations to an AI manager that follows your business policies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${instrumentSans.variable}`}>
      <body className="min-h-screen bg-white font-sans text-stone-900 antialiased">
        {children}
      </body>
    </html>
  );
}
