import { useEffect, useRef } from 'react'
import Panel from './Panel.tsx'
import type { BodyId } from './reference.ts'
import { IS_STATIC_DEMO } from './runtime.ts'

export type ScienceComputerExchange = {
  id: number
  question: string
  answer: string | null
  error: string | null
}

export type ScienceComputerProps = {
  scienceComputerQualifier: string
  query: string
  retrievalStatus: string
  conversation: ScienceComputerExchange[]
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
  conversation,
  isRetrieving,
  queryElapsedSeconds,
  lastQueryElapsedSeconds,
  onQueryChange,
  onSubmit,
}: ScienceComputerProps & { bodyId: BodyId }) {
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight
  }, [conversation])

  const queryId = `${bodyId}-query`
  return (
    <Panel title="SCIENCE COMPUTER" qualifier={scienceComputerQualifier}>
      <div
        className="science-computer"
        ref={log}
        role="log"
        aria-label="Science computer conversation"
        aria-live="polite"
      >
        <div className="message">
          <span>
            STATUS
            {isRetrieving
              ? ` · ${queryElapsedSeconds.toFixed(1)} s`
              : lastQueryElapsedSeconds !== null
                ? ` · COMPLETE ${lastQueryElapsedSeconds.toFixed(1)} s`
                : ''}
          </span>
          <p>
            {IS_STATIC_DEMO
              ? 'Answer generation is offline in this viewer demo. Run the project locally to use the LLM, encoder, and RAG pipeline.'
              : retrievalStatus}
          </p>
        </div>
        {conversation.map((entry) => (
          <div className="science-exchange" key={entry.id}>
            <div className="message">
              <span>Query:</span>
              <p>{entry.question}</p>
            </div>
            <div className="grounded-answer">
              <span>{entry.error ? 'Error:' : 'Answer:'}</span>
              <p>
                {entry.answer ??
                  entry.error ??
                  'Retrieving records and generating an answer...'}
              </p>
            </div>
          </div>
        ))}
      </div>
      <form className="query-form" onSubmit={onSubmit}>
        <label htmlFor={queryId}>&gt;</label>
        <input
          id={queryId}
          value={query}
          disabled={IS_STATIC_DEMO}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Ask about Earth, Mars, the Moon, or the Sun..."
        />
        <button type="submit" disabled={IS_STATIC_DEMO || isRetrieving}>
          {IS_STATIC_DEMO ? 'OFFLINE' : isRetrieving ? 'SEARCHING' : 'QUERY'}
        </button>
      </form>
    </Panel>
  )
}

export default ScienceComputer
