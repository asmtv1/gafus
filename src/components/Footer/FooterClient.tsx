// src/components/Footer/FooterClient.tsx
"use client";

import dynamic from "next/dynamic";

const Footer = dynamic(() => import("./Footer"), {
  ssr: false,
  loading: () => null,
});

export default Footer;
