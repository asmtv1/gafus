// components/ui/PasswordInput.tsx
import { InputHTMLAttributes, useState, FC } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};

export const PasswordInput: FC<Props> = ({ error, ...rest }) => {
  const [show, setShow] = useState(false);

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <input {...rest} type={show ? "text" : "password"} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          marginLeft: 8,
        }}
        tabIndex={-1}
      >
        {show ? "🙈" : "👁️"}
      </button>
      {error && <p style={{ color: "crimson", marginLeft: 10 }}>{error}</p>}
    </div>
  );
};
