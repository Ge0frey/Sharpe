import type { ComponentType } from 'react'
import { GETTING_STARTED } from './sections/getting-started'
import { CONCEPTS } from './sections/concepts'
import { GUIDE } from './sections/guide'
import { PROGRAM } from './sections/program'
import { REFERENCE } from './sections/reference'

export type DocPage = {
  slug: string
  group: string
  title: string
  description: string
  body: ComponentType
}

/** Flat, in reading order — the sidebar groups by `group`, prev/next walks this array. */
export const DOC_PAGES: DocPage[] = [...GETTING_STARTED, ...CONCEPTS, ...GUIDE, ...PROGRAM, ...REFERENCE]

export const DOC_GROUPS = DOC_PAGES.reduce<{ group: string; pages: DocPage[] }[]>((acc, p) => {
  const g = acc.find((x) => x.group === p.group)
  if (g) g.pages.push(p)
  else acc.push({ group: p.group, pages: [p] })
  return acc
}, [])

export const DEFAULT_SLUG = 'overview'
