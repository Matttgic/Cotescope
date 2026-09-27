import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoteScope FR — Scanner de cotes",
  description: "Comparateur de cotes et tableau de bord privé pour bookmakers autorisés en France."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
