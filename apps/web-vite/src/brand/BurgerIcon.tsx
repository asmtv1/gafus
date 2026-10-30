import React from "react";

interface Props {
  active: boolean;
  onClick?: () => void;
  size?: number;
  color?: string;
  thickness?: number;
}

export const BurgerIcon = ({
  active,
  onClick,
  size = 30,
  color = "#636128",

  thickness = 4,
}: Props) => {
  const lineStyle = {
    width: `${size}px`,
    height: `${thickness}px`,
    backgroundColor: color,
    borderRadius: "2px",
    transition: "transform 0.4s ease, opacity 0.3s ease, top 0.4s ease, bottom 0.4s ease",
    position: "absolute" as const,
  };

  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        width: size,
        height: size,
        cursor: "pointer",
        backgroundColor: "transparent",
        background: "none",
        border: "none",
        outline: "none",
      }}
    >
      {/* Top Line */}
      <div
        style={{
          ...lineStyle,
          top: active ? "50%" : "20%",
          transform: active ? "translateY(-50%) rotate(45deg)" : "none",
        }}
      />

      {/* Middle Line */}
      <div
        style={{
          ...lineStyle,
          top: "50%",
          transform: "translateY(-50%)",
          opacity: active ? 0 : 1,
        }}
      />

      {/* Bottom Line */}
      <div
        style={{
          ...lineStyle,
          bottom: active ? "50%" : "20%",
          transform: active ? "translateY(50%) rotate(-45deg)" : "none",
        }}
      />
    </div>
  );
};
