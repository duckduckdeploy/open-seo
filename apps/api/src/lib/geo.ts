export type GridPoint = { row: number; col: number; lat: number; lng: number };

const METRES_PER_DEGREE_LAT = 111_320;

// size x size points centred on (lat, lng), spaced `spacingM` metres apart. Row 0 is the northern edge.
export function buildGrid(lat: number, lng: number, size: number, spacingM: number): GridPoint[] {
  const half = (size - 1) / 2;
  const metresPerDegreeLng = METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
  const points: GridPoint[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      points.push({
        row,
        col,
        lat: round6(lat + ((half - row) * spacingM) / METRES_PER_DEGREE_LAT),
        lng: round6(lng + ((col - half) * spacingM) / metresPerDegreeLng),
      });
    }
  }
  return points;
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;
