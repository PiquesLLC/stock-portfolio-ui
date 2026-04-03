export function NotFoundPage() {
  return (
    <div className="min-h-screen min-h-dvh bg-[#050505] text-white flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <img src="/north-signal-logo-transparent.png" alt="" className="h-12 w-12 mx-auto mb-6 opacity-40" />
        <h1 className="text-5xl font-bold text-white/20 mb-2">404</h1>
        <h2 className="text-lg font-semibold text-white/80 mb-3">Page not found</h2>
        <p className="text-sm text-white/40 mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/"
            className="inline-block bg-rh-green text-black font-semibold text-sm px-6 py-2.5 rounded-lg hover:brightness-110 transition-all"
          >
            Go to Nala
          </a>
          <a
            href="/support"
            className="inline-block border border-white/10 text-white/50 font-medium text-sm px-6 py-2.5 rounded-lg hover:text-white/80 hover:border-white/20 transition-all"
          >
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}
