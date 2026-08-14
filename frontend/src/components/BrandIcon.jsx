import React from 'react';

const BrandIcon = ({ className = "w-8 h-8", color = "#006D77", secondaryColor = "#83C5BE", ...props }) => {
  return (
    <svg
      className={className}
      viewBox="0 0 100 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Outer Wave Arc — Increased spacing */}
      <path
        d="M 6 52 C 20 8, 80 8, 94 52"
        stroke={color}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      {/* Middle Wave Arc — Generous gap */}
      <path
        d="M 24 52 C 34 26, 66 26, 76 52"
        stroke={secondaryColor}
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Inner Core Arc — Distinct spacing */}
      <path
        d="M 40 52 C 45 40, 55 40, 60 52"
        stroke={color}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default BrandIcon;
