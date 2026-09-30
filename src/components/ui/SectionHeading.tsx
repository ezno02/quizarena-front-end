import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type SectionHeadingProps = {
  icon: LucideIcon
  children: ReactNode
  actionLabel?: string
}

export function SectionHeading({ icon: Icon, children, actionLabel }: SectionHeadingProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Icon size={17} className="text-cyan" strokeWidth={2.2} />
        <h2 className="text-[14px] font-bold tracking-wide text-slate-100">{children}</h2>
      </div>
      {actionLabel && (
        <button className="section-action" type="button">
          {actionLabel}
        </button>
      )}
    </div>
  )
}
