import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import RestrictedAlertModal from "@/components/admin/RestrictedAlertModal";
import { NAME_PAGE } from "@/lib/namePage";

const AdminGateContext = createContext(null);

export function useAdminGate() {
  const context = useContext(AdminGateContext);
  if (!context) throw new Error("useAdminGate must be used inside AdminGateProvider");
  return context;
}

/**
 * The one restricted-area alert for the whole app. A direct visit to /admin
 * opens it; it grants nothing by itself — the password is checked on the
 * server and the session lives in its own token.
 *
 * Nothing here renders an admin control on a player screen. The one way in from
 * the player app is the quiet Admin item on the name page, which calls openGate.
 */
export function AdminGateProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);

  // A protected URL without a session arrives here with this flag set.
  const forced = Boolean(location.state?.adminGate);
  const isOpen = open || forced;

  const openGate = useCallback(() => {
    trigger.current = document.activeElement;
    setOpen(true);
  }, []);

  const closeGate = useCallback(() => {
    setOpen(false);
    if (forced) navigate(location.pathname || NAME_PAGE, { replace: true, state: null });
    requestAnimationFrame(() => trigger.current?.focus?.());
  }, [forced, navigate, location.pathname]);

  const signedIn = useCallback(() => {
    trigger.current = null;
    setOpen(false);
    navigate("/admin", { replace: true });
  }, [navigate]);

  const value = useMemo(() => ({ openGate, closeGate, signedIn }), [openGate, closeGate, signedIn]);

  return (
    <AdminGateContext.Provider value={value}>
      {children}
      {isOpen ? <RestrictedAlertModal onClose={closeGate} onSignedIn={signedIn} /> : null}
    </AdminGateContext.Provider>
  );
}