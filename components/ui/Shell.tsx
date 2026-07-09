export function Shell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={`mx-auto min-h-screen max-w-md px-6 py-12 ${className}`}>
      {children}
    </main>
  );
}
