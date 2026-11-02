import React from 'react';
import { AnimatePresence, motion } from 'motion/react';

export interface ComicActionBurstItem {
  id: string;
  text: string;
  subtext?: string;
  variant: 'read' | 'collected' | 'excelsior' | 'pow';
}

interface ComicActionBurstOverlayProps {
  bursts: ComicActionBurstItem[];
}

const VARIANT_STYLES: Record<
  ComicActionBurstItem['variant'],
  {
    fill: string;
    stroke: string;
    textGradient: string;
    dotColor: string;
  }
> = {
  read: {
    fill: '#facc15',
    stroke: '#0f172a',
    textGradient: 'from-emerald-600 via-teal-600 to-slate-900',
    dotColor: '#10b981',
  },
  collected: {
    fill: '#38bdf8',
    stroke: '#0f172a',
    textGradient: 'from-rose-600 via-amber-500 to-slate-950',
    dotColor: '#f43f5e',
  },
  excelsior: {
    fill: '#fbbf24',
    stroke: '#0f172a',
    textGradient: 'from-rose-600 via-purple-700 to-indigo-950',
    dotColor: '#a855f7',
  },
  pow: {
    fill: '#f43f5e',
    stroke: '#0f172a',
    textGradient: 'from-amber-300 via-yellow-200 to-white',
    dotColor: '#facc15',
  },
};

const HALFTONE_RAYS = [
  { angle: 0, dist: 92 },
  { angle: 45, dist: 104 },
  { angle: 90, dist: 86 },
  { angle: 135, dist: 108 },
  { angle: 180, dist: 94 },
  { angle: 225, dist: 102 },
  { angle: 270, dist: 88 },
  { angle: 315, dist: 106 },
];

export const ComicActionBurstOverlay: React.FC<ComicActionBurstOverlayProps> = ({ bursts }) => {
  return (
    <div
      aria-live="polite"
      className="fixed inset-0 pointer-events-none z-[90] flex items-center justify-center overflow-hidden"
    >
      <AnimatePresence>
        {bursts.map((burst) => {
          const style = VARIANT_STYLES[burst.variant] || VARIANT_STYLES.read;
          return (
            <motion.div
              key={burst.id}
              data-testid="comic-action-burst"
              initial={{ scale: 0.2, rotate: -14, opacity: 0 }}
              animate={{ scale: [0.2, 1.14, 0.96, 1.03, 1], rotate: [-14, 5, -3, 0], opacity: 1 }}
              exit={{ scale: 1.35, opacity: 0, transition: { duration: 0.22 } }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex items-center justify-center select-none"
            >
              {/* Halftone Particle Rays */}
              {HALFTONE_RAYS.map((ray, idx) => {
                const rad = (ray.angle * Math.PI) / 180;
                const tx = Math.cos(rad) * ray.dist;
                const ty = Math.sin(rad) * ray.dist;
                return (
                  <motion.span
                    key={idx}
                    initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                    animate={{ x: tx, y: ty, scale: [0, 1.3, 0.6], opacity: [1, 1, 0] }}
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                    style={{ backgroundColor: style.dotColor }}
                    className="absolute w-3.5 h-3.5 rounded-full border-2 border-slate-950 shadow-xs"
                  />
                );
              })}

              {/* Classic Comic Book 16-Point Jagged Starburst SVG */}
              <svg
                viewBox="0 0 260 180"
                className="w-64 h-44 sm:w-72 sm:h-48 drop-shadow-[6px_6px_0px_rgba(15,23,42,0.95)]"
              >
                <polygon
                  points="130,6 153,36 189,14 192,48 236,38 218,74 254,88 221,112 246,144 202,143 196,174 159,153 130,176 101,153 64,174 58,143 14,144 39,112 6,88 42,74 24,38 68,48 71,14 107,36"
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth="6"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Comic Action Word Stamp */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 -rotate-3">
                <span
                  className={`font-black text-2xl sm:text-3xl tracking-wider uppercase italic bg-gradient-to-b ${style.textGradient} bg-clip-text text-transparent drop-shadow-[2px_2px_0px_#ffffff]`}
                  style={{ WebkitTextStroke: '1.5px #0f172a' }}
                >
                  {burst.text}
                </span>
                {burst.subtext && (
                  <span className="mt-0.5 px-2 py-0.5 bg-slate-950 text-white text-[10px] font-extrabold uppercase tracking-widest rounded border border-white/80 shadow-xs">
                    {burst.subtext}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
