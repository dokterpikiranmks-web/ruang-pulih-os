import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        klinik: {
          primary: "#0D3B2E", // Hijau Klinik Tua
          primaryDark: "#08261E",
          primaryLight: "#14533F",
          gold: "#D4AF37", // Aksen Emas
          goldLight: "#F3E5AB",
          bg: "#F9FAF8", // Latar bersih krem hangat
          cream: "#F4F6F0",
          surface: "#FFFFFF",
          text: "#1E2922",
          muted: "#5A6B62",
          border: "#E2E8F0",
        },
      },
    },
  },
  plugins: [],
};

export default config;
