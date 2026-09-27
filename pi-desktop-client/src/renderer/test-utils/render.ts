import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { TooltipProvider } from "../components/ui/tooltip";

/** Match the overlay context provided by AppProviders in the running client. */
export function renderToStaticMarkup(node: ReactNode) {
  return renderMarkup(createElement(TooltipProvider, null, node));
}
