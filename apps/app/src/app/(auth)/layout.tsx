export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-6 font-display text-xl font-semibold tracking-tight">
          Open<span className="bg-accent px-1 text-accent-fg">SEO</span>
        </p>
        {children}
      </div>
    </main>
  );
}
