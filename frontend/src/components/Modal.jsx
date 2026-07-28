export default function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-gulag-surface border border-gulag-border rounded-t-xl sm:rounded-xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 p-4 border-b border-gulag-border sticky top-0 bg-gulag-surface">
          <h2 className="font-semibold text-gulag-cyan">{title}</h2>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none px-2">×</button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
