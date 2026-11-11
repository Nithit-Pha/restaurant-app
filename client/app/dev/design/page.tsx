import type { Metadata } from 'next';
import DesignPreview from './DesignPreview';

// Internal preview of the design system (docs/2026-11-11-ui-redesign.md).
// Not linked anywhere, not in the sitemap, and not indexed.
export const metadata: Metadata = {
  title: 'Design system',
  robots: { index: false, follow: false },
};

export default function DesignPage() {
  return <DesignPreview />;
}
