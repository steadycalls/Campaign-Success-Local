interface AlertBannerProps {
  message: string;
  type?: 'info' | 'warning' | 'error';
}

const styles = {
  info: 'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  warning: 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  error: 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-400 border-red-200 dark:border-red-800',
};

export default function AlertBanner({ message, type = 'info' }: AlertBannerProps) {
  if (!message) return null;

  return (
    <div className={`border-b px-4 py-2 text-sm ${styles[type]}`}>
      {message}
    </div>
  );
}
