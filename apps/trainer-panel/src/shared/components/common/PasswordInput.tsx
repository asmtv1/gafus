"use client";

// components/ui/PasswordInput.tsx
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { IconButton, InputAdornment, OutlinedInput } from "@mui/material";
import { useState } from "react";

import type { PasswordInputProps as Props } from "@gafus/types";
import type { FC } from "react";

export const PasswordInput: FC<Props> = ({ value, onChange, placeholder, error, ...props }) => {
  const [showPassword, setShowPassword] = useState(false);

  const handleClickShowPassword = () => setShowPassword((show) => !show);

  const handleMouseDownPassword = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  return (
    <OutlinedInput
      type={showPassword ? "text" : "password"}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      error={Boolean(error)}
      endAdornment={
        <InputAdornment position="end">
          <IconButton
            aria-label="toggle password visibility"
            onClick={handleClickShowPassword}
            onMouseDown={handleMouseDownPassword}
            edge="end"
          >
            {showPassword ? <VisibilityOff /> : <Visibility />}
          </IconButton>
        </InputAdornment>
      }
      {...props}
    />
  );
};
