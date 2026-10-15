import "./globals.css";
export const metadata = {
  title: "ACUMEN",
  description: "Voice-first lightweight CRM",
  icons: {
    icon: {
      url: "/favicon.svg",
      type: "image/svg+xml",
    },
  },
  // PWA groundwork: "Add to Home Screen" on iOS renders standalone chrome
  // using these hints. statusBarStyle "default" avoids safe-area overlap
  // since content doesn't yet extend under the status bar.
  appleWebApp: {
    capable: true,
    title: "ACUMEN",
    statusBarStyle: "default",
  },
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark')}}catch(e){}` }} />
        <script dangerouslySetInnerHTML={{ __html: `try{const s=localStorage.getItem('brand-scale');if(s){const a=JSON.parse(s);const k=[50,100,200,300,400,500,600,700,800,900,950];for(let i=0;i<k.length;i++){if(a[i])document.documentElement.style.setProperty('--brand-'+k[i],a[i])}}}catch(e){}` }} />
        {children}
      </body>
    </html>
  );
}
