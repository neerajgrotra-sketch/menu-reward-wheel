"use client";

import React from 'react';

function RestaurantIcon(): JSX.Element {
  return (
    <div className="mx-auto mb-7 flex justify-center sm:mb-9">
      <div className="relative w-[245px] sm:w-[330px] lg:w-[390px]">
        <svg
          aria-hidden="true"
          viewBox="0 0 520 320"
          className="h-auto w-full overflow-visible drop-shadow-[0_28px_35px_rgba(80,20,0,0.28)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="ctaWall" x1="120" y1="105" x2="400" y2="285" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFF4E8" />
              <stop offset="1" stopColor="#FFD0AE" />
            </linearGradient>

            <linearGradient id="ctaRed" x1="130" y1="120" x2="390" y2="160" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF7A1A" />
              <stop offset="1" stopColor="#EF2F2F" />
            </linearGradient>

            <linearGradient id="ctaGlass" x1="170" y1="165" x2="350" y2="255" gradientUnits="userSpaceOnUse">
              <stop stopColor="#26283A" />
              <stop offset="1" stopColor="#11121A" />
            </linearGradient>

            <linearGradient id="ctaGlow" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#FFE76A" />
              <stop offset="1" stopColor="#FF8A00" />
            </linearGradient>

            <filter id="softShadow" x="70" y="55" width="380" height="260" filterUnits="userSpaceOnUse">
              <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#5A1A00" floodOpacity="0.28" />
            </filter>

            <clipPath id="slotClip">
              <rect x="208" y="176" width="104" height="66" rx="12" />
            </clipPath>
          </defs>

          <ellipse cx="260" cy="268" rx="170" ry="22" fill="rgba(86,24,0,0.18)" />
          <circle cx="260" cy="155" r="155" fill="rgba(255,255,255,0.10)" />

          <g filter="url(#softShadow)">
            <path d="M118 130H402V273C402 284.046 393.046 293 382 293H138C126.954 293 118 284.046 118 273V130Z" fill="url(#ctaWall)" />
            <path d="M118 130H402V273C402 284.046 393.046 293 382 293H138C126.954 293 118 284.046 118 273V130Z" stroke="white" strokeOpacity="0.65" strokeWidth="3" />

            <path d="M138 101H382L410 142H110L138 101Z" fill="#FFF8EF" />
            <path d="M138 101H382L410 142H110L138 101Z" stroke="white" strokeWidth="3" />

            <rect x="103" y="137" width="314" height="36" rx="12" fill="url(#ctaRed)" />

            <g>
              <path d="M111 137H156V161C156 173.15 146.15 183 134 183H133C120.85 183 111 173.15 111 161V137Z" fill="#FFF4E8" />
              <path d="M156 137H201V161C201 173.15 191.15 183 179 183H178C165.85 183 156 173.15 156 161V137Z" fill="#FF5E28" />
              <path d="M201 137H246V161C246 173.15 236.15 183 224 183H223C210.85 183 201 173.15 201 161V137Z" fill="#FFF4E8" />
              <path d="M246 137H291V161C291 173.15 281.15 183 269 183H268C255.85 183 246 173.15 246 161V137Z" fill="#FF5E28" />
              <path d="M291 137H336V161C336 173.15 326.15 183 314 183H313C300.85 183 291 173.15 291 161V137Z" fill="#FFF4E8" />
              <path d="M336 137H409V161C409 173.15 399.15 183 387 183H358C345.85 183 336 173.15 336 161V137Z" fill="#FF5E28" />
            </g>

            <rect x="201" y="168" width="118" height="83" rx="16" fill="url(#ctaGlass)" stroke="#35374A" strokeWidth="4" />

            <g clipPath="url(#slotClip)">
              <rect x="208" y="176" width="104" height="66" fill="#0D0F18" />

              <line x1="242" y1="176" x2="242" y2="242" stroke="white" strokeOpacity="0.08" strokeWidth="2" />
              <line x1="277" y1="176" x2="277" y2="242" stroke="white" strokeOpacity="0.08" strokeWidth="2" />

              <g style={{ animation: 'slotSpin 1.4s linear infinite' }}>
                <text x="220" y="206" fontSize="26" fill="#FFD447">🍔</text>
                <text x="220" y="246" fontSize="26" fill="#FFD447">🎁</text>
                <text x="220" y="286" fontSize="26" fill="#FFD447">🍕</text>
                <text x="220" y="326" fontSize="26" fill="#FFD447">☕</text>
              </g>

              <g style={{ animation: 'slotSpin 1.8s linear infinite' }}>
                <text x="255" y="206" fontSize="26">🎯</text>
                <text x="255" y="246" fontSize="26">🍟</text>
                <text x="255" y="286" fontSize="26">🏆</text>
                <text x="255" y="326" fontSize="26">🎉</text>
              </g>

              <g style={{ animation: 'slotSpin 1.6s linear infinite' }}>
                <text x="289" y="206" fontSize="26">🥤</text>
                <text x="289" y="246" fontSize="26">🌮</text>
                <text x="289" y="286" fontSize="26">💰</text>
                <text x="289" y="326" fontSize="26">⭐</text>
              </g>
            </g>

            <rect x="206" y="174" width="108" height="70" rx="12" fill="none" stroke="white" strokeOpacity="0.14" />

            <rect x="206" y="174" width="108" height="18" fill="#11121A" opacity="0.85" />
            <rect x="206" y="226" width="108" height="18" fill="#11121A" opacity="0.85" />

            <rect x="145" y="181" width="42" height="70" rx="11" fill="white" stroke="#FFE0C5" strokeWidth="3" />
            <path d="M156 213H176" stroke="#FF6B00" strokeWidth="5" strokeLinecap="round" />
            <text x="166" y="236" textAnchor="middle" fontSize="17" fontWeight="900" fill="#FF6B00" fontFamily="Arial, sans-serif">WIN</text>

            <rect x="333" y="181" width="42" height="70" rx="11" fill="#FFE4D4" stroke="white" strokeOpacity="0.5" strokeWidth="3" />
            <path d="M344 209H364M344 222H364" stroke="white" strokeWidth="4" strokeLinecap="round" />
            <text x="354" y="244" textAnchor="middle" fontSize="14" fontWeight="900" fill="white" fontFamily="Arial, sans-serif">QR</text>

            <circle cx="260" cy="93" r="34" fill="white" stroke="#FFE5CC" strokeWidth="5" />
            <circle cx="260" cy="93" r="24" fill="url(#ctaGlow)" />
            <path d="M251 82V104M260 82V104M269 82V104" stroke="white" strokeWidth="4" strokeLinecap="round" />
          </g>

          <path d="M81 143L55 128M88 114L72 88M438 153L465 137M430 120L445 94" stroke="#FFD447" strokeWidth="10" strokeLinecap="round" />
          <path d="M432 213C444 213 444 199 444 199C444 199 444 213 456 213C444 213 444 227 444 227C444 227 444 213 432 213Z" fill="white" opacity="0.9" />
        </svg>

        <style jsx>{`
          @keyframes slotSpin {
            0% {
              transform: translateY(0px);
            }
            100% {
              transform: translateY(-120px);
            }
          }
        `}</style>
      </div>
    </div>
  );
}

export default function CTASection(): JSX.Element {
  return (
    <section className="px-4 py-16 text-center sm:px-6">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-gradient-to-r from-[#FF6B00] via-[#FF4D1F] to-[#E63939] px-7 py-12 text-white shadow-2xl shadow-orange-300/40 sm:px-12 sm:py-14 lg:px-16">
        <RestaurantIcon />

        <h2 className="text-4xl font-black leading-tight tracking-tight drop-shadow-lg sm:text-5xl lg:text-6xl">
          Ready to gamify your restaurant?
        </h2>

        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/90 sm:text-xl">
          Create your first menu-powered reward wheel and publish a QR code diners can play instantly.
        </p>

        <a
          href="/auth"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-white px-10 py-5 text-lg font-black text-[#FF6B00] shadow-[0_12px_34px_rgba(92,20,0,0.22)] transition-transform duration-300 hover:scale-105 sm:px-12"
        >
          Sign Up Free
        </a>
      </div>
    </section>
  );
}
