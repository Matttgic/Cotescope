import type { Metadata } from "next";
import Script from "next/script";
import LiveScanRefresh from "@/components/LiveScanRefresh";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoteScope FR — Scanner de cotes",
  description: "Comparateur de cotes et tableau de bord privé pour bookmakers autorisés en France."
};

const quotaCaptureScript = `
(function () {
  if (window.__cotescopeFetchWrapped) return;
  window.__cotescopeFetchWrapped = true;
  var originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    var response = await originalFetch(input, init);
    try {
      var url = typeof input === "string" ? input : (input && input.url ? input.url : String(input));
      if (url.indexOf("/api/opportunities") !== -1) {
        response.clone().json().then(function (payload) {
          if (!payload || !payload.quota) return;
          var quota = payload.quota;
          var used = Number(quota.used);
          var remaining = Number(quota.remaining);
          if (!Number.isFinite(used) || !Number.isFinite(remaining)) return;
          window.localStorage.setItem("cotescope.odds-quota.v1", JSON.stringify({
            used: used,
            remaining: remaining,
            lastCost: Number(quota.lastCost) || 0,
            capturedAt: new Date().toISOString()
          }));
          window.dispatchEvent(new Event("cotescope:quota"));
        }).catch(function () {});
      }
    } catch (_) {}
    return response;
  };
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <Script id="cotescope-quota-capture" strategy="beforeInteractive">{quotaCaptureScript}</Script>
        <LiveScanRefresh />
        {children}
      </body>
    </html>
  );
}
