interface AlertBannerProps {
  message: string;
  type?: 'info' | 'warning' | 'error';
}

const styles = {
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  error: 'bg-red-50 text-red-800 border-red-200',
};

export default function AlertBanner({ message, type = 'info' }: AlertBannerProps) {
  if (!message) return null;

  return (
    <div className={`border-b px-4 py-2 text-sm ${styles[type]}`}>
      {message}
    </div>
  );
}
