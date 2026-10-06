import type { ReactNode } from 'react'

type PanelProps = {
  title: string
  qualifier: string
  children: ReactNode
  className?: string
}

function Panel({ title, qualifier, children, className }: PanelProps) {
  return (
    <section className={className ? `panel ${className}` : 'panel'}>
      <header className="panel__header">
        <span>{title}</span>
        <span>{qualifier}</span>
      </header>
      <div className="panel__body">{children}</div>
    </section>
  )
}

export default Panel
