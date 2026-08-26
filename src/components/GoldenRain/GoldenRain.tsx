const rainPaths = Array.from({ length: 32 }, (_, index) => {
  const startX = -1120 + index * 98;

  return `M ${startX} -430 C ${startX + 170} -35, ${startX + 570} 235, ${startX + 1010} 1130`;
});

function GoldenRain() {
  return (
    <div className="golden-rain" aria-hidden="true">
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
      >
        <g className="golden-rain__lines">
          {rainPaths.map((path, index) => (
            <path key={`line-${index}`} d={path} />
          ))}
        </g>

        <g className="golden-rain__streams">
          {rainPaths.filter((_, index) => index % 2 === 0).map((path, index) => (
            <path
              key={`stream-${index}`}
              d={path}
              pathLength="1"
              style={{
                animationDelay: `${-(index * 0.73)}s`,
                animationDuration: `${6.4 + (index % 5) * 0.55}s`,
              }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

export default GoldenRain;
