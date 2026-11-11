import type { ReactNode } from 'react';
import Providers from '../src/components/Providers';

// Keep session and cart state mounted across language changes. The localized
// layout provides the document and the language-specific UI.
export default function RootLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
