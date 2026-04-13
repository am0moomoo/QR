import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({
  variant = "primary",
  style,
  ...props
}: ButtonProps) {
  const background = variant === "primary" ? "#64b5ff" : "transparent";
  const color = variant === "primary" ? "#08111a" : "#eef4fb";
  const border = variant === "primary" ? "none" : "1px solid #243142";

  return (
    <button
      {...props}
      style={{
        background,
        color,
        border,
        borderRadius: 12,
        padding: "12px 16px",
        fontWeight: 600,
        cursor: "pointer",
        ...style
      }}
    />
  );
}
