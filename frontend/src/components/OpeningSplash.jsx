import { useState } from 'react';
import logoSource from '../assets/pict-cybercell-logo-source.jpg';

export default function OpeningSplash() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div
      className="opening-splash"
      aria-label="FlagHunters by PICT Cybercell"
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setVisible(false);
      }}
    >
      <div className="opening-splash__lockup">
        <div className="opening-splash__logo-window" aria-hidden="true">
          <img src={logoSource} alt="" className="opening-splash__logo-image" />
        </div>
        <p className="opening-splash__credit">PICT Cybercell</p>
      </div>
    </div>
  );
}
