import { useEffect, useRef, useState } from 'react'
import { IS_STATIC_DEMO, publicAssetUrl } from './runtime.ts'

export type SolViewerMode = 'visible' | 'euv' | 'chromosphere' | 'magnetic'
export type SolarTelemetry = {
  observedAt: string
  instrument: string
  resolution: string
}
type Observation = {
  id: number
  date: string
  name: string
  width: number
  height: number
  scale: number
  imageUrl?: string
}

type ViewerProps = {
  mode: SolViewerMode
  onObservationChange: (value: SolarTelemetry) => void
}

function SolarObservationView({
  mode,
  requestedDate,
  onObservationChange,
}: ViewerProps & { requestedDate: string }) {
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    x: number
    y: number
    panX: number
    panY: number
  } | null>(null)
  const [observation, setObservation] = useState<Observation | null>(null)
  const [imageRetry, setImageRetry] = useState(0)
  const [status, setStatus] = useState('LOADING SOLAR OBSERVATION')
  const [imageReady, setImageReady] = useState(false)
  const [size, setSize] = useState({ width: 600, height: 600 })
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    observer.observe(element)
    const preventScroll = (event: WheelEvent) => event.preventDefault()
    element.addEventListener('wheel', preventScroll, { passive: false })
    return () => {
      observer.disconnect()
      element.removeEventListener('wheel', preventScroll)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    onObservationChange({
      observedAt: 'LOADING',
      instrument: 'SDO',
      resolution: 'NATIVE IMAGE',
    })
    const parameters = new URLSearchParams({ layer: mode })
    if (requestedDate) parameters.set('date', `${requestedDate}:00Z`)
    void fetch(
      IS_STATIC_DEMO
        ? publicAssetUrl('demo/solar/observations.json')
        : `/imagery/sol/observation?${parameters}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('Solar archive unavailable')
        const data = await response.json()
        return IS_STATIC_DEMO
          ? (data as { observations: Record<SolViewerMode, Observation> })
              .observations[mode]
          : (data as Observation)
      })
      .then((value) => {
        if (controller.signal.aborted) return
        setObservation(value)
        onObservationChange({
          observedAt: `${value.date.replace('T', ' ')} UTC`,
          instrument: value.name,
          resolution: `${value.scale.toFixed(2)} ARCSEC / PX`,
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus('SOLAR ARCHIVE UNAVAILABLE · RETRY OR CHANGE DATE')
          onObservationChange({
            observedAt: 'UNAVAILABLE',
            instrument: 'SDO',
            resolution: 'UNAVAILABLE',
          })
        }
      })
    return () => controller.abort()
  }, [mode, requestedDate, imageRetry, onObservationChange])

  const baseSize = Math.min(size.width, size.height) * 0.94
  const maximumZoom = observation
    ? Math.max(1, observation.width / baseSize)
    : 8
  const zoomBy = (factor: number, anchorX = 0, anchorY = 0) => {
    setView((previous) => {
      const zoom = Math.max(1, Math.min(maximumZoom, previous.zoom * factor))
      const ratio = zoom / previous.zoom
      return {
        zoom,
        x: anchorX - (anchorX - previous.x) * ratio,
        y: anchorY - (anchorY - previous.y) * ratio,
      }
    })
  }

  return (
    <div className="sol-viewer__content">
      <div
        ref={viewport}
        className="sol-viewer__viewport"
        role="region"
        aria-label="Zoomable solar observation. Drag to pan, scroll to zoom, or use the controls."
        tabIndex={0}
        onWheel={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          zoomBy(
            event.deltaY < 0 ? 1.15 : 1 / 1.15,
            event.clientX - bounds.left - bounds.width / 2,
            event.clientY - bounds.top - bounds.height / 2,
          )
        }}
        onKeyDown={(event) => {
          if (
            [
              '+',
              '=',
              '-',
              '0',
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
            ].includes(event.key)
          )
            event.preventDefault()
          if (event.key === '+' || event.key === '=') zoomBy(1.25)
          if (event.key === '-') zoomBy(0.8)
          if (event.key === '0') setView({ zoom: 1, x: 0, y: 0 })
          const dx =
            event.key === 'ArrowLeft'
              ? 40
              : event.key === 'ArrowRight'
                ? -40
                : 0
          const dy =
            event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0
          if (dx || dy)
            setView((previous) => ({
              ...previous,
              x: previous.x + dx,
              y: previous.y + dy,
            }))
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            panX: view.x,
            panY: view.y,
          }
        }}
        onPointerMove={(event) => {
          const start = drag.current
          if (start)
            setView((previous) => ({
              ...previous,
              x: start.panX + event.clientX - start.x,
              y: start.panY + event.clientY - start.y,
            }))
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
      >
        {observation && (
          <img
            key={`${observation.id}-${imageRetry}`}
            className="sol-viewer__image"
            alt={`${observation.name} solar disk observed ${observation.date} UTC`}
            draggable={false}
            src={
              observation.imageUrl
                ? publicAssetUrl(observation.imageUrl)
                : `https://api.helioviewer.org/v2/downloadImage/?id=${observation.id}&width=4096&type=jpg`
            }
            style={{
              width: baseSize,
              height: (baseSize * observation.height) / observation.width,
              transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
              opacity: imageReady ? 1 : 0,
            }}
            onLoad={() => {
              setImageReady(true)
              setStatus('')
            }}
            onError={() => {
              setImageReady(false)
              setStatus('SOLAR IMAGE UNAVAILABLE · RETRY OR CHANGE DATE')
            }}
          />
        )}
      </div>
      <div className="sol-viewer__controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(0.8)}>
          −
        </button>
        <button type="button" onClick={() => setView({ zoom: 1, x: 0, y: 0 })}>
          RESET
        </button>
        <span>{view.zoom.toFixed(1)}×</span>
      </div>
      {status && (
        <div className="sol-viewer__status" role="status">
          {status}
          {status.includes('UNAVAILABLE') && (
            <button
              type="button"
              onClick={() => {
                setStatus('LOADING SOLAR OBSERVATION')
                setImageRetry((previous) => previous + 1)
              }}
            >
              RETRY
            </button>
          )}
        </div>
      )}
      <div className="sol-viewer__credit">
        NASA / SDO · HELIOVIEWER ·{' '}
        {mode === 'euv'
          ? 'AIA 171 Å · FALSE COLOR'
          : mode === 'chromosphere'
            ? 'AIA 304 Å · FALSE COLOR'
            : mode === 'magnetic'
              ? 'HMI · LINE-OF-SIGHT FIELD'
              : 'HMI · VISIBLE CONTINUUM'}
      </div>
    </div>
  )
}

function SolViewer({ mode, onObservationChange }: ViewerProps) {
  const [requestedDate, setRequestedDate] = useState('')
  const [retry, setRetry] = useState(0)
  return (
    <div className="sol-viewer">
      <SolarObservationView
        key={`${mode}-${requestedDate}-${retry}`}
        mode={mode}
        requestedDate={requestedDate}
        onObservationChange={onObservationChange}
      />
      <div className="sol-viewer__toolbar">
        {IS_STATIC_DEMO ? (
          <span>SDO ARCHIVE SNAPSHOT · PAN / ZOOM</span>
        ) : (
          <>
            <label>
              OBSERVATION · UTC
              <input
                aria-label="Solar observation date in UTC"
                type="datetime-local"
                value={requestedDate}
                min="2010-05-01T00:00"
                max={new Date().toISOString().slice(0, 16)}
                onChange={(event) => setRequestedDate(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setRequestedDate('')
                setRetry((previous) => previous + 1)
              }}
            >
              LATEST
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default SolViewer
