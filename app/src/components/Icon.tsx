import { createElement } from 'react'
import type { AriaAttributes } from 'react'

// Thin wrapper over the Iconify web component (loaded in index.html).
// Uses createElement so the custom element and its `class` attribute
// don't require JSX intrinsic typings.
//
// ARIA attributes are spread through: without this every `aria-hidden` and
// `aria-label` passed to an <Icon> is silently dropped, and decorative icons
// are exposed to screen readers.
type IconProps = { icon: string; className?: string; width?: number | string } & AriaAttributes

export default function Icon({ icon, className = '', width, ...aria }: IconProps) {
  return createElement('iconify-icon', { icon, class: className, width, ...aria } as any)
}
