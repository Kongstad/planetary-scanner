export type ScienceComputerProps = {
  scienceComputerQualifier: string
  query: string
  retrievalStatus: string
  groundedAnswer: string | null
  isRetrieving: boolean
  queryElapsedSeconds: number
  lastQueryElapsedSeconds: number | null
  onQueryChange: (query: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

function ScienceComputer({ bodyId, scienceComputerQualifier, query, retrievalStatus, groundedAnswer, isRetrieving, queryElapsedSeconds, lastQueryElapsedSeconds, onQueryChange, onSubmit }: ScienceComputerProps & { bodyId: 'earth' | 'mars' | 'luna' }) {
  const queryId = `${bodyId}-query`
  return (
    <section className="panel">
      <header className="panel__header"><span>SCIENCE COMPUTER</span><span>{scienceComputerQualifier}</span></header>
      <div className="panel__body">
        <div className="science-computer" aria-live="polite">
          <div className="message"><span>RETRIEVAL{isRetrieving ? ` · ${queryElapsedSeconds.toFixed(1)} s` : lastQueryElapsedSeconds !== null ? ` · COMPLETE ${lastQueryElapsedSeconds.toFixed(1)} s` : ''}</span><p>{retrievalStatus}</p></div>
          {groundedAnswer && <div className="grounded-answer"><span>ANSWER</span><p>{groundedAnswer}</p></div>}
        </div>
        <form className="query-form" onSubmit={onSubmit}>
          <label htmlFor={queryId}>&gt;</label>
          <input id={queryId} value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Ask about Earth, Mars, or the Moon..." />
          <button type="submit" disabled={isRetrieving}>{isRetrieving ? 'SEARCHING' : 'QUERY'}</button>
        </form>
      </div>
    </section>
  )
}

export default ScienceComputer
