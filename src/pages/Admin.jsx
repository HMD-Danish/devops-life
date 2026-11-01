import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { LogoLoader } from "@/components/glass/Logo";
import { adminCall, adminToken } from "@/lib/adminApi";
import { invalidateAdmin } from "@/lib/adminStore";

const NOINDEX = "noindex, nofollow, noarchive";

/**
 * The private dashboard. Nothing in the public app links here, and the page
 * keeps itself out of search results while it is open.
 */
export default function Admin() {
  const [state, setState] = useState(() => (adminToken() ? "checking" : "login"));

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "robots");
    meta.setAttribute("content", NOINDEX);
    meta.setAttribute("data-admin", "true");
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    if (!adminToken()) return undefined;
    let alive = true;
    adminCall("session")
      .then(() => {
        if (alive) setState("ready");
      })
      .catch(() => {
        if (alive) setState("login");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onSignedOut = () => {
      invalidateAdmin();
      setState("login");
    };
    window.addEventListener("devopslife:admin-signed-out", onSignedOut);
    return () => window.removeEventListener("devopslife:admin-signed-out", onSignedOut);
  }, []);

  const signOut = () => {
    invalidateAdmin();
    setState("login");
  };

  if (state === "checking") {
    return (
      <div className="flex min-h-[100dvh] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <LogoLoader size={56} />
          <p className="type-caption">Checking this session</p>
        </div>
      </div>
    );
  }

  if (state === "login") {
    // No session: the name page opens with the restricted-area alert on top.
    return <Navigate to="/play" replace state={{ adminGate: true }} />;
  }

  return <Outlet context={{ signOut }} />;
}