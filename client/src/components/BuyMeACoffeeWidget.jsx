import { useEffect } from 'react';

/**
 * Lightweight wrapper to inject the Buy Me a Coffee floating widget script.
 * Renders nothing itself – the script takes care of the button in the bottom-right corner.
 */
const BuyMeACoffeeWidget = () => {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    // Avoid injecting the script multiple times
    if (document.querySelector('script[data-name="BMC-Widget"]')) return;

    const script = document.createElement('script');
    script.src = 'https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js';
    script.setAttribute('data-name', 'BMC-Widget');
    script.setAttribute('data-cfasync', 'false');
    script.setAttribute('data-id', 'lachart');
    script.setAttribute('data-description', 'Support me on Buy me a coffee!');
    script.setAttribute('data-message', '');
    script.setAttribute('data-color', '#5F7FFF');
    script.setAttribute('data-position', 'Right');
    script.setAttribute('data-x_margin', '18');
    script.setAttribute('data-y_margin', '18');
    script.async = true;

    document.body.appendChild(script);
  }, []);

  return null;
};

export default BuyMeACoffeeWidget;

