type ElevationProfileProps = {
  heading: string
  qualifier: string
  description: string
  heights: number[]
  labels: [string, string]
  axis: [string, string, string]
  className?: string
}
function ElevationProfile({
  heading,
  qualifier,
  description,
  heights,
  labels,
  axis,
  className = '',
}: ElevationProfileProps) {
  return (
    <div
      className={`mars-elevation-profile ${className}`}
      role="img"
      aria-label={description}
    >
      <div className="mars-elevation-profile__heading">
        <span>{heading}</span>
        <strong>{qualifier}</strong>
      </div>
      <div className="mars-elevation-profile__bars">
        {heights.map((height, index) => (
          <i key={index} style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className="mars-elevation-profile__labels">
        <span>{labels[0]}</span>
        <span>{labels[1]}</span>
      </div>
      <div className="mars-elevation-profile__axis">
        {axis.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  )
}

export default ElevationProfile
