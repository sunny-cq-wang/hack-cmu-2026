/**
 * Arc that drains as the 20 s recording limit approaches.
 */
import Svg, { Circle } from 'react-native-svg';

interface CountdownRingProps {
  size: number;
  progress: number; // 0 = just started, 1 = limit reached
  stroke?: number;
}

export function CountdownRing({ size, progress, stroke = 3 }: CountdownRingProps): React.JSX.Element {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const remaining = Math.max(0, Math.min(1, 1 - progress));

  return (
    <Svg width={size} height={size} style={{ position: 'absolute' }}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(255,255,255,0.25)"
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#fff"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - remaining)}
        strokeLinecap="round"
        // Start the sweep at 12 o'clock.
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}
