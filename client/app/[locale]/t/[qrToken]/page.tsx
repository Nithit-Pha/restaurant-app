import type { Metadata } from 'next';
import TableOrderPage from '../../../../src/features/dineIn/TableOrderPage';

// Each table's QR code opens this page. Never indexed: the address is the table's secret.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params;
  return <TableOrderPage qrToken={qrToken} />;
}
