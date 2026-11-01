import { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import Logo from "@/components/glass/Logo";

export default function PageNotFound() {
  const location = useLocation();
  const pageName = location.pathname.substring(1);

  // A real 404 for crawlers, removed as soon as this page unmounts.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "prerender-status-code";
    meta.content = "404";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="glass-panel w-full max-w-md p-8 text-center">
        <span className="logo-glass-ring mx-auto mb-5 flex h-14 w-14 items-center justify-center">
          <Logo size={24} decorative />
        </span>
        <p className="font-display text-[44px] font-semibold leading-none text-label/25">404</p>
        <h1 className="type-title mt-3">Page not found</h1>
        <p className="type-body mt-2 text-label-secondary">
          {pageName ? `“${pageName}” is not a page in DevOps Life.` : "That page does not exist."}
        </p>
        <Link
          to="/"
          className="press mt-6 inline-flex h-11 items-center rounded-full bg-primary px-5 font-heading text-[14px] font-medium text-primary-foreground"
        >
          Back to the workspace
        </Link>
      </div>
    </div>
  );
}