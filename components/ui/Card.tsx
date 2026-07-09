export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-surface-1 p-6 ${className}`}>
      {children}
    </div>
  );
}
