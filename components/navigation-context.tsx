'use client';
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

interface NavigationContextValue {
  signal: AbortSignal;
  abort: (reason?: unknown) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const abortController = useMemo(
    () => new AbortController(),
    [pathname, searchParams]
  );

  useEffect(() => {
    function isAnchorOfCurrentUrl(currentUrl: string, newUrl: string) {
      const currentUrlObj = new URL(currentUrl);
      const newUrlObj = new URL(newUrl);
      if (
        currentUrlObj.hostname === newUrlObj.hostname &&
        currentUrlObj.pathname === newUrlObj.pathname &&
        currentUrlObj.search === newUrlObj.search
      ) {
        const currentHash = currentUrlObj.hash;
        const newHash = newUrlObj.hash;
        return (
          currentHash !== newHash &&
          currentUrlObj.href.replace(currentHash, '') ===
            newUrlObj.href.replace(newHash, '')
        );
      }
      return false;
    }

    function findClosestAnchor(
      element: HTMLElement | null
    ): HTMLAnchorElement | null {
      while (element && element.tagName.toLowerCase() !== 'a') {
        element = element.parentElement;
      }
      return element as HTMLAnchorElement;
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      const anchor = findClosestAnchor(target);
      const newUrl = anchor?.href;
      if (newUrl) {
        const currentUrl = window.location.href;
        const isExternalLink =
          (anchor as HTMLAnchorElement).target === '_blank';
        const isBlob = newUrl.startsWith('blob:');
        const isAnchor = isAnchorOfCurrentUrl(currentUrl, newUrl);
        if (
          !(
            newUrl === currentUrl ||
            isAnchor ||
            isExternalLink ||
            isBlob ||
            event.ctrlKey
          )
        ) {
          abortController.abort({ currentUrl, newUrl });
        }
      }
    }

    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, [abortController]);

  return (
    <NavigationContext.Provider
      value={{
        signal: abortController.signal,
        abort: (reason?: unknown) => abortController.abort(reason),
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigationController() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error(
      'useNavigationSignal must be used within NavigationProvider'
    );
  }
  return {
    signal: context.signal,
    abort: context.abort,
  };
}

// This is the error handler function
export function abortErrorCatch(e: unknown) {
  if (!(e instanceof DOMException && e.name === 'AbortError')) {
    throw e;
  }
}
