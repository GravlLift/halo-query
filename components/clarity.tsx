import Script from 'next/script';
import { useEffect } from 'react';

declare global {
  interface Window {
    clarity: {
      q: unknown[];
    };
  }
}
const key = 'oewk2jll6x';

export default function Clarity() {
  useEffect(() => {
    window['clarity'] =
      window['clarity'] ||
      function () {
        (window['clarity'].q = window['clarity'].q || []).push(
          window,
          document,
          'clarity',
          'script',
          key
        );
      };
  }, []);
  return <Script src={'https://www.clarity.ms/tag/' + key} async={true} />;
}
