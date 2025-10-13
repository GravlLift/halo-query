import { useEffect, useState } from 'react';
import { Plugin } from 'chart.js';

export function useZoomPlugin() {
  const [plugin, setPlugin] = useState<Plugin>();
  const [firstRenderComplete, setFirstRenderComplete] = useState(false);
  useEffect(() => {
    import('chartjs-plugin-zoom').then((m) => {
      setPlugin({
        ...m.default,
        afterDraw: (...args) => {
          m.default.afterDraw?.(...args);
          setFirstRenderComplete(true);
        },
      });
    });
  }, []);
  return [plugin, firstRenderComplete] as const;
}
