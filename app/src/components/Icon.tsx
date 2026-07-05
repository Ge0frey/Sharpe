import { createElement } from 'react'

// Thin wrapper over the Iconify web component (loaded in index.html).
// Uses createElement so the custom element and its `class` attribute
// don't require JSX intrinsic typings.
export default function Icon({ icon, className = '', width }: { icon: string; className?: string; width?: number | string }) {
  return createElement('iconify-icon', { icon, class: className, width } as any)
}
