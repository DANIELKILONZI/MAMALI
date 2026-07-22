'use client';

import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';

/**
 * Sanitizes admin-authored HTML on the client before injecting it.
 * Renders nothing on the server pass; hydrates with sanitized markup.
 */
export function SafeHtml({ html, className }: { html: string; className?: string }) {
  const [clean, setClean] = useState('');

  useEffect(() => {
    setClean(DOMPurify.sanitize(html));
  }, [html]);

  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
