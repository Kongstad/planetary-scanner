import Panel from './Panel.tsx'
import type { BodyId } from './reference.ts'
import { IS_STATIC_DEMO } from './runtime.ts'

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

function ScienceComputer({
  bodyId,
  scienceComputerQualifier,
  query,
  retrievalStatus,
  groundedAnswer,
  isRetrieving,
  queryElapsedSeconds,
  lastQueryElapsedSeconds,
  onQueryChange,
  onSubmit,
}: ScienceComputerProps & { bodyId: BodyId }) {
  if (IS_STATIC_DEMO) return null
  const queryId = `${bodyId}-query`
  return (
    <Panel title="SCIENCE COMPUTER" qualifier={scienceComputerQualifier}>
      <div className="science-computer" aria-live="polite">
        <div className="message">
          <span>
            RETRIEVAL
            {isRetrieving
              ? ` · ${queryElapsedSeconds.toFixed(1)} s`
              : lastQueryElapsedSeconds !== null
                ? ` · COMPLETE ${lastQueryElapsedSeconds.toFixed(1)} s`
                : ''}
          </span>
          <p>{retrievalStatus}</p>
        </div>
        {groundedAnswer && (
          <div className="grounded-answer">
            <span>ANSWER</span>
            <p>{groundedAnswer}</p>
          </div>
        )}
      </div>
      <form className="query-form" onSubmit={onSubmit}>
        <label htmlFor={queryId}>&gt;</label>
        <input
          id={queryId}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Ask about Earth, Mars, the Moon, or the Sun..."
        />
        <button type="submit" disabled={isRetrieving}>
          {isRetrieving ? 'SEARCHING' : 'QUERY'}
        </button>
      </form>
    </Panel>
  )
}

export default ScienceComputer
