import type { GlobalProvider } from "@ladle/react";
import "../src/app/globals.css";

export const Provider: GlobalProvider = ({ children }) => (
  <div className="dark min-h-screen p-10 text-foreground">{children}</div>
);
