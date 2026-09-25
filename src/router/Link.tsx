import React from 'react';
import { navigate } from './router';

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Target path (usually produced by `buildPath`). */
  to: string;
  replace?: boolean;
}

/**
 * Anchor-based in-app link.
 *
 * Renders a real `href`, so the URL is genuinely navigable: right-click /
 * middle-click "open in new tab", bookmarking and copying the link all work
 * natively. A plain left click is intercepted and handled client-side.
 * Modified clicks (ctrl/cmd/shift/alt) are intentionally NOT intercepted so
 * the browser performs its default new-tab/new-window behaviour.
 */
export const Link: React.FC<LinkProps> = ({ to, replace, onClick, children, ...rest }) => {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(to, { replace });
  };

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
};
