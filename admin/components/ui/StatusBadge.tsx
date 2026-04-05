import { OrderStatus } from '@/lib/api';

const statusConfig: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-700' },
  awaiting_payment: { label: 'Awaiting Payment', className: 'bg-yellow-100 text-yellow-700' },
  paid: { label: 'Paid', className: 'bg-blue-100 text-blue-700' },
  processing: { label: 'Processing', className: 'bg-orange-100 text-orange-700' },
  delivered: { label: 'Delivered', className: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
  refunded: { label: 'Refunded', className: 'bg-purple-100 text-purple-700' },
};

export default function StatusBadge({ status }: { status: OrderStatus | string }) {
  const config = statusConfig[status as OrderStatus] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
