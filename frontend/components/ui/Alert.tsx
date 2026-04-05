interface AlertProps {
  variant?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const styles: Record<NonNullable<AlertProps['variant']>, string> = {
  success: 'bg-green-50 border-green-400 text-green-800',
  error: 'bg-red-50 border-red-400 text-red-800',
  warning: 'bg-yellow-50 border-yellow-400 text-yellow-800',
  info: 'bg-blue-50 border-blue-400 text-blue-800',
};

export function Alert({ variant = 'info', title, children, className = '' }: AlertProps) {
  return (
    <div className={`rounded-lg border-l-4 p-4 ${styles[variant]} ${className}`}>
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div className="text-sm">{children}</div>
    </div>
  );
}
