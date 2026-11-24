// No client code here: a server page's link can take a button's classes.

/** chain: the one action that goes to the chain. icon: round, as wide as high. Each size has one height, so a row lines up. */
const VARIANTS = { primary: "btn--main", secondary: "btn--ghost", gold: "btn--gold", chain: "btn--save", chip: "btn--chip", icon: "btn--ghost btn--icon" };
const SIZES = { l: "", m: "btn--m", s: "btn--s" };
export type ButtonLook = { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES };
/** A button's classes, then className. */
export const buttonClass = ({ variant = "secondary", size = "l" }: ButtonLook, className = "") => ["btn", VARIANTS[variant], SIZES[size], className].filter(Boolean).join(" ");
