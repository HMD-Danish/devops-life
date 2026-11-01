/**
 * The mark for the intro: the black disc stays still while the artwork on it
 * turns once. Same assets as the app's own logo, nothing recolored.
 */
export default function IntroLogomark({ logoDelay = 0.6, spinDelay = 1.05 }) {
  return (
    <span
      className="logo-glass-ring intro-logomark p-3.5 sm:p-4"
      style={{ "--intro-logo-delay": `${logoDelay}s`, "--intro-spin-delay": `${spinDelay}s` }}
    >
      <span className="intro-disc logo-mark">
        <img src="/icons/logo-art-480.png" alt="" aria-hidden="true" draggable={false} className="intro-art" />
      </span>
    </span>
  );
}