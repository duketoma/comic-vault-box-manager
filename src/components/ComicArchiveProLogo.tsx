import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export const ComicArchiveProLogo: React.FC<LogoProps> = ({ className = 'w-9 h-9', size = 36 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Comic Archive Pro Logo"
    >
      <defs>
        {/* Background Tile Gradient */}
        <linearGradient id="capTileGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="50%" stopColor="#1E1B4B" />
          <stop offset="100%" stopColor="#312E81" />
        </linearGradient>

        {/* Box Body Gradient */}
        <linearGradient id="capBoxGrad" x1="12" y1="21" x2="12" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>

        {/* Box Lid Gradient */}
        <linearGradient id="capLidGrad" x1="9" y1="17" x2="39" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="50%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>

        {/* Comic 1 (Red) */}
        <linearGradient id="capComicRed" x1="13" y1="9" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F43F5E" />
          <stop offset="100%" stopColor="#BE123C" />
        </linearGradient>

        {/* Comic 2 (Cyan/Blue) */}
        <linearGradient id="capComicBlue" x1="20" y1="7" x2="30" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>

        {/* Comic 3 (Gold/Star) */}
        <linearGradient id="capComicGold" x1="27" y1="10" x2="36" y2="23" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FCD34D" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>

        {/* Bookmark Ribbon */}
        <linearGradient id="capRibbonGrad" x1="32" y1="20" x2="36" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#4338CA" />
        </linearGradient>
      </defs>

      {/* Rounded App Tile with Subtle Outer Glow/Border */}
      <rect x="1.5" y="1.5" width="45" height="45" rx="10.5" fill="url(#capTileGrad)" />
      <rect x="1.5" y="1.5" width="45" height="45" rx="10.5" stroke="#F59E0B" strokeWidth="1" strokeOpacity="0.45" />

      {/* Background Comic Issues peeking up behind the lid */}
      {/* 1. Left Issue (Red) */}
      <path
        d="M13 13.5C13 12.1193 14.1193 11 15.5 11H21.5C22.8807 11 24 12.1193 24 13.5V23H13V13.5Z"
        fill="url(#capComicRed)"
      />
      <rect x="14.5" y="13" width="7" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.8" />

      {/* 2. Middle Issue (Cyan/Blue - Tallest) */}
      <path
        d="M19 10C19 8.61929 20.1193 7.5 21.5 7.5H27.5C28.8807 7.5 30 8.61929 30 10V22H19V10Z"
        fill="url(#capComicBlue)"
      />
      <rect x="20.5" y="9.5" width="7.5" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.9" />
      <circle cx="24.25" cy="14" r="1.5" fill="#FFFFFF" fillOpacity="0.85" />

      {/* 3. Right Issue (Gold) */}
      <path
        d="M26 14.5C26 13.1193 27.1193 12 28.5 12H34.5C35.8807 12 37 13.1193 37 14.5V23H26V14.5Z"
        fill="url(#capComicGold)"
      />
      <rect x="27.5" y="14" width="7.5" height="1.5" rx="0.75" fill="#FFFFFF" fillOpacity="0.8" />

      {/* Comic Archive Storage Box Body */}
      <rect x="10" y="21" width="28" height="18.5" rx="3" fill="url(#capBoxGrad)" />

      {/* Box Front Spine Divider Line */}
      <line x1="10" y1="28" x2="38" y2="28" stroke="#B45309" strokeWidth="0.75" strokeOpacity="0.6" />

      {/* Comic Archive Box Lid */}
      <rect x="8" y="18" width="32" height="6.5" rx="2" fill="url(#capLidGrad)" />
      {/* Lid Top Specular Highlight */}
      <line x1="9" y1="19" x2="39" y2="19" stroke="#FEF3C7" strokeWidth="0.8" strokeLinecap="round" strokeOpacity="0.8" />

      {/* Handle Cutout on Box Front */}
      <rect x="20" y="30.5" width="8" height="3" rx="1.5" fill="#0F172A" />

      {/* Pro Star Badge on Box Front */}
      <path
        d="M24 23.8L24.7 25.2L26.3 25.4L25.1 26.5L25.4 28L24 27.2L22.6 28L22.9 26.5L21.7 25.4L23.3 25.2L24 23.8Z"
        fill="#FEF3C7"
      />

      {/* Hanging Bookmark Ribbon from under lid */}
      <path
        d="M32 20.5V31L34 29.5L36 31V20.5H32Z"
        fill="url(#capRibbonGrad)"
      />
    </svg>
  );
};
