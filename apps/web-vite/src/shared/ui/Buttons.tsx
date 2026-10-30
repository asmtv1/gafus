import type {
  AnchorHTMLAttributes,
  ComponentPropsWithRef,
  MouseEvent,
  ReactNode,
} from "react";
import { navigate, routeForPath } from "../router/location";

import primary from "./PrimaryButton.module.css";
import secondary from "./SecondaryButton.module.css";
import caramel from "./CaramelButtonLink.module.css";
import "./ButtonsViteParity.css";

type ButtonProps = ComponentPropsWithRef<"button"> & {
  children: ReactNode;
};
type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
};

/**
 * Vite equivalent of Next's Link: keep SPA transitions for registered plain
 * local paths, preserving browser behavior for external URLs, query strings,
 * download links and modified clicks.
 */
function ButtonLink({ href, children, className, onClick, ...props }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey ||
        event.metaKey || event.shiftKey || event.altKey ||
        props.target && props.target !== "_self" || props.download !== undefined ||
        !href.startsWith("/") || href.startsWith("//") ||
        href.includes("?") || href.includes("#")) return;
    const route = routeForPath(href);
    if (route === null) return;
    event.preventDefault();
    navigate(route);
  }

  return <a {...props} href={href} className={className} onClick={handleClick}>{children}</a>;
}

export const primaryButtonClassName = "gafus-primary-button";

function primaryClass(
  className: string | undefined,
  fullWidth: boolean,
  size: "regular" | "large",
) {
  return [
    primary.root, primaryButtonClassName,
    fullWidth ? primary.fullWidth : undefined,
    size === "large" ? primary.large : undefined,
    className,
  ].filter(Boolean).join(" ");
}

type PrimaryProps = ButtonProps & {
  fullWidth?: boolean;
  size?: "regular" | "large";
};
type PrimaryLinkProps = LinkProps & {
  fullWidth?: boolean;
  size?: "regular" | "large";
};

/** Original shared olive CTA, identical skin to the retained Next component. */
export function PrimaryButton({
  children, className, fullWidth = false, size = "regular", type = "button", ...props
}: PrimaryProps) {
  return <button {...props} data-gafus-shared-button="primary" data-gafus-size={size}
    className={primaryClass(className, fullWidth, size)} type={type}>
    {children}
  </button>;
}

export function PrimaryButtonLink({
  children, className, fullWidth = false, size = "regular", ...props
}: PrimaryLinkProps) {
  return <ButtonLink {...props} data-gafus-shared-button="primary" data-gafus-size={size}
    className={primaryClass(className, fullWidth, size)}>
    {children}
  </ButtonLink>;
}

function secondaryClass(
  className: string | undefined,
  fullWidth: boolean,
  variant: "default" | "red",
) {
  return [
    secondary.root,
    variant === "red" ? secondary.red : undefined,
    fullWidth ? secondary.fullWidth : undefined,
    className,
  ].filter(Boolean).join(" ");
}

type SecondaryProps = ButtonProps & {
  fullWidth?: boolean;
  variant?: "default" | "red";
};
type SecondaryLinkProps = LinkProps & {
  fullWidth?: boolean;
  variant?: "default" | "red";
};

/** Original secondary action. variant="red" is the shared red/destructive CTA. */
export function SecondaryButton({
  children, className, fullWidth = false, variant = "default",
  type = "button", ...props
}: SecondaryProps) {
  return <button {...props} data-gafus-shared-button="secondary" data-gafus-variant={variant}
    className={secondaryClass(className, fullWidth, variant)} type={type}>
    {children}
  </button>;
}

export function SecondaryButtonLink({
  children, className, fullWidth = false, variant = "default", ...props
}: SecondaryLinkProps) {
  return <ButtonLink {...props} data-gafus-shared-button="secondary" data-gafus-variant={variant}
    className={secondaryClass(className, fullWidth, variant)}>
    {children}
  </ButtonLink>;
}

/** Shared violet edit action. Not a one-off question-page color override. */
export function PurpleButton({
  children, className, type = "button", ...props
}: ButtonProps) {
  return <button {...props} data-gafus-shared-button="purple"
    className={["gafus-purple-button", className].filter(Boolean).join(" ")}
    type={type}>{children}</button>;
}

/** Original caramel/orange action for editing and secondary highlighted actions. */
export function CaramelButton({
  children, className, type = "button", ...props
}: ButtonProps) {
  return <button {...props} data-gafus-shared-button="caramel"
    className={[caramel.root, className].filter(Boolean).join(" ")}
    type={type}>{children}</button>;
}

export function CaramelButtonLink({ children, className, ...props }: LinkProps) {
  return <ButtonLink {...props} data-gafus-shared-button="caramel"
    className={[caramel.root, className].filter(Boolean).join(" ")}>
    {children}
  </ButtonLink>;
}
