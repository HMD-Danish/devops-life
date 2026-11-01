import { playPath } from "@/lib/testMode";

/** The name page is the app's home. Every Back control and the logo land here. */
export const NAME_PAGE = "/play";

export function goToNamePage(navigate) {
  navigate(playPath(""), { replace: true });
}

/** True only on the name page itself, with or without a trailing slash. */
export function isNamePage(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === NAME_PAGE || path === playPath("");
}