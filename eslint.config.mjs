import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "supabase/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        "patterns": [
          {
            "group": ["supabase/*", "../supabase/*", "../../supabase/*"],
            "message": "Do not import Supabase Edge code into the Next.js app"
          }
        ]
      }]
    }
  },
];

export default eslintConfig;
