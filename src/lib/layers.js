/**
 * One stacking order for the admin, written as literal classes so Tailwind
 * keeps them: page content sits under the sticky bar, the sidebar above it,
 * and every overlay far above both.
 */
export const LAYER = {
  content: "z-[1]",
  topBar: "z-20",
  sidebar: "z-30",
  overlay: "z-[1000]",
  modal: "z-[1010]",
  toast: "z-[1100]",
};