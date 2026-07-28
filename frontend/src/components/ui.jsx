export const inputClass =
  'w-full bg-gulag-surface-2 border border-gulag-border text-gray-100 placeholder-gray-500 rounded px-3 py-2 text-base focus:outline-none focus:border-gulag-cyan';

export function Button({ variant = 'primary', className = '', ...props }) {
  const variants = {
    primary: 'bg-gulag-cyan text-black font-semibold hover:bg-gulag-cyan-dark',
    secondary: 'bg-gulag-surface-2 text-gray-200 border border-gulag-border hover:border-gulag-cyan',
    danger: 'bg-red-900/60 text-red-200 border border-red-800 hover:bg-red-900',
  };
  return (
    <button
      {...props}
      className={`rounded px-4 py-2 text-sm min-h-[40px] disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function Card({ title, action, children, className = '' }) {
  return (
    <section className={`border border-gulag-border rounded-lg p-4 bg-gulag-surface ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 mb-3">
          {title && <h2 className="font-semibold text-gulag-cyan">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-gray-400">
      {label}
      {children}
    </label>
  );
}

// Tabelas largas precisam rolar dentro do proprio container no celular
export function ScrollArea({ children, className = '' }) {
  return <div className={`overflow-x-auto -mx-4 px-4 ${className}`}>{children}</div>;
}

export function Avatar({ src, name, size = 'md' }) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-12 h-12 text-sm', lg: 'w-24 h-24 text-2xl' };
  const initials = (name || '?')
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (src) {
    return <img src={src} alt={name} className={`${sizes[size]} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${sizes[size]} rounded-full bg-gulag-surface-2 border border-gulag-border flex items-center justify-center text-gulag-cyan font-semibold shrink-0`}>
      {initials}
    </div>
  );
}

export function EmptyState({ children }) {
  return <p className="text-sm text-gray-500 py-4 text-center">{children}</p>;
}
